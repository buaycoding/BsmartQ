const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const router = express.Router();
const COOKIE_NAME = 'bsmartq_session';
const JWT_SECRET = process.env.JWT_SECRET || 'bsmartq-local-dev-secret';
const ADMIN_EMAIL = 'buay@admin.com';
const ADMIN_PASSWORD = 'buay102026';

let dbPool = null;

// Initialize auth module with database pool
function initializeAuth(pool) {
  dbPool = pool;
}

// Create users table and seed admin if needed
async function initializeAuthTable() {
  if (!dbPool) {
    console.warn('⚠️ Database pool not initialized for auth');
    return;
  }

  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        tenant_id TEXT NOT NULL DEFAULT 'tenant-default-001',
        tenant_name TEXT,
        branch_id TEXT,
        organization_name TEXT,
        invited_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on email for faster lookups
    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Seed admin user if not exists
    const adminExists = await dbPool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizeEmail(ADMIN_EMAIL)]
    );

    if (adminExists.rows.length === 0) {
      const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);
      await dbPool.query(
        `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          'admin-001',
          'System Admin',
          normalizeEmail(ADMIN_EMAIL),
          hashedPassword,
          'admin',
          'tenant-default-001',
          'Main Downtown Branch',
          'branch-main-downtown',
        ]
      );
      console.log('✅ Admin user seeded to PostgreSQL');
    }

    console.log('✅ Auth table initialized in PostgreSQL');
  } catch (error) {
    console.error('❌ Failed to initialize auth table:', error.message);
  }
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function generateTemporaryPassword() {
  return `Q${Math.random().toString(36).slice(2, 8).toUpperCase()}!`;
}

async function createWorkspaceInvite({ inviter, email, name, role = 'counter' }) {
  if (!dbPool) {
    throw new Error('Database not initialized');
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = ['counter', 'staff'].includes(String(role).toLowerCase()) ? String(role).toLowerCase() : 'counter';

  if (!normalizedEmail || !String(name || '').trim()) {
    throw new Error('Please provide the team member name and email address.');
  }

  if (normalizedEmail === normalizeEmail(ADMIN_EMAIL)) {
    throw new Error('The admin account is reserved for system use only.');
  }

  // Check if user exists
  const existingUser = await dbPool.query(
    'SELECT id FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    throw new Error('An account with this email already exists.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await dbPool.query(
    `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, organization_name, invited_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     RETURNING *`,
    [
      userId,
      String(name).trim(),
      normalizedEmail,
      bcrypt.hashSync(temporaryPassword, 12),
      normalizedRole,
      inviter.tenant_id || 'tenant-default-001',
      inviter.tenant_name || inviter.organizationName || 'Workspace',
      inviter.branch_id || 'branch-main-downtown',
      inviter.organizationName || inviter.tenant_name || 'Workspace',
      inviter.email,
    ]
  );

  const invitedUser = result.rows[0];
  return { user: invitedUser, temporaryPassword };
}

async function listWorkspaceMembers(tenantId) {
  if (!dbPool) {
    return [];
  }

  const result = await dbPool.query(
    'SELECT id, name, email, role, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );

  return result.rows;
}

async function resetAuthStore() {
  if (!dbPool) {
    console.warn('Database not initialized');
    return;
  }

  try {
    // Delete all users
    await dbPool.query('DELETE FROM users');

    // Re-seed admin
    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    await dbPool.query(
      `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        'admin-001',
        'System Admin',
        normalizeEmail(ADMIN_EMAIL),
        hashedPassword,
        'admin',
        'tenant-default-001',
        'Main Downtown Branch',
        'branch-main-downtown',
      ]
    );

    console.log('✅ Auth store reset in PostgreSQL');
  } catch (error) {
    console.error('❌ Failed to reset auth store:', error.message);
  }
}

function parseCookies(headerValue = '') {
  return headerValue
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const [name, ...rest] = entry.split('=');
      acc[name] = decodeURIComponent(rest.join('='));
      return acc;
    }, {});
}

function createSignedToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch (error) {
      return null;
    }
  }

  return null;
}

function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const verified = verifySignedToken(token);
  if (!verified) return null;

  // Store verified token data in request for use in middleware
  req.verifiedUser = verified;
  return verified; // Return verified token data, actual user will be fetched from DB in middleware
}

function setSessionCookie(res, user) {
  const token = createSignedToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id || user.tenantId,
    iat: Math.floor(Date.now() / 1000),
  });

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }

  next();
}

function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login');
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).render('dashboard', {
        title: 'BsmartQ | Access Denied',
        user: req.user,
        error: 'You do not have permission to access this workspace area.',
      });
    }

    next();
  };
}

router.get('/login', (req, res) => {
  res.render('auth/login', {
    title: 'BsmartQ | Sign In',
    error: null,
    notice: req.query.registered === '1' ? 'Account created. Please sign in with your new credentials.' : null,
    user: req.user || null,
  });
});

