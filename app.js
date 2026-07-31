/**
 * BsmartQ - Offline-First AI Desktop Queue Management System
 * Core Express Application Server & Domain Adapter
 * 
 * Supports Windows Desktop Installation, Local Encrypted Storage,
 * Offline Operation, and Cloud Synchronization When Connectivity Returns
 */

const path = require('path');
const querystring = require('querystring');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const { Pool } = require('pg');
const { 
  router: authRouter, 
  getSessionUser, 
  requireAuth,
  initializeAuth,
  initializeAuthTable 
} = require('./routes/auth');
require('dotenv').config();
const QRCode = require('qrcode');
let TwilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    TwilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('Twilio client initialized');
  } catch (e) {
    console.warn('Twilio not available:', e.message);
    TwilioClient = null;
  }
}

function buildDbConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL || process.env.POSTGRES_URL || '';

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'smartq',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'buayca10',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const dbPool = new Pool(buildDbConfig());

let dbStatus = { connected: false, error: null };

// System Mode: Determines if app runs in online, offline, or hybrid mode
let systemMode = 'HYBRID'; // 'HYBRID', 'ONLINE', 'OFFLINE'
const CONNECT_RETRY_INTERVAL = 10000; // Retry DB connection every 10 seconds
let dbConnectTimer = null;

// Initialize Express App
const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 3000);
let PORT = DEFAULT_PORT;

// System Environment Flags
const IS_OFFLINE_MODE = process.env.IS_OFFLINE_MODE === 'true' || false;
const TENANT_ID = process.env.TENANT_ID || 'tenant-default-001';
const BRANCH_NAME = process.env.BRANCH_NAME || 'Main Downtown Branch';

const queueState = {
  tickets: [],
  sequence: 10,
};

// In-memory subscriber store used as fallback when DB is unavailable
const tokenSubscriptions = {};
const completionCache = {}; // keep phone for completion notifications after immediate clear

// Completion retention configurable via env (default 30 minutes)
const COMPLETION_RETENTION_MS = Number(process.env.COMPLETION_RETENTION_MS || 30 * 60 * 1000);

// DB-backed subscription helpers
async function dbSaveSubscription(ticketKey, phone) {
  if (!dbStatus.connected) return false;
  try {
    await dbPool.query(
      `INSERT INTO ticket_subscriptions (ticket, phone, notified, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (ticket) DO UPDATE SET phone = EXCLUDED.phone, notified = EXCLUDED.notified, created_at = CURRENT_TIMESTAMP`,
      [ticketKey, phone, false]
    );
    return true;
  } catch (e) {
    console.warn('dbSaveSubscription error:', e.message);
    return false;
  }
}

async function dbGetSubscription(ticketKey) {
  if (!dbStatus.connected) return null;
  try {
    const r = await dbPool.query('SELECT ticket, phone, notified FROM ticket_subscriptions WHERE ticket = $1', [ticketKey]);
    if (r.rows[0]) return r.rows[0];
    return null;
  } catch (e) {
    console.warn('dbGetSubscription error:', e.message);
    return null;
  }
}

async function dbDeleteSubscription(ticketKey) {
  if (!dbStatus.connected) return false;
  try {
    await dbPool.query('DELETE FROM ticket_subscriptions WHERE ticket = $1', [ticketKey]);
    return true;
  } catch (e) {
    console.warn('dbDeleteSubscription error:', e.message);
    return false;
  }
}

// SSE clients per ticket: { '<ticket>': [res, ...] }
const sseClients = {};

function clearSubscription(ticketKey) {
  try {
    if (tokenSubscriptions[ticketKey]) delete tokenSubscriptions[ticketKey];
    // also remove from DB if present
    if (dbStatus.connected) {
      void dbDeleteSubscription(ticketKey);
    }
  } catch (e) {
    console.warn('clearSubscription error:', e.message);
  }
}

