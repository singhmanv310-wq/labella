'use strict';
/**
 * Eldeco La Vida Bella – website + lead capture + admin CRM
 * Single Node.js service. No database server needed (leads are stored in data/leads.json).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---------- tiny .env loader (no extra dependency) ---------- */
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
})();

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

/* ---------- configuration ---------- */
const isProd = process.env.NODE_ENV === 'production';
const cfg = {
  port: Number(process.env.PORT) || 3000,
  siteUrl: (process.env.SITE_URL || '').replace(/\/+$/, ''),
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  webhookUrl: process.env.WEBHOOK_URL || '',
  brochureUrl: process.env.BROCHURE_URL || '/private/floorplans/eldeco-la-vida-bella-brochure.pdf',
  trustProxy: process.env.TRUST_PROXY === undefined ? (isProd ? 1 : false) : (isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY === 'true' : Number(process.env.TRUST_PROXY)),
};

if (!isProd) {
  if (!cfg.adminEmail) cfg.adminEmail = 'admin@example.com';
  if (!cfg.adminPassword && !cfg.adminPasswordHash) cfg.adminPassword = 'admin123';
  if (!cfg.sessionSecret) cfg.sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[dev] Using development login: ' + cfg.adminEmail + ' / ' + (cfg.adminPassword || '(hash from env)'));
} else {
  const missing = [];
  if (!cfg.adminEmail) missing.push('ADMIN_EMAIL');
  if (!cfg.adminPassword && !cfg.adminPasswordHash) missing.push('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH');
  if (cfg.sessionSecret.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
  if (missing.length) {
    console.error('Missing required environment variables: ' + missing.join(', '));
    process.exit(1);
  }
}

const UNIT_OPTIONS = [
  '3 BHK + 3T (1,905 Sq. Ft.)',
  '4 BHK + 4T (2,755 Sq. Ft.)',
  '4 BHK + Servant (3,300 Sq. Ft.)',
];
const STATUSES = ['New', 'Contacted', 'Site Visit', 'Negotiation', 'Won', 'Lost'];

/* ---------- lead storage (atomic JSON file) ---------- */
class LeadStore {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'leads.json');
    this.leads = [];
    this.queue = Promise.resolve();
    if (fs.existsSync(this.file)) {
      try {
        this.leads = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch (e) {
        const bad = this.file + '.corrupt-' + Date.now();
        fs.copyFileSync(this.file, bad);
        console.error('leads.json was unreadable; copied to ' + bad + ' and starting fresh.');
      }
    }
  }
  _nextId() {
    let max = 0;
    for (const l of this.leads) {
      const n = parseInt(String(l.id).replace(/\D/g, ''), 10);
      if (n > max) max = n;
    }
    return 'ELD-' + String(max + 1).padStart(5, '0');
  }
  _flush() {
    this.queue = this.queue.then(async () => {
      const tmp = this.file + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(this.leads, null, 2));
      await fs.promises.rename(tmp, this.file);
    }).catch((e) => console.error('Failed to save leads:', e));
    return this.queue;
  }
  async insert(data) {
    const lead = { id: this._nextId(), createdAt: new Date().toISOString(), status: 'New', notes: '', ...data };
    this.leads.unshift(lead);
    await this._flush();
    return lead;
  }
  async update(id, patch) {
    const lead = this.leads.find((l) => l.id === id);
    if (!lead) return null;
    Object.assign(lead, patch);
    await this._flush();
    return lead;
  }
  async remove(id) {
    const i = this.leads.findIndex((l) => l.id === id);
    if (i === -1) return false;
    this.leads.splice(i, 1);
    await this._flush();
    return true;
  }
  filter(q, status) {
    const needle = (q || '').trim().toLowerCase();
    return this.leads.filter((l) => {
      if (status && l.status !== status) return false;
      if (!needle) return true;
      return [l.id, l.fullName, l.phone, l.email, l.unitType, l.source, l.notes]
        .some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }
  drain() { return this.queue; }
}
const store = new LeadStore(cfg.dataDir);

/* ---------- auth helpers ---------- */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function verifyPassword(input) {
  if (cfg.adminPasswordHash) {
    const [alg, saltHex, hashHex] = cfg.adminPasswordHash.split('$');
    if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(input), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }
  return safeEqual(input, cfg.adminPassword);
}

const SESSION_COOKIE = 'crm_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const FLOORPLAN_COOKIE = 'floorplan_access';
const FLOORPLAN_ACCESS_MS = 12 * 60 * 60 * 1000;
const hmac = (body) => crypto.createHmac('sha256', cfg.sessionSecret).update(body).digest('base64url');

function signSession(email) {
  const body = Buffer.from(JSON.stringify({ e: email, exp: Date.now() + SESSION_MS })).toString('base64url');
  return body + '.' + hmac(body);
}
function signFloorplanAccess() {
  const body = Buffer.from(JSON.stringify({ use: 'floorplans', exp: Date.now() + FLOORPLAN_ACCESS_MS })).toString('base64url');
  return body + '.' + hmac(body);
}
function readFloorplanAccess(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const [body, sig] = token.split('.');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() && p.use === 'floorplans' ? p : null;
  } catch { return null; }
}
function readSession(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const [body, sig] = token.split('.');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() && p.e === cfg.adminEmail ? p : null;
  } catch { return null; }
}
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function requireAdmin(req, res, next) {
  if (readSession(getCookie(req, SESSION_COOKIE))) return next();
  res.status(401).json({ ok: false, error: 'Please sign in.' });
}

