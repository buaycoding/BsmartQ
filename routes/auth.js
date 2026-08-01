const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  sendEmailNotification,
  sendBookingEmail,
  sendBookingConfirmationEmail,
  sendAppointmentReminderEmail,
  sendQueueUpdateEmail,
  sendPaymentReceiptEmail,
  sendPasswordResetEmail,
  sendCustomerInvitationEmail,
  sendStaffInvitationEmail,
  sendEmailVerificationEmail,
  sendBookingConfirmationSms,
  sendAppointmentReminderSms,
  sendPaymentConfirmationSms,
} = require('../lib/notifications');

const router = express.Router();
const COOKIE_NAME = 'bsmartq_session';
const JWT_SECRET = process.env.JWT_SECRET || 'bsmartq-local-dev-secret';
const ADMIN_EMAIL = 'buay@admin.com';
const ADMIN_PASSWORD = 'buay102026';

let dbPool = null;

const clientDashboardState = {
  bookings: [],
  preferences: {
    email: true,
    sms: true,
    reminders: true,
  },
  notifications: [
    { id: 1, title: 'Queue update', body: 'Your truck is now 2 slots away.', unread: true },
    { id: 2, title: 'Booking reminder', body: 'Your next booking is tomorrow at 09:00.', unread: false },
  ],
};

// Initialize auth module with database pool
function initializeAuth(pool) {
  dbPool = pool;
}

async function ensureUsersTableSchema() {
  if (!dbPool) {
    return;
  }

  try {
    const columnResult = await dbPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
    `);

    const existingColumns = new Set(
      columnResult.rows.map((row) => String(row.column_name).toLowerCase())
    );

    const columnDefinitions = [
      ['is_active', 'BOOLEAN NOT NULL DEFAULT TRUE'],
      ['is_approved', 'BOOLEAN NOT NULL DEFAULT TRUE'],
      ['tenant_name', 'TEXT'],
      ['organization_name', 'TEXT'],
      ['invited_by', 'TEXT'],
      ['approval_note', 'TEXT'],
      ['subscription_plan', "TEXT DEFAULT 'free'"],
      ['subscription_status', "TEXT DEFAULT 'pending'"],
      ['organization_status', "TEXT DEFAULT 'active'"],
      ['is_deleted', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    ];

    for (const [columnName, definition] of columnDefinitions) {
      if (!existingColumns.has(columnName)) {
        await dbPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${columnName} ${definition}`);
        existingColumns.add(columnName);
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to ensure users table schema:', error.message);
  }
}