async function connectToDatabase() {
  try {
    await dbPool.query('SELECT NOW() AS current_time');
    
    // Initialize auth module with database pool
    initializeAuth(dbPool);
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS queue_metrics (
        tenant_id TEXT PRIMARY KEY,
        waiting_count INTEGER NOT NULL DEFAULT 0,
        active_counters INTEGER NOT NULL DEFAULT 0,
        avg_wait_minutes INTEGER NOT NULL DEFAULT 0,
        efficiency_score INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subscriptions table for ticket notifications
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ticket_subscriptions (
        ticket TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        notified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize auth table and seed admin user
    await initializeAuthTable();

    dbStatus = { connected: true, error: null };
    systemMode = 'ONLINE';
    console.log('✅ PostgreSQL connected to smartq - ONLINE MODE');
    return true;
  } catch (error) {
    dbStatus = { connected: false, error: error.message };
    systemMode = 'OFFLINE';
    console.warn('⚠️ PostgreSQL connection unavailable - OFFLINE MODE:', error.message);
    scheduleReconnect();
    return false;
  }
}

// Automatic reconnection attempt
function scheduleReconnect() {
  if (dbConnectTimer) return; // Already scheduled
  
  dbConnectTimer = setTimeout(async () => {
    dbConnectTimer = null;
    console.log('🔄 Attempting to reconnect to PostgreSQL...');
    await connectToDatabase();
  }, CONNECT_RETRY_INTERVAL);
}

async function syncQueueMetrics(tenantId = TENANT_ID) {
  if (!dbStatus.connected) {
    return;
  }

  const waitingCount = queueState.tickets.filter((item) => item.status === 'Waiting').length;
  const servingNow = queueState.tickets.filter((item) => item.status === 'Serving').length;
  const avgWaitMinutes = Math.max(3, Math.min(20, waitingCount * 2 + 4));
  const efficiencyScore = Math.max(80, Math.min(99, 96 - Math.max(0, waitingCount - 2)));

  try {
    await dbPool.query(
      `
        INSERT INTO queue_metrics (tenant_id, waiting_count, active_counters, avg_wait_minutes, efficiency_score, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id) DO UPDATE SET
          waiting_count = EXCLUDED.waiting_count,
          active_counters = EXCLUDED.active_counters,
          avg_wait_minutes = EXCLUDED.avg_wait_minutes,
          efficiency_score = EXCLUDED.efficiency_score,
          updated_at = CURRENT_TIMESTAMP
      `,
      [tenantId, waitingCount, Math.max(1, servingNow + 1), avgWaitMinutes, efficiencyScore]
    );
  } catch (error) {
    console.warn('Unable to sync queue metrics with PostgreSQL:', error.message);
  }
}

function issueTicket(serviceType = 'General') {
  queueState.sequence += 1;
  const ticket = {
    ticket: `A-${String(queueState.sequence).padStart(3, '0')}`,
    status: 'Waiting',
    counter: 'Unassigned',
    serviceType,
    createdAt: new Date().toISOString(),
  };

  queueState.tickets.unshift(ticket);
  void syncQueueMetrics(TENANT_ID);
  return ticket;
}

function getQueueBoardPayload() {
  return {
    waitingCount: queueState.tickets.filter((item) => item.status === 'Waiting').length,
    servingNow: Math.max(0, queueState.tickets.filter((item) => item.status === 'Serving').length),
    avgServiceTime: 4.8,
    completedToday: 148,
    queueItems: queueState.tickets.slice(0, 6).map((item) => ({
      ticket: item.ticket,
      status: item.status,
      counter: item.counter,
      serviceType: item.serviceType,
    })),
  };
}

function getOperatorConsolePayload() {
  const servingTicket = queueState.tickets.find((item) => item.status === 'Serving');
  const nextTicket = queueState.tickets.find((item) => item.status === 'Waiting');
  const payload = getQueueBoardPayload();

  return {
    queueStats: payload,
    currentServingTicket: servingTicket?.ticket || '—',
    nextInLineTicket: nextTicket?.ticket || '—',
    activeCounter: servingTicket?.counter || 'Counter 03',
    avgHandling: payload.avgServiceTime,
  };
}

function getDisplayPayload() {
  const servingTicket = queueState.tickets.find((item) => item.status === 'Serving');
  const nextTicket = queueState.tickets.find((item) => item.status === 'Waiting');

  return {
    currentCall: servingTicket?.ticket || '—',
    nextWindow: servingTicket?.counter || 'Counter 03',
    nextTicket: nextTicket?.ticket || '—',
    announcement: 'Please proceed to the matching counter',
  };
}

function buildPublicTicketUrl(req, ticketKey) {
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || req.get('host') || 'localhost:3000').split(',')[0].trim();
  const baseUrl = `${forwardedProto}://${forwardedHost.replace(/\/+$/, '')}`;
  return `${baseUrl}/tickets/token/${encodeURIComponent(ticketKey)}`;
}

function getTicketQueueSnapshot(ticketKey = '') {
  const orderedTickets = [...queueState.tickets].reverse();
  const servingTicket = orderedTickets.find((item) => item.status === 'Serving');
  const waitingTickets = orderedTickets.filter((item) => item.status === 'Waiting');
  const currentTicket = queueState.tickets.find((item) => item.ticket === ticketKey) || null;
  const waitingAhead = waitingTickets.findIndex((item) => item.ticket === ticketKey);
  const position = currentTicket?.status === 'Serving' ? 0 : waitingAhead >= 0 ? waitingAhead + 1 : waitingTickets.length + 1;
  const avgServiceMinutes = 4.8;
  const estimatedWaitMinutes = currentTicket?.status === 'Serving' || currentTicket?.status === 'Completed'
    ? 0
    : position > 0 ? Math.max(1, Math.round(position * avgServiceMinutes)) : 0;
  const nextTicket = waitingTickets[0]?.ticket || '—';
  const statusLabel = currentTicket?.status === 'Serving'
    ? 'Now being served'
    : currentTicket?.status === 'Completed'
      ? 'Completed'
      : currentTicket
        ? 'Waiting in queue'
        : 'Ticket not found';
  const progressPercent = currentTicket?.status === 'Serving'
    ? 100
    : currentTicket?.status === 'Completed'
      ? 100
      : position > 0
        ? Math.min(95, Math.max(10, Math.round(100 - ((position - 1) * 100) / Math.max(1, waitingTickets.length + 1))))
        : 0;
  const progressText = currentTicket?.status === 'Serving'
    ? 'Your service is in progress.'
    : currentTicket?.status === 'Completed'
      ? 'This ticket has already been completed.'
      : `About ${estimatedWaitMinutes} minutes until your turn.`;

  return {
    statusLabel,
    currentServingTicket: servingTicket?.ticket || '—',
    nextTicket,
    position: currentTicket?.status === 'Serving' ? 0 : currentTicket?.status === 'Completed' ? 0 : position,
    positionLabel: currentTicket?.status === 'Serving'
      ? 'Now being served'
      : currentTicket?.status === 'Completed'
        ? 'Completed'
        : position > 0 ? `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'} in line` : 'Queued',
    estimatedWaitMinutes,
    estimatedWaitLabel: currentTicket?.status === 'Serving' || currentTicket?.status === 'Completed'
      ? '0 min'
      : `${estimatedWaitMinutes} min`,
    progressPercent,
    progressText,
    waitingCount: waitingTickets.length,
    counter: servingTicket?.counter || 'Counter 03',
  };
}

function getAnalyticsPayload() {
  const payload = getQueueBoardPayload();
  const loadForecast = Math.min(18, Math.max(4, Math.round(payload.waitingCount * 0.9 + payload.servingNow)));
  const recommendedStaff = Math.max(3, Math.min(8, payload.servingNow + 2));
  const aiConfidence = Math.min(99, Math.max(88, 92 + Math.round(payload.waitingCount / 10)));

  return {
    queueStats: payload,
    loadForecast: `+${loadForecast}%`,
    recommendedStaff,
    aiConfidence: `${aiConfidence}%`,
    branchHealth: payload.waitingCount > 5 ? 'Elevated demand' : 'Balanced load',
  };
}

function updateQueueTicket(ticketKey, nextStatus, counter = 'Unassigned') {
  const ticket = queueState.tickets.find((item) => item.ticket === ticketKey);
  if (!ticket) return null;

  ticket.status = nextStatus;
  if (counter) ticket.counter = counter;
  void syncQueueMetrics(TENANT_ID);
  // Broadcast SSE update for this ticket
  try {
    const clients = sseClients[ticketKey] || [];
    const payload = JSON.stringify({
      ticket: ticketKey,
      status: ticket.status,
      counter: ticket.counter,
      queueSnapshot: getTicketQueueSnapshot(ticketKey),
    });
    clients.forEach((res) => {
      try {
        res.write(`data: ${payload}\n\n`);
      } catch (e) {
        // ignore per-client errors
      }
    });
  } catch (e) {
    console.warn('SSE broadcast error:', e.message);
  }
  return ticket;
}

// ==========================================
// 1. Template Engine & Static Assets Setup
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve Static Assets (Tailwind CSS, Client JS, Assets)
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. Middleware & Security Settings
// ==========================================
// Configure Content Security Policy (CSP) to allow TailWind, FontAwesome & Local WebSockets
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.tailwindcss.com"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
  })
);