/* ---------- validation ---------- */
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function validateLead(body) {
  const errors = {};
  const fullName = clean(body.fullName, 80);
  if (fullName.length < 2) errors.fullName = 'Enter your full name.';

  let phone = String(body.phone || '').replace(/[\s\-()]/g, '');
  phone = phone.replace(/^(\+91|0091|91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';

  const email = clean(body.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';

  const unitType = UNIT_OPTIONS.includes(body.unitType) ? body.unitType : 'General enquiry';
  if (body.consent !== true && body.consent !== 'true' && body.consent !== 'on') errors.consent = 'Please accept to be contacted.';

  return {
    errors,
    data: {
      fullName, phone, email, unitType,
      source: clean(body.source, 40) || 'Website',
      utmSource: clean(body.utmSource, 80),
      utmMedium: clean(body.utmMedium, 80),
      utmCampaign: clean(body.utmCampaign, 80),
    },
  };
}

function notifyWebhook(lead) {
  if (!cfg.webhookUrl) return;
  fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'lead.created', lead }),
    signal: AbortSignal.timeout(5000),
  }).catch((e) => console.error('Webhook failed:', e.message));
}

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
if (cfg.trustProxy) app.set('trust proxy', cfg.trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameSrc: ['https://www.google.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: isProd ? undefined : false,
}));
app.use(compression());
app.use(express.json({ limit: '10kb' }));

// Basic CSRF defence: state-changing requests must come from this site.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ ok: false, error: 'Blocked.' });
    } catch { return res.status(403).json({ ok: false, error: 'Blocked.' }); }
  }
  if (!req.is('application/json')) return res.status(415).json({ ok: false, error: 'JSON required.' });
  next();
});

/* pages */
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace(
  '<!--CANONICAL-->',
  cfg.siteUrl ? `<link rel="canonical" href="${cfg.siteUrl}/"><meta property="og:url" content="${cfg.siteUrl}/">` : ''
);
app.get('/', (req, res) => res.type('html').send(indexHtml));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/admin', (req, res) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});
const FLOORPLAN_FILES = new Set([
  'plan1.jpg',
  'type-01-3bhk-3t.png',
  'type-07-3bhk-3t.png',
  'type-04-4bhk-4t.png',
  'type-05-4bhk-4t-servant.png',
  'type-06-3bhk-3t.png',
  'type-08-3bhk-3t-servant.png',
  'floorplans.pdf',
  'eldeco-la-vida-bella-brochure.pdf',
]);
app.get('/api/floorplans/access', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ unlocked: !!readFloorplanAccess(getCookie(req, FLOORPLAN_COOKIE)) });
});
app.get('/private/floorplans/:filename', (req, res) => {
  if (!readFloorplanAccess(getCookie(req, FLOORPLAN_COOKIE))) return res.status(403).end();
  if (!FLOORPLAN_FILES.has(req.params.filename)) return res.status(404).end();
  res.set('Cache-Control', 'private, no-store');
  const filePath = path.join(__dirname, 'private-assets', 'floorplans', req.params.filename);
  if (req.params.filename.endsWith('.pdf')) return res.download(filePath);
  res.sendFile(filePath);
});
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: isProd ? '7d' : 0, extensions: ['html'] }));