async function normalizeExistingAdminAccounts() {
  if (!dbPool) {
    return;
  }

  try {
    const adminRows = await dbPool.query(
      "SELECT id FROM users WHERE LOWER(COALESCE(role, '')) = 'admin'"
    );

    for (const row of adminRows.rows) {
      await dbPool.query(
        `UPDATE users
         SET is_active = TRUE,
             is_approved = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    }
  } catch (error) {
    console.warn('⚠️ Failed to normalize admin accounts:', error.message);
  }
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
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_approved BOOLEAN NOT NULL DEFAULT TRUE,
        approval_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await ensureUsersTableSchema();
    await normalizeExistingAdminAccounts();

    // Create index on email for faster lookups
    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    const adminEmail = normalizeEmail(ADMIN_EMAIL);
    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);

    const adminExists = await dbPool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (adminExists.rows.length === 0) {
      await dbPool.query(
        `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, is_active, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          'admin-001',
          'System Admin',
          adminEmail,
          hashedPassword,
          'admin',
          'tenant-default-001',
          'Main Downtown Branch',
          'branch-main-downtown',
          true,
          true,
        ]
      );
      console.log('✅ Admin user seeded to PostgreSQL');
    } else {
      await dbPool.query(
        `UPDATE users
         SET name = $2,
             password = $3,
             role = $4,
             tenant_id = $5,
             tenant_name = $6,
             branch_id = $7,
             is_active = TRUE,
             is_approved = TRUE,
             updated_at = NOW()
         WHERE email = $1`,
        [adminEmail, 'System Admin', hashedPassword, 'admin', 'tenant-default-001', 'Main Downtown Branch', 'branch-main-downtown']
      );
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
  const requestedRole = String(role || '').trim().toLowerCase();
  const normalizedRole = ['counter', 'staff', 'client'].includes(requestedRole) ? requestedRole : 'counter';
  const isClientInvite = normalizedRole === 'client';

  if (!normalizedEmail || !String(name || '').trim()) {
    throw new Error('Please provide the team member name and email address.');
  }

  if (normalizedEmail === normalizeEmail(ADMIN_EMAIL)) {
    throw new Error('The admin account is reserved for system use only.');
  }

  const existingUser = await dbPool.query(
    'SELECT * FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    const existing = existingUser.rows[0];
    if (existing.is_deleted) {
      const temporaryPassword = generateTemporaryPassword();
      const restored = await dbPool.query(
        `UPDATE users
         SET name = $2,
             password = $3,
             role = $4,
             tenant_id = $5,
             tenant_name = $6,
             branch_id = $7,
             organization_name = $8,
             invited_by = $9,
             is_active = TRUE,
             is_approved = CASE WHEN $13 THEN FALSE ELSE TRUE END,
             is_deleted = FALSE,
             subscription_plan = COALESCE($10, 'free'),
             subscription_status = COALESCE($11, 'pending'),
             organization_status = COALESCE($12, 'active'),
             updated_at = NOW()
         WHERE email = $1
         RETURNING *`,
        [normalizedEmail, String(name).trim(), bcrypt.hashSync(temporaryPassword, 12), normalizedRole, inviter.tenant_id || 'tenant-default-001', inviter.tenant_name || inviter.organizationName || 'Workspace', inviter.branch_id || 'branch-main-downtown', inviter.organizationName || inviter.tenant_name || 'Workspace', inviter.email, 'free', 'pending', 'active', isClientInvite]
      );
      return { user: restored.rows[0], temporaryPassword };
    }

    throw new Error('An account with this email already exists.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await dbPool.query(
    `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, organization_name, invited_by, is_active, is_approved, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
      true,
      !isClientInvite,
    ]
  );

  const invitedUser = result.rows[0];
  return { user: invitedUser, temporaryPassword };
}

async function listWorkspaceMembers(tenantId, organizationName = '') {
  if (!dbPool) {
    return [];
  }

  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedOrganizationName = String(organizationName || '').trim();

  let query = `
    SELECT id, name, email, role, is_active, is_approved, created_at, tenant_id, tenant_name, organization_name
    FROM users
    WHERE COALESCE(is_deleted, FALSE) = FALSE
  `;
  let values = [];

  if (normalizedTenantId) {
    query += ` AND tenant_id = $1`;
    values = [normalizedTenantId];
  } else if (normalizedOrganizationName) {
    query += ` AND (organization_name = $1 OR tenant_name = $1)`;
    values = [normalizedOrganizationName];
  }

  query += ` ORDER BY created_at DESC`;

  const result = await dbPool.query(query, values);
  return result.rows;
}

async function listOrganizationsForAdmin() {
  if (!dbPool) {
    return [];
  }

  const result = await dbPool.query(
    `SELECT id, name, email, role, tenant_id, tenant_name, organization_name, branch_id, is_active, is_approved, subscription_plan, subscription_status, organization_status, is_deleted, created_at
     FROM users
     WHERE role != 'admin' AND COALESCE(is_deleted, FALSE) = FALSE
     ORDER BY created_at DESC`
  );

  return result.rows;
}

async function requestSubscriptionPlan({ user, plan }) {
  if (!dbPool) {
    throw new Error('Database not initialized');
  }

  const normalizedPlan = String(plan || 'free').trim().toLowerCase();
  const allowedPlans = {
    free: 0,
    '1-day': 0,
    '1-month': 50,
    '3-months': 150,
    '1-year': 500,
  };

  const amountUsd = allowedPlans[normalizedPlan] ?? 0;
  const status = amountUsd > 0 ? 'pending' : 'active';

  const result = await dbPool.query(
    `UPDATE users
     SET subscription_plan = $2,
         subscription_status = $3,
         is_active = TRUE,
         is_approved = COALESCE(is_approved, TRUE),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, name, subscription_plan, subscription_status, organization_name, tenant_name` ,
    [user?.id, normalizedPlan, status]
  );

  const updatedUser = result.rows[0] || null;
  return {
    user: updatedUser,
    plan: normalizedPlan,
    status,
    amountUsd,
    message: amountUsd > 0 ? `Subscription request for ${normalizedPlan} submitted. Please pay ${amountUsd} USD via mobile money.` : 'Subscription updated to free plan.',
  };
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

function createClientBooking({ user, booking }) {
  const newBooking = {
    id: `booking-${Date.now()}`,
    customerName: user?.name || 'Client',
    serviceType: String(booking?.serviceType || 'Truck service').trim(),
    bookingDate: String(booking?.bookingDate || new Date().toISOString().slice(0, 10)).trim(),
    bookingTime: String(booking?.bookingTime || '09:00').trim(),
    vehicleType: String(booking?.vehicleType || 'Truck').trim(),
    notes: String(booking?.notes || '').trim(),
    createdAt: new Date().toISOString(),
  };

  clientDashboardState.bookings.unshift(newBooking);
  return newBooking;
}

function getClientDashboardData(user) {
  return {
    bookings: clientDashboardState.bookings,
    preferences: clientDashboardState.preferences,
    notifications: clientDashboardState.notifications,
    queueInfo: {
      currentQueue: 'T-104',
      nextSlot: '2 slots away',
      estimatedWait: '18 min',
    },
    user,
  };
}

function updateClientPreferences({ preferences }) {
  clientDashboardState.preferences = {
    ...clientDashboardState.preferences,
    ...preferences,
  };
  return clientDashboardState.preferences;
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

    const isAdmin = String(user.role || '').toLowerCase() === 'admin';
    const isApproved = user.is_approved !== false;
    const isActive = user.is_active !== false;

    if (!isApproved && !isAdmin) {
      return res.status(403).render('auth/login', {
        title: 'BsmartQ | Sign In',
        error: 'Your account is pending admin approval.',
        notice: null,
        user: req.user || null,
      });
    }

    if (!isActive && !isAdmin) {
      return res.status(403).render('auth/login', {
        title: 'BsmartQ | Sign In',
        error: 'Your account has been disabled.',
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
    const existingUser = await dbPool.query(
      'SELECT * FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      if (existing.is_deleted) {
        const restoredPassword = await bcrypt.hash(password, 12);
        const invitedRole = String(existing.role || '').trim().toLowerCase();
        const shouldRequireApproval = invitedRole === 'client' || existing.is_approved === false;
        await dbPool.query(
          `UPDATE users
           SET name = $2,
               password = $3,
               role = COALESCE(NULLIF($4, ''), 'staff'),
               tenant_id = COALESCE(NULLIF($5, ''), 'tenant-default-001'),
               tenant_name = $6,
               branch_id = COALESCE(NULLIF($7, ''), 'branch-main-downtown'),
               organization_name = $8,
               is_active = TRUE,
               is_approved = $9,
               is_deleted = FALSE,
               subscription_plan = 'free',
               subscription_status = 'pending',
               organization_status = 'active',
               updated_at = NOW()
           WHERE email = $1`,
          [normalizedEmail, String(name).trim(), restoredPassword, invitedRole || 'staff', 'tenant-default-001', organizationName, 'branch-main-downtown', organizationName, shouldRequireApproval ? false : true]
        );
        return res.redirect('/login?registered=1');
      }

      return res.status(409).render('auth/register', {
        title: 'BsmartQ | Create Account',
        error: 'An account with this email already exists.',
        user: req.user || null,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = `user-${Date.now()}`;

    await dbPool.query(
      `INSERT INTO users (id, name, email, password, role, tenant_id, tenant_name, branch_id, organization_name, is_active, is_approved, subscription_plan, subscription_status, organization_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
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
        true,
        false,
        'free',
        'pending',
        'active',
      ]
    );

    let emailNotice = null;
    try {
      const emailResult = await sendEmailVerificationEmail({
        to: normalizedEmail,
        customerName: name,
        verifyLink: `https://bsmartq.app/verify?email=${encodeURIComponent(normalizedEmail)}`,
      });
      if (!emailResult?.ok) {
        emailNotice = 'Account created, but email delivery is not configured yet. Please contact the organization admin for access details.';
      }
    } catch (emailError) {
      console.warn('Registration email failed:', emailError.message);
      emailNotice = 'Account created, but email delivery is not configured yet. Please contact the organization admin for access details.';
    }

    if (emailNotice) {
      return res.redirect(`/login?registered=1&notice=${encodeURIComponent(emailNotice)}`);
    }

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

router.post('/notifications/booking', requireAuth, async (req, res) => {
  try {
    await sendBookingEmail({
      to: req.body?.email || req.user?.email,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      serviceName: req.body?.serviceName || 'service',
      bookingTime: req.body?.bookingTime || 'soon',
      reference: req.body?.reference || `BK-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Booking notification sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/booking-confirmation', requireAuth, async (req, res) => {
  try {
    await sendBookingConfirmationEmail({
      to: req.body?.email || req.user?.email,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      serviceName: req.body?.serviceName || 'service',
      bookingTime: req.body?.bookingTime || 'soon',
      reference: req.body?.reference || `BK-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Booking confirmation sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/reminder', requireAuth, async (req, res) => {
  try {
    await sendAppointmentReminderEmail({
      to: req.body?.email || req.user?.email,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      serviceName: req.body?.serviceName || 'service',
      bookingTime: req.body?.bookingTime || 'soon',
      reference: req.body?.reference || `BK-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Appointment reminder sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/queue-update', requireAuth, async (req, res) => {
  try {
    await sendQueueUpdateEmail({
      to: req.body?.email || req.user?.email,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      queueNumber: req.body?.queueNumber || 'N/A',
      branchName: req.body?.branchName || 'Main Branch',
    });

    return res.json({ ok: true, message: 'Queue update email sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/payment-receipt', requireAuth, async (req, res) => {
  try {
    await sendPaymentReceiptEmail({
      to: req.body?.email || req.user?.email,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      amountUsd: req.body?.amountUsd || '0',
      planName: req.body?.planName || 'plan',
      reference: req.body?.reference || `PAY-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Payment receipt sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/password-reset', requireAuth, async (req, res) => {
  try {
    await sendPasswordResetEmail({
      to: req.body?.email || req.user?.email,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      resetLink: req.body?.resetLink || 'https://bsmartq.app/reset-password',
    });

    return res.json({ ok: true, message: 'Password reset email sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/sms/booking-confirmation', requireAuth, async (req, res) => {
  try {
    await sendBookingConfirmationSms({
      twilioClient: req.app.locals.twilioClient || null,
      to: req.body?.phone || req.body?.to,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      serviceName: req.body?.serviceName || 'service',
      bookingTime: req.body?.bookingTime || 'soon',
      reference: req.body?.reference || `BK-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Booking confirmation SMS sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/sms/reminder', requireAuth, async (req, res) => {
  try {
    await sendAppointmentReminderSms({
      twilioClient: req.app.locals.twilioClient || null,
      to: req.body?.phone || req.body?.to,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      serviceName: req.body?.serviceName || 'service',
      bookingTime: req.body?.bookingTime || 'soon',
      reference: req.body?.reference || `BK-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Appointment reminder SMS sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/notifications/sms/payment-confirmation', requireAuth, async (req, res) => {
  try {
    await sendPaymentConfirmationSms({
      twilioClient: req.app.locals.twilioClient || null,
      to: req.body?.phone || req.body?.to,
      customerName: req.body?.customerName || req.user?.name || 'Customer',
      amountUsd: req.body?.amountUsd || '0',
      planName: req.body?.planName || 'plan',
      reference: req.body?.reference || `PAY-${Date.now()}`,
    });

    return res.json({ ok: true, message: 'Payment confirmation SMS sent.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/subscription/request', requireAuth, async (req, res) => {
  try {
    const requestedPlan = String(req.body?.plan || 'free').trim().toLowerCase();
    const result = await requestSubscriptionPlan({
      user: req.user,
      plan: requestedPlan,
    });

    const members = await listWorkspaceMembers(
      req.user?.tenant_id || req.user?.tenantId,
      req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || req.user?.tenantName || ''
    );

    try {
      if (result?.amountUsd > 0) {
        await sendPaymentReceiptEmail({
          to: req.user?.email,
          customerName: req.user?.name || 'Customer',
          amountUsd: result.amountUsd,
          planName: result.plan,
          reference: `SUB-${Date.now()}`,
        });
      }

      await sendEmailNotification({
        to: 'buay@admin.com',
        subject: 'New subscription request',
        text: `${req.user?.name || 'An organization'} requested the ${result.plan} subscription plan for ${req.user?.organizationName || req.user?.tenant_name || 'their workspace'}. Amount: ${result.amountUsd} USD. Please review and approve it.`,
      });
    } catch (emailError) {
      console.warn('Subscription approval email failed:', emailError.message);
    }

    const plan = String(result?.plan || req.user?.subscription_plan || 'free').toLowerCase();
    const paymentStatus = String(result?.status || req.user?.subscription_status || 'pending').toLowerCase();
    const hasPaidAccess = ['1-day', '1-month', '3-months', '1-year'].includes(plan) && ['paid', 'active'].includes(paymentStatus);

    return res.render('dashboard', {
      title: 'BsmartQ | Dashboard',
      user: req.user,
      error: null,
      notice: result.message,
      inviteMembers: members,
      plan,
      paymentStatus,
      hasPaidAccess,
    });
  } catch (error) {
    const members = await listWorkspaceMembers(
      req.user?.tenant_id || req.user?.tenantId,
      req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || req.user?.tenantName || ''
    );
    const plan = String(req.user?.subscription_plan || 'free').toLowerCase();
    const paymentStatus = String(req.user?.subscription_status || 'pending').toLowerCase();
    const hasPaidAccess = ['1-day', '1-month', '3-months', '1-year'].includes(plan) && ['paid', 'active'].includes(paymentStatus);

    return res.render('dashboard', {
      title: 'BsmartQ | Dashboard',
      user: req.user,
      error: error.message,
      notice: null,
      inviteMembers: members,
      plan,
      paymentStatus,
      hasPaidAccess,
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

    const members = await listWorkspaceMembers(
      req.user?.tenant_id || req.user?.tenantId,
      req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || req.user?.tenantName || ''
    );
    const plan = String(req.user?.subscription_plan || 'free').toLowerCase();
    const paymentStatus = String(req.user?.subscription_status || 'pending').toLowerCase();
    const hasPaidAccess = ['1-day', '1-month', '3-months', '1-year'].includes(plan) && ['paid', 'active'].includes(paymentStatus);

    let emailNotice = null;
    try {
      const emailResult = result.user.role === 'client'
        ? await sendCustomerInvitationEmail({
            to: result.user.email,
            customerName: result.user.name,
            inviteUrl: `https://bsmartq.app/invite?email=${encodeURIComponent(result.user.email)}`,
            workspaceName: req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || 'BsmartQ',
          })
        : await sendStaffInvitationEmail({
            to: result.user.email,
            staffName: result.user.name,
            inviteUrl: `https://bsmartq.app/invite?email=${encodeURIComponent(result.user.email)}`,
            workspaceName: req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || 'BsmartQ',
            temporaryPassword: result.temporaryPassword,
          });
      if (!emailResult?.ok) {
        emailNotice = 'Invitation saved, but the email could not be delivered because no mail provider is configured.';
      }
    } catch (emailError) {
      console.warn('Invite email failed:', emailError.message);
      emailNotice = 'Invitation saved, but the email could not be delivered because no mail provider is configured.';
    }

    return res.render('dashboard', {
      title: 'BsmartQ | Dashboard',
      user: req.user,
      error: null,
      notice: emailNotice || `Invited ${result.user.name} to your workspace. They can sign in immediately. Temporary password: ${result.temporaryPassword}`,
      inviteMembers: members,
      plan,
      paymentStatus,
      hasPaidAccess,
    });
  } catch (error) {
    const members = await listWorkspaceMembers(
      req.user?.tenant_id || req.user?.tenantId,
      req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || req.user?.tenantName || ''
    );
    const plan = String(req.user?.subscription_plan || 'free').toLowerCase();
    const paymentStatus = String(req.user?.subscription_status || 'pending').toLowerCase();
    const hasPaidAccess = ['1-day', '1-month', '3-months', '1-year'].includes(plan) && ['paid', 'active'].includes(paymentStatus);
    return res.render('dashboard', {
      title: 'BsmartQ | Dashboard',
      user: req.user,
      error: error.message,
      notice: null,
      inviteMembers: members,
      plan,
      paymentStatus,
      hasPaidAccess,
    });
  }
});

router.get('/logout', (req, res) => {
  clearSessionCookie(res);
  res.redirect('/login');
});

router.get('/client/dashboard', requireAuth, async (req, res) => {
  if (req.user && String(req.user.role || '').toLowerCase() === 'admin') {
    return res.redirect('/admin');
  }

  const clientData = getClientDashboardData(req.user);
  res.render('client-dashboard', {
    title: 'BsmartQ | Client Dashboard',
    user: req.user,
    error: null,
    notice: req.query?.notice || null,
    ...clientData,
  });
});

router.post('/client/bookings', requireAuth, async (req, res) => {
  try {
    const booking = createClientBooking({
      user: req.user,
      booking: req.body,
    });

    return res.redirect('/client/dashboard?notice=' + encodeURIComponent(`Booking created for ${booking.serviceType} on ${booking.bookingDate} at ${booking.bookingTime}.`));
  } catch (error) {
    return res.redirect('/client/dashboard?notice=' + encodeURIComponent(error.message));
  }
});

router.post('/client/settings', requireAuth, async (req, res) => {
  try {
    updateClientPreferences({
      preferences: {
        email: req.body?.email === 'on',
        sms: req.body?.sms === 'on',
        reminders: req.body?.reminders === 'on',
      },
    });

    return res.redirect('/client/dashboard?notice=' + encodeURIComponent('Your notification settings were updated.'));
  } catch (error) {
    return res.redirect('/client/dashboard?notice=' + encodeURIComponent(error.message));
  }
});

router.get('/dashboard', requireAuth, async (req, res) => {
  if (req.user && String(req.user.role || '').toLowerCase() === 'admin') {
    return res.redirect('/admin');
  }

  const members = await listWorkspaceMembers(
    req.user?.tenant_id || req.user?.tenantId,
    req.user?.organization_name || req.user?.organizationName || req.user?.tenant_name || req.user?.tenantName || ''
  );
  const plan = String(req.user?.subscription_plan || 'free').toLowerCase();
  const paymentStatus = String(req.user?.subscription_status || 'pending').toLowerCase();
  const hasPaidAccess = ['1-day', '1-month', '3-months', '1-year'].includes(plan) && ['paid', 'active'].includes(paymentStatus);

  res.render('dashboard', {
    title: 'BsmartQ | Dashboard',
    user: req.user,
    error: null,
    notice: null,
    inviteMembers: members,
    plan,
    paymentStatus,
    hasPaidAccess,
  });
});

router.get('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  const organizations = await listOrganizationsForAdmin();
  const pendingApprovals = organizations.filter((org) => !org.is_approved || !org.is_active || String(org.subscription_status || '').toLowerCase() === 'pending');

  res.render('admin', {
    title: 'BsmartQ | Admin Console',
    user: req.user,
    organizations,
    pendingApprovals,
  });
});

router.post('/admin/approve-user', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const action = String(req.body?.action || '').trim();
  const plan = String(req.body?.plan || 'free').trim();
  const paymentStatus = String(req.body?.paymentStatus || 'pending').trim();

  if (!userId || !['approve', 'reject', 'update-plan', 'delete'].includes(action)) {
    const organizations = await listOrganizationsForAdmin();
    return res.render('admin', {
      title: 'BsmartQ | Admin Console',
      user: req.user,
      error: 'Invalid admin action.',
      organizations,
      pendingApprovals: organizations.filter((org) => !org.is_approved || !org.is_active || String(org.subscription_status || '').toLowerCase() === 'pending'),
    });
  }

  try {
    let updateQuery = '';
    let values = [];

    if (action === 'approve') {
      updateQuery = `UPDATE users SET is_approved = TRUE, is_active = TRUE, subscription_status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`;
      values = [userId];
    } else if (action === 'reject') {
      updateQuery = `UPDATE users SET is_approved = FALSE, is_active = FALSE, subscription_status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`;
      values = [userId];
    } else if (action === 'update-plan') {
      updateQuery = `UPDATE users SET subscription_plan = $2, subscription_status = $3, is_active = $4, updated_at = NOW() WHERE id = $1 RETURNING *`;
      values = [userId, plan, paymentStatus, ['active', 'paid'].includes(paymentStatus) ? true : false];
    } else if (action === 'delete') {
      updateQuery = `UPDATE users SET is_deleted = TRUE, is_active = FALSE, is_approved = FALSE, subscription_status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`;
      values = [userId];
    }

    const result = await dbPool.query(updateQuery, values);
    const target = result.rows[0];
    if (target) {
      await sendEmailNotification({
        to: target.email,
        subject: action === 'approve' ? 'BsmartQ account approved' : action === 'reject' ? 'BsmartQ account rejected' : action === 'delete' ? 'BsmartQ organization removed' : 'BsmartQ package updated',
        text: action === 'approve'
          ? `Hello ${target.name}, your BsmartQ account has been approved. You can sign in now.`
          : action === 'reject'
            ? `Hello ${target.name}, your BsmartQ account request has been rejected. Please contact the administrator for more details.`
            : action === 'delete'
              ? `Hello ${target.name}, your BsmartQ organization account has been removed by the administrator.`
              : `Hello ${target.name}, your BsmartQ package has been updated to ${plan}.`,
      });
    }

    const organizations = await listOrganizationsForAdmin();
    return res.render('admin', {
      title: 'BsmartQ | Admin Console',
      user: req.user,
      notice: action === 'approve' ? 'Organization approved successfully.' : action === 'reject' ? 'Organization rejected successfully.' : action === 'delete' ? 'Organization deleted successfully.' : 'Package update saved successfully.',
      organizations,
      pendingApprovals: organizations.filter((org) => !org.is_approved || !org.is_active || String(org.subscription_status || '').toLowerCase() === 'pending'),
    });
  } catch (error) {
    const organizations = await listOrganizationsForAdmin();
    return res.render('admin', {
      title: 'BsmartQ | Admin Console',
      user: req.user,
      error: error.message,
      organizations,
      pendingApprovals: organizations.filter((org) => !org.is_approved || !org.is_active || String(org.subscription_status || '').toLowerCase() === 'pending'),
    });
  }
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
  requestSubscriptionPlan,
  listWorkspaceMembers,
  createClientBooking,
  getClientDashboardData,
  updateClientPreferences,
  resetAuthStore,
};