app.use(cors());
app.use((req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return next();
  }

  let rawBody = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    rawBody += chunk;
  });
  req.on('end', () => {
    try {
      req.body = querystring.parse(rawBody);
    } catch (error) {
      req.body = {};
    }
    next();
  });
});
app.use(express.json());
app.use(morgan('dev'));

// Session middleware - Convert verified JWT to full user object from database
app.use(async (req, res, next) => {
  const verified = getSessionUser(req);
  
  if (verified && verified.email && dbStatus.connected) {
    try {
      const result = await dbPool.query(
        'SELECT id, name, email, role, tenant_id, tenant_name, branch_id FROM users WHERE email = $1',
        [verified.email]
      );
      
      if (result.rows.length > 0) {
        req.user = result.rows[0];
      } else {
        req.user = null;
      }
    } catch (error) {
      console.warn('Failed to fetch user from database:', error.message);
      req.user = null;
    }
  } else {
    req.user = null;
  }
  
  res.locals.user = req.user || null;
  next();
});

// Multi-Tenant Isolation Middleware
app.use((req, res, next) => {
  // Pass tenant context & deployment environment to EJS templates automatically
  req.tenantId = req.headers['x-tenant-id'] || TENANT_ID;
  res.locals.isOfflineMode = IS_OFFLINE_MODE;
  res.locals.systemMode = systemMode; // 'ONLINE', 'OFFLINE', or 'HYBRID'
  res.locals.dbConnected = dbStatus.connected;
  res.locals.tenantId = req.tenantId;
  res.locals.user = req.user || null; // Replaced by Auth middleware in real sessions
  res.locals.currentPath = req.path;
  next();
});