router.use((req, res, next) => {
  if (typeof res.locals.notice === 'undefined') {
    res.locals.notice = null;
  }
  next();
});

router.post('/login', async (req, res) => {
  if (!dbPool) {
    return res.status(500).render('auth/login', {
      title: 'BsmartQ | Sign In',
      error: 'Database connection unavailable.',
      notice: null,
      user: req.user || null,
    });
  }

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  try {
    const result = await dbPool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).render('auth/login', {
        title: 'BsmartQ | Sign In',
        error: 'Invalid email or password.',
        notice: null,
        user: req.user || null,
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).render('auth/login', {
        title: 'BsmartQ | Sign In',
        error: 'Invalid email or password.',
        notice: null,
        user: req.user || null,
      });
    }

    setSessionCookie(res, user);
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).render('auth/login', {
      title: 'BsmartQ | Sign In',
      error: 'An error occurred during login. Please try again.',
      notice: null,
      user: req.user || null,
    });
  }
});

router.get('/register', (req, res) => {
  res.render('auth/register', {
    title: 'BsmartQ | Create Account',
    error: null,
    user: req.user || null,
  });
});

router.post('/register', async (req, res) => {
  if (!dbPool) {
    return res.status(500).render('auth/register', {
      title: 'BsmartQ | Create Account',
      error: 'Database connection unavailable.',
      user: req.user || null,
    });
  }

  const rawBody = req.body && typeof req.body === 'object' ? req.body : {};
  const body = typeof rawBody === 'object' && Object.keys(rawBody).length ? rawBody : {};
  const name = String(body.name || '').trim();
  const organizationName = String(body.organizationName || '').trim();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const normalizedEmail = normalizeEmail(email);

  if (!name || !organizationName || !email || !password || !confirmPassword) {
    return res.status(400).render('auth/register', {
      title: 'BsmartQ | Create Account',
      error: 'Please complete every field before creating the account.',
      user: req.user || null,
    });
  }

  if (password.length < 8) {
    return res.status(400).render('auth/register', {
      title: 'BsmartQ | Create Account',
      error: 'Password must be at least 8 characters long.',
      user: req.user || null,
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).render('auth/register', {
      title: 'BsmartQ | Create Account',
      error: 'Passwords do not match.',
      user: req.user || null,
    });
  }

  if (normalizedEmail === normalizeEmail(ADMIN_EMAIL)) {
    return res.status(403).render('auth/register', {
      title: 'BsmartQ | Create Account',
      error: 'The admin account is reserved for system use only.',
      user: req.user || null,
    });
  }

  try {
    // Check if user already exists
    const existingUser = await dbPool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).render('auth/register', {
        title: 'BsmartQ | Create Account',
        error: 'An account with this email already exists.',
        user: req.user || null,
      });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = `user-${Date.now()}`;

    await dbPool.query(
      `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, organization_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        userId,
        String(name).trim(),
        normalizedEmail,
        hashedPassword,
        'staff',
        'tenant-default-001',
        organizationName,
        'branch-main-downtown',
        organizationName,
      ]
    );

    res.redirect('/login?registered=1');
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).render('auth/register', {
      title: 'BsmartQ | Create Account',
      error: 'An error occurred during registration. Please try again.',
      user: req.user || null,
    });
  }
});

router.post('/invite', requireAuth, async (req, res) => {
  try {
    const result = await createWorkspaceInvite({
      inviter: req.user,
      email: req.body?.email,
      name: req.body?.name,
      role: req.body?.role,
    });

    const members = await listWorkspaceMembers(req.user.tenant_id);

    return res.render('dashboard', {
      title: 'BsmartQ | Dashboard',
      user: req.user,
      error: null,
      notice: `Invited ${result.user.name} to your workspace. Temporary password: ${result.temporaryPassword}`,
      inviteMembers: members,
    });
  } catch (error) {
    const members = await listWorkspaceMembers(req.user.tenant_id);
    return res.render('dashboard', {
      title: 'BsmartQ | Dashboard',
      user: req.user,
      error: error.message,
      notice: null,
      inviteMembers: members,
    });
  }
});

router.get('/logout', (req, res) => {
  clearSessionCookie(res);
  res.redirect('/login');
});

router.get('/dashboard', requireAuth, async (req, res) => {
  const members = await listWorkspaceMembers(req.user.tenant_id);
  res.render('dashboard', {
    title: 'BsmartQ | Dashboard',
    user: req.user,
    error: null,
    notice: null,
    inviteMembers: members,
  });
});

router.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.render('admin', {
    title: 'BsmartQ | Admin Console',
    user: req.user,
  });
});

module.exports = {
  router,
  initializeAuth,
  initializeAuthTable,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireRole,
  createWorkspaceInvite,
  listWorkspaceMembers,
  resetAuthStore,
};