/* public API: lead capture */
const leadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please call us on +91 78603 91489.' } });

app.post('/api/leads', leadLimiter, async (req, res) => {
  try {
    // Honeypot: real visitors never fill this hidden field.
    if (req.body && req.body.website) return res.json({ ok: true });
    const { errors, data } = validateLead(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });
    const lead = await store.insert(data);
    notifyWebhook(lead);
    res.cookie(FLOORPLAN_COOKIE, signFloorplanAccess(), {
      httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: FLOORPLAN_ACCESS_MS, path: '/',
    });
    res.json({ ok: true, id: lead.id, brochureUrl: cfg.brochureUrl || null, floorplansUnlocked: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or call us.' });
  }
});

/* admin API */
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Try again in 15 minutes.' } });

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const okEmail = safeEqual(email, cfg.adminEmail);
  const okPass = verifyPassword(password);
  if (!(okEmail && okPass)) return res.status(401).json({ ok: false, error: 'Incorrect email or password.' });
  res.cookie(SESSION_COOKIE, signSession(cfg.adminEmail), {
    httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_MS, path: '/',
  });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true, email: cfg.adminEmail, statuses: STATUSES }));

app.get('/api/admin/leads', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || 25));
  const rows = store.filter(req.query.q, STATUSES.includes(req.query.status) ? req.query.status : '');
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const today = istDay(Date.now());
  const all = store.leads;
  res.json({
    ok: true, page, pages, total: rows.length,
    stats: {
      total: all.length,
      new: all.filter((l) => l.status === 'New').length,
      today: all.filter((l) => istDay(l.createdAt) === today).length,
      won: all.filter((l) => l.status === 'Won').length,
    },
    leads: rows.slice((page - 1) * pageSize, page * pageSize),
  });
});

app.patch('/api/admin/leads/:id', requireAdmin, async (req, res) => {
  const patch = {};
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    patch.status = req.body.status;
  }
  if (req.body.notes !== undefined) patch.notes = clean(req.body.notes, 500);
  const lead = await store.update(req.params.id, patch);
  if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found.' });
  res.json({ ok: true, lead });
});

app.delete('/api/admin/leads/:id', requireAdmin, async (req, res) => {
  const removed = await store.remove(req.params.id);
  res.status(removed ? 200 : 404).json({ ok: removed });
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  // Prefix cells that spreadsheets could treat as formulas (CSV injection).
  const cell = (v) => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ['Ref ID', 'Created (IST)', 'Name', 'Phone', 'Email', 'Unit', 'Status', 'Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Notes'];
  const rows = store.filter(req.query.q, STATUSES.includes(req.query.status) ? req.query.status : '').map((l) => [
    l.id, new Date(l.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), l.fullName, l.phone, l.email,
    l.unitType, l.status, l.source, l.utmSource, l.utmMedium, l.utmCampaign, l.notes,
  ]);
  const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="eldeco-leads-' + new Date().toISOString().slice(0, 10) + '.csv"', 'Cache-Control': 'no-store' });
  res.send(csv);
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));
app.use((req, res) => res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title><body style="font-family:system-ui;background:#0F150F;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div><h1>Page not found</h1><p><a style="color:#D9B772" href="/">Back to Eldeco La Vida Bella</a></p></div>'));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ ok: false, error: 'Server error.' });
});

const server = app.listen(cfg.port, () => console.log(`Listening on http://localhost:${cfg.port}`));
const shutdown = () => { server.close(() => store.drain().then(() => process.exit(0))); setTimeout(() => process.exit(1), 8000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