// ==========================================
// 3. Domain Mock Adapters (Hardware & Stats)
// ==========================================

/**
 * Simulates Hardware Status Check (Thermal Printer, Scanners, LED Boards)
 * In production desktop runtime, this bridges to Tauri's IPC Rust bindings.
 */
async function getHardwareStatus() {
  return {
    thermalPrinter: true,  // Connected via ESC/POS driver
    qrScanner: true,       // Connected USB/Serial barcode scanner
    ledDisplay: true,      // Connected Multi-zone LED / WebSocket Display
  };
}

/**
 * Fetches Live Operational Queue Metrics
 * Reads from embedded SQLite in Offline Mode or Redis/PostgreSQL in Cloud Mode.
 */
async function getLiveQueueStats(tenantId) {
  try {
    if (dbStatus.connected) {
      const result = await dbPool.query(
        'SELECT waiting_count, active_counters, avg_wait_minutes, efficiency_score FROM queue_metrics WHERE tenant_id = $1',
        [tenantId]
      );

      if (result.rows[0]) {
        return {
          waitingCount: Number(result.rows[0].waiting_count),
          activeCounters: Number(result.rows[0].active_counters),
          avgWaitMinutes: Number(result.rows[0].avg_wait_minutes),
          efficiencyScore: Number(result.rows[0].efficiency_score),
        };
      }
    }
  } catch (error) {
    console.warn('Unable to read queue metrics from PostgreSQL, using fallback data:', error.message);
  }

  return {
    waitingCount: 14,
    activeCounters: 6,
    avgWaitMinutes: 8,
    efficiencyScore: 94,
  };
}

// ==========================================
// 4. Page Routes
// ==========================================

/**
 * Home Page Controller
 * Render the main landing page initialized with current branch telemetry
 */
app.get('/', async (req, res, next) => {
  try {
    const stats = await getLiveQueueStats(req.tenantId);
    const hardware = await getHardwareStatus();

    res.render('home', {
      branchName: BRANCH_NAME,
      stats: stats,
      hardware: hardware,
      user: req.user || null,
    });
  } catch (error) {
    next(error);
  }
});

app.use(authRouter);

/**
 * API: Health Check Endpoint
 * Returns the current system connectivity status
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    systemMode: systemMode, // 'ONLINE', 'OFFLINE', 'HYBRID'
    dbConnected: dbStatus.connected,
    dbError: dbStatus.error,
    timestamp: new Date().toISOString(),
    branch: BRANCH_NAME,
    tenantId: TENANT_ID,
  });
});

/**
 * Service Station Modules Stubs
 */
app.get('/kiosk', requireAuth, (req, res) => {
  res.render('kiosk', {
    title: 'BsmartQ | Kiosk Touch',
    user: req.user || null,
  });
});

app.get('/kiosk/touch', requireAuth, (req, res) => {
  res.render('kiosk-touch', {
    title: 'BsmartQ | Touch Kiosk',
    user: req.user || null,
    ticketPreview: null,
    error: null,
  });
});

app.post('/tickets/issue', requireAuth, (req, res) => {
  const serviceType = String(req.body?.serviceType || 'General').trim();

  if (!serviceType) {
    return res.status(400).render('kiosk-touch', {
      title: 'BsmartQ | Touch Kiosk',
      user: req.user || null,
      ticketPreview: null,
      error: 'Please choose a service type before issuing a ticket.',
    });
  }

  const ticket = issueTicket(serviceType);
  res.render('kiosk-touch', {
    title: 'BsmartQ | Touch Kiosk',
    user: req.user || null,
    ticketPreview: ticket,
    error: null,
  });
});

// Public token page (shows QR and status) - can be scanned by clients
app.get('/tickets/token/:ticket', (req, res) => {
  const ticketKey = String(req.params.ticket || '').trim();
  if (!ticketKey) return res.status(400).send('Missing ticket identifier');

  const ticket = queueState.tickets.find((t) => t.ticket === ticketKey) || null;
  const tokenUrl = buildPublicTicketUrl(req, ticketKey);
  const queueSnapshot = getTicketQueueSnapshot(ticketKey);

  QRCode.toDataURL(tokenUrl)
    .then((dataUrl) => {
      res.render('ticket-token', {
        title: `Ticket ${ticketKey}`,
        ticket: ticketKey,
        ticketObj: ticket,
        qrDataUrl: dataUrl,
        subscribed: !!tokenSubscriptions[ticketKey],
        queueSnapshot,
      });
    })
    .catch((err) => {
      console.warn('Failed to generate QR code:', err.message);
      res.status(500).send('Unable to generate token QR');
    });
});

// Return QR image directly
app.get('/tickets/token/:ticket/qr.png', (req, res) => {
  const ticketKey = String(req.params.ticket || '').trim();
  if (!ticketKey) return res.status(400).send('Missing ticket identifier');
  const tokenUrl = buildPublicTicketUrl(req, ticketKey);
  QRCode.toBuffer(tokenUrl, { type: 'png' })
    .then((buffer) => {
      res.type('png').send(buffer);
    })
    .catch((err) => {
      console.warn('QR buffer failure:', err.message);
      res.status(500).send('Unable to generate QR image');
    });
});

// Simple JSON status endpoint used by token page polling
app.get('/tickets/status/:ticket', (req, res) => {
  const ticketKey = String(req.params.ticket || '').trim();
  if (!ticketKey) return res.status(400).json({ error: 'Missing ticket' });
  const ticket = queueState.tickets.find((t) => t.ticket === ticketKey) || null;
  const queueSnapshot = getTicketQueueSnapshot(ticketKey);
  res.json({
    ticket: ticketKey,
    status: ticket ? ticket.status : 'Unknown',
    counter: ticket ? ticket.counter : 'Unassigned',
    queueSnapshot,
  });
});

// SSE stream for a ticket to push real-time updates
app.get('/tickets/stream/:ticket', (req, res) => {
  const ticketKey = String(req.params.ticket || '').trim();
  if (!ticketKey) return res.status(400).end();

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // send initial event
  const ticket = queueState.tickets.find((t) => t.ticket === ticketKey) || null;
  const initPayload = JSON.stringify({ ticket: ticketKey, status: ticket ? ticket.status : 'Unknown', counter: ticket ? ticket.counter : 'Unassigned' });
  res.write(`data: ${initPayload}\n\n`);

  // register client
  sseClients[ticketKey] = sseClients[ticketKey] || [];
  sseClients[ticketKey].push(res);

  // cleanup on close
  req.on('close', () => {
    try {
      sseClients[ticketKey] = (sseClients[ticketKey] || []).filter((r) => r !== res);
    } catch (e) {}
  });
});

// (Removed test-only internal trigger endpoints for safety)

// Subscribe for SMS notification when the ticket is called
app.post('/tickets/notify', (req, res) => {
  const ticketKey = String(req.body?.ticket || '').trim();
  const phone = String(req.body?.phone || '').trim();
  if (!ticketKey || !phone) {
    return res.status(400).send('Ticket and phone number are required');
  }
  // persist subscription to DB when possible, fallback to in-memory
  (async () => {
    const saved = await dbSaveSubscription(ticketKey, phone);
    if (!saved) {
      tokenSubscriptions[ticketKey] = { phone, notified: false };
    }

    // confirmation SMS when Twilio available
    if (TwilioClient && process.env.TWILIO_FROM) {
      TwilioClient.messages.create({
        from: process.env.TWILIO_FROM,
        to: phone,
        body: `Subscription confirmed for ${ticketKey}. We'll notify you when it's your turn.`,
      }).catch((err) => console.warn('Twilio notify failed:', err.message));
    }
  })();

  res.redirect(`/tickets/token/${encodeURIComponent(ticketKey)}`);
});

app.get('/counter/operator', requireAuth, (req, res) => {
  const payload = getOperatorConsolePayload();
  res.render('operator', {
    title: 'BsmartQ | Operator Console',
    user: req.user || null,
    ...payload,
  });
});

app.get('/queue/board', requireAuth, (req, res) => {
  const payload = getQueueBoardPayload();
  res.render('queue', {
    title: 'BsmartQ | Queue Board',
    user: req.user || null,
    queueStats: payload,
    queueItems: payload.queueItems,
    statusMessage: null,
  });
});

app.post('/queue/action', requireAuth, async (req, res) => {
  const { ticket, action } = req.body || {};
  let statusMessage = null;

  if (!ticket) {
    statusMessage = 'No ticket selected.';
  } else if (action === 'serve') {
    const served = updateQueueTicket(ticket, 'Serving', 'Counter 03');
    statusMessage = `Ticket ${ticket} is now being served.`;

    // Notify subscribed phone number if present and move phone to completionCache, then clear subscription immediately
    try {
      // prefer DB subscription
      const dbSub = await dbGetSubscription(ticket).catch(() => null);
      let phone = dbSub ? dbSub.phone : (tokenSubscriptions[ticket] ? tokenSubscriptions[ticket].phone : null);
      if (phone) {
        if (TwilioClient && process.env.TWILIO_FROM) {
          TwilioClient.messages.create({
            from: process.env.TWILIO_FROM,
            to: phone,
            body: `Your ticket ${ticket} is now being served at Counter 03. Please proceed.`,
          }).then(() => {
            console.log(`Twilio sent serving SMS to ${phone} for ${ticket}`);
            // move to completion cache and delete active subscription
            completionCache[ticket] = { phone: phone, expiresAt: Date.now() + COMPLETION_RETENTION_MS };
            if (dbSub) void dbDeleteSubscription(ticket);
            if (tokenSubscriptions[ticket]) delete tokenSubscriptions[ticket];
          }).catch((err) => {
            console.warn('Twilio send failure:', err.message);
            completionCache[ticket] = { phone: phone, expiresAt: Date.now() + COMPLETION_RETENTION_MS };
            if (dbSub) void dbDeleteSubscription(ticket);
            if (tokenSubscriptions[ticket]) delete tokenSubscriptions[ticket];
          });
        } else {
          console.log(`Notification queued for ${phone} (Twilio not configured): ${ticket}`);
          completionCache[ticket] = { phone: phone, expiresAt: Date.now() + COMPLETION_RETENTION_MS };
          if (dbSub) void dbDeleteSubscription(ticket);
          if (tokenSubscriptions[ticket]) delete tokenSubscriptions[ticket];
        }
      }
    } catch (e) {
      console.warn('Failed to process subscription notification:', e.message);
    }
  } else if (action === 'complete') {
    const completed = updateQueueTicket(ticket, 'Completed', 'Counter 03');
    statusMessage = `Ticket ${ticket} has been completed.`;

    // Send a follow-up SMS on completion using subscription or completionCache, then clear both
    try {
      // prefer DB subscription if present
      const dbSub = await dbGetSubscription(ticket).catch(() => null);
      let phone = dbSub ? dbSub.phone : (completionCache[ticket] ? completionCache[ticket].phone : (tokenSubscriptions[ticket] ? tokenSubscriptions[ticket].phone : null));
      if (phone) {
        if (TwilioClient && process.env.TWILIO_FROM) {
          TwilioClient.messages.create({
            from: process.env.TWILIO_FROM,
            to: phone,
            body: `Update: Your ticket ${ticket} has been completed. Thank you for visiting.`,
          }).then(() => {
            console.log(`Twilio sent completion SMS to ${phone} for ${ticket}`);
            if (dbSub) void dbDeleteSubscription(ticket);
            if (tokenSubscriptions[ticket]) delete tokenSubscriptions[ticket];
            if (completionCache[ticket]) delete completionCache[ticket];
          }).catch((err) => {
            console.warn('Twilio completion send failed:', err.message);
            if (dbSub) void dbDeleteSubscription(ticket);
            if (tokenSubscriptions[ticket]) delete tokenSubscriptions[ticket];
            if (completionCache[ticket]) delete completionCache[ticket];
          });
        } else {
          console.log(`Completion notification (Twilio not configured) for ${phone}: ${ticket}`);
          if (dbSub) void dbDeleteSubscription(ticket);
          if (tokenSubscriptions[ticket]) delete tokenSubscriptions[ticket];
          if (completionCache[ticket]) delete completionCache[ticket];
        }
      }
    } catch (e) {
      console.warn('Failed to send completion notification:', e.message);
    }
  } else if (action === 'requeue') {
    updateQueueTicket(ticket, 'Waiting', 'Unassigned');
    statusMessage = `Ticket ${ticket} has been requeued.`;
  }

  const payload = getQueueBoardPayload();
  res.render('queue', {
    title: 'BsmartQ | Queue Board',
    user: req.user || null,
    queueStats: payload,
    queueItems: payload.queueItems,
    statusMessage,
  });
});

app.get('/display', requireAuth, (req, res) => {
  const payload = getDisplayPayload();
  res.render('display', {
    title: 'BsmartQ | Display Wall',
    user: req.user || null,
    ...payload,
  });
});

app.get('/analytics/ai', requireAuth, (req, res) => {
  const payload = getAnalyticsPayload();
  res.render('analytics', {
    title: 'BsmartQ | AI Analytics',
    user: req.user || null,
    ...payload,
  });
});

// ==========================================
// 5. Error Handling Middleware
// ==========================================
app.use((req, res) => {
  res.status(404).render('home', {
    branchName: BRANCH_NAME,
    stats: { waitingCount: 0, activeCounters: 0, avgWaitMinutes: 0, efficiencyScore: 0 },
    hardware: { thermalPrinter: false, qrScanner: false, ledDisplay: false },
    error: 'Page Not Found',
  });
});

app.use((err, req, res, next) => {
  console.error('BsmartQ Core System Error:', err.stack);
  res.status(500).send('Internal Edge Node/Server Error');
});

// ==========================================
// 6. Server Initialization
// ==========================================
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`
  =======================================================
  🚀 BsmartQ Queue Platform Active
  =======================================================
  • Operational Mode : ${IS_OFFLINE_MODE ? 'OFFLINE (Tauri Edge Node)' : 'HYBRID CLOUD SAAS'}
  • Tenant ID        : ${TENANT_ID}
  • Active Branch    : ${BRANCH_NAME}
  • Network Endpoint : http://localhost:${port}
  =======================================================
  `);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.warn(`Port ${port} is busy. Retrying on http://localhost:${fallbackPort}`);
      PORT = fallbackPort;
      startServer(fallbackPort);
      return;
    }

    console.error('BsmartQ Server failed to start:', error);
    process.exit(1);
  });

  return server;
}

connectToDatabase().then(() => {
  void syncQueueMetrics(TENANT_ID);
});

const server = startServer(PORT);

module.exports = {
  app,
  server,
  getServerPort: () => PORT,
  getServerUrl: () => `http://localhost:${PORT}`,
  updateQueueTicket,
};