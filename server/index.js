import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication } from './passkeys.js';
import { startFlow, consumeFlow, consumeMobileProof } from './passkey-proof.js';
import { MAX_LICENCE_BYTES, validateLicence, storeLicence, readLicence, removeLicence } from './licences.js';
import { fileURLToPath } from 'node:url';
import { readStore, writeStore, makeId } from './store.js';
import { evaluateDemoAccess, validDate, validSlot } from './rules.js';

const app = express();
const production = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET || (production ? '' : 'local-development-only');
if (production && secret.length < 24) throw new Error('Set a long SESSION_SECRET (24+ characters) in production.');
app.disable('x-powered-by');
if (production) app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(session({
  name: 'sdg.demo.sid', secret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LICENCE_BYTES, files: 1 } });
const publicDriver = ({ devicePasskeys, licence, ...fields }) => ({ ...fields, mobilePasskeyEnrolled: Boolean(devicePasskeys?.length), hasLicence: Boolean(licence) });
const errors = (res, code, message) => res.status(code).json({ error: message });
const publicUser = ({ id, name, email }) => ({ id, name, email });
const normalized = value => typeof value === 'string' ? value.trim() : '';
function userFor(req) {
  if (!req.session.userId) return null;
  return readStore().users.find(u => u.id === req.session.userId) || null;
}
function auth(req, res, next) {
  const user = userFor(req);
  if (!user) return errors(res, 401, 'Please sign in.');
  req.demoUser = user;
  next();
}
const saveSession = (req, res, body, status = 200) => req.session.save(err => {
  if (err) return errors(res, 500, 'Could not save session.');
  res.status(status).json(body);
});

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'LED demonstration only' }));
app.get('/api/me', (req, res) => {
  const user = userFor(req);
  res.json({ user: user ? publicUser(user) : null });
});
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = normalized(req.body?.name).slice(0, 80);
    const email = normalized(req.body?.email).toLowerCase();
    const password = req.body?.password;
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 200)
      return errors(res, 400, 'Enter a name, valid email, and password of 8–200 characters.');
    const db = readStore();
    if (db.users.some(u => u.email === email)) return errors(res, 409, 'Email already registered.');
    const user = { id: makeId(), name, email, passwordHash: await bcrypt.hash(password, 12) };
    db.users.push(user); writeStore(db);
    req.session.userId = user.id;
    saveSession(req, res, { user: publicUser(user) }, 201);
  } catch (err) { next(err); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const db = readStore();
    const user = db.users.find(u => u.email === normalized(req.body?.email).toLowerCase());
    const password = req.body?.password;
    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash)))
      return errors(res, 401, 'Incorrect email or password.');
    req.session.userId = user.id;
    saveSession(req, res, { user: publicUser(user) });
  } catch (err) { next(err); }
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(err => {
  if (err) return errors(res, 500, 'Could not log out.');
  res.clearCookie('sdg.demo.sid', { httpOnly: true, secure: production, sameSite: 'lax' });
  res.json({ ok: true });
}));

app.get('/api/dashboard', auth, (req, res) => {
  const db = readStore(); const ownerId = req.demoUser.id;
  res.json({
    vehicles: db.vehicles.filter(x => x.ownerId === ownerId),
    drivers: db.drivers.filter(x => x.ownerId === ownerId).map(publicDriver),
    events: db.events.filter(x => x.ownerId === ownerId).slice(-80).reverse()
  });
});
app.post('/api/vehicles', auth, (req, res) => {
  const name = normalized(req.body?.name).slice(0, 100);
  const plate = normalized(req.body?.plate).slice(0, 32);
  if (!name) return errors(res, 400, 'Vehicle name is required.');
  const db = readStore();
  const vehicle = { id: makeId(), ownerId: req.demoUser.id, name, plate };
  db.vehicles.push(vehicle); writeStore(db); res.status(201).json({ vehicle });
});
app.delete('/api/vehicles/:id', auth, (req, res) => {
  const db = readStore();
  if (db.drivers.some(d => d.ownerId === req.demoUser.id && d.vehicleId === req.params.id))
    return errors(res, 409, 'Remove drivers associated with this vehicle first.');
  const before = db.vehicles.length;
  db.vehicles = db.vehicles.filter(v => !(v.id === req.params.id && v.ownerId === req.demoUser.id));
  if (db.vehicles.length === before) return errors(res, 404, 'Vehicle not found.');
  writeStore(db); res.json({ ok: true });
});
app.post('/api/drivers', auth, upload.single('licence'), (req, res) => {
  const name = normalized(req.body?.name).slice(0, 100);
  const licenceExpiry = normalized(req.body?.licenceExpiry);
  const vehicleId = normalized(req.body?.vehicleId);
  const fingerprintSlot = Number(req.body?.fingerprintSlot);
  if (!name || !validDate(licenceExpiry) || !validSlot(fingerprintSlot))
    return errors(res, 400, 'Enter a driver name, real expiry date, and sensor slot 1–127.');
  const db = readStore();
  if (!db.vehicles.some(v => v.id === vehicleId && v.ownerId === req.demoUser.id))
    return errors(res, 400, 'Select one of your vehicles.');
  if (db.drivers.some(d => d.ownerId === req.demoUser.id && d.fingerprintSlot === fingerprintSlot))
    return errors(res, 409, 'Fingerprint slot already assigned. Choose a different slot.');
  try { validateLicence(req.file); }
  catch (e) { return errors(res, 400, e.message); }
  const driver = { id: makeId(), ownerId: req.demoUser.id, name, licenceExpiry, vehicleId, fingerprintSlot, fingerprintEnrolled: false, approved: false, licence: null, devicePasskeys: [], createdAt: new Date().toISOString() };
  driver.licence = storeLicence(req.file);
  try { db.drivers.push(driver); writeStore(db); }
  catch (e) { removeLicence(driver.licence); throw e; }
  res.status(201).json({ driver: publicDriver(driver) });
});
app.patch('/api/drivers/:id/approval', auth, (req, res) => {
  if (typeof req.body?.approved !== 'boolean') return errors(res, 400, 'approved must be boolean.');
  const db = readStore();
  const driver = db.drivers.find(d => d.id === req.params.id && d.ownerId === req.demoUser.id);
  if (!driver) return errors(res, 404, 'Driver not found.');
  driver.approved = req.body.approved; writeStore(db); res.json({ driver: publicDriver(driver) });
});
app.patch('/api/drivers/:id/fingerprint', auth, (req, res) => {
  if (typeof req.body?.enrolled !== 'boolean') return errors(res, 400, 'enrolled must be boolean.');
  const db = readStore();
  const driver = db.drivers.find(d => d.id === req.params.id && d.ownerId === req.demoUser.id);
  if (!driver) return errors(res, 404, 'Driver not found.');
  driver.fingerprintEnrolled = req.body.enrolled; writeStore(db); res.json({ driver: publicDriver(driver) });
});
app.delete('/api/drivers/:id', auth, (req, res) => {
  const db = readStore(); const before = db.drivers.length;
  db.drivers = db.drivers.filter(d => !(d.id === req.params.id && d.ownerId === req.demoUser.id));
  if (before === db.drivers.length) return errors(res, 404, 'Driver not found.');
  // This removes only a database record. Delete the sensor template before this step.
  const removed = readStore().drivers.find(d => d.id === req.params.id && d.ownerId === req.demoUser.id);
  writeStore(db); removeLicence(removed?.licence); res.json({ ok: true });
});
// Only the owning demo account can retrieve a driver document. Never expose /licences as static files.
app.get('/api/drivers/:id/licence', auth, (req, res) => {
  const driver = readStore().drivers.find(d => d.id === req.params.id && d.ownerId === req.demoUser.id);
  if (!driver?.licence) return errors(res, 404, 'No licence document for this driver.');
  const content = readLicence(driver.licence);
  if (!content) return errors(res, 404, 'Document unavailable. The demo host may have restarted.');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', content.mime);
  res.setHeader('Content-Disposition', 'attachment; filename="demo-licence"');
  res.send(content.bytes);
});

// Owner-managed demonstration passkeys. The OS may choose fingerprint, face or PIN.
// Enrolling a passkey associates a device credential with a record; it does not
// establish a natural person's legal identity.
function driverFor(req) {
  return readStore().drivers.find(d => d.id === req.params.id && d.ownerId === req.demoUser.id);
}
app.post('/api/drivers/:id/passkey/register-options', auth, async (req, res, next) => {
  try {
    const driver = driverFor(req);
    if (!driver) return errors(res, 404, 'Driver not found.');
    const options = await registrationOptions(driver);
    startFlow(req.session, 'register', driver.id, options.challenge);
    saveSession(req, res, options);
  } catch(e) { next(e); }
});
app.post('/api/drivers/:id/passkey/register-verify', auth, async (req, res) => {
  try {
    const driver = driverFor(req);
    if (!driver) return errors(res, 404, 'Driver not found.');
    const challenge = consumeFlow(req.session, 'register', driver.id);
    const credential = await verifyRegistration(req.body, challenge);
    const db = readStore();
    const current = db.drivers.find(d => d.id === driver.id && d.ownerId === req.demoUser.id);
    if (!current) return errors(res, 404, 'Driver no longer exists.');
    if (db.drivers.some(d => (d.devicePasskeys || []).some(c => c.id === credential.id)))
      return errors(res, 409, 'Passkey is already registered.');
    current.devicePasskeys ||= [];
    current.devicePasskeys.push(credential);
    writeStore(db);
    saveSession(req, res, { verified: true });
  } catch(e) { errors(res, 400, e.message || 'Could not register passkey.'); }
});
app.post('/api/drivers/:id/passkey/auth-options', auth, async (req, res, next) => {
  try {
    const driver = driverFor(req);
    if (!driver) return errors(res, 404, 'Driver not found.');
    if (!(driver.devicePasskeys || []).length) return errors(res, 400, 'Register a phone passkey for this driver first.');
    delete req.session.mobileProof;
    const options = await authenticationOptions(driver);
    startFlow(req.session, 'authenticate', driver.id, options.challenge);
    saveSession(req, res, options);
  } catch(e) { next(e); }
});
app.post('/api/drivers/:id/passkey/auth-verify', auth, async (req, res) => {
  try {
    const driver = driverFor(req);
    if (!driver) return errors(res, 404, 'Driver not found.');
    const challenge = consumeFlow(req.session, 'authenticate', driver.id);
    const stored = (driver.devicePasskeys || []).find(c => c.id === req.body?.id);
    if (!stored) return errors(res, 401, 'Unknown driver passkey.');
    const counter = await verifyAuthentication(req.body, challenge, stored);
    const db = readStore();
    const current = db.drivers.find(d => d.id === driver.id && d.ownerId === req.demoUser.id);
    const credential = current?.devicePasskeys?.find(c => c.id === stored.id);
    if (!credential) return errors(res, 401, 'Passkey is no longer registered.');
    credential.counter = counter;
    writeStore(db);
    req.session.mobileProof = { driverId: driver.id, at: Date.now() };
    saveSession(req, res, { verified: true, method: 'device-user-verification' });
  } catch(e) { errors(res, 400, e.message || 'Could not verify passkey.'); }
});

app.post('/api/access/check', auth, (req, res) => {
  const db = readStore(); const ownerId = req.demoUser.id;
  const driver = db.drivers.find(d => d.id === req.body?.driverId && d.ownerId === ownerId);
  const vehicle = db.vehicles.find(v => v.id === req.body?.vehicleId && v.ownerId === ownerId);
  const useMobile = req.body?.fingerprintMethod === 'mobile';
  // Server-verified proof is one-time and expires after two minutes.
  const mobileVerified = consumeMobileProof(req.session, driver?.id);
  const phonePassed = useMobile && Boolean(driver?.devicePasskeys?.length) && mobileVerified;
  const decision = evaluateDemoAccess({ driver, vehicle, faceMatched: req.body?.faceMatched,
    fingerprintMatched: useMobile ? phonePassed : req.body?.fingerprintMatched,
    mobileDeviceVerified: phonePassed, fingerprintMethod: useMobile ? 'mobile' : 'sensor' });
  const event = { id: makeId(), ownerId, fingerprintMethod: useMobile ? 'mobile' : 'sensor', at: new Date().toISOString(), driverName: driver?.name || '(unknown)', vehicleName: vehicle?.name || '(unknown)', ...decision.checks, accessGranted: decision.accessGranted };
  db.events.push(event);
  db.events = db.events.slice(-3000);
  writeStore(db);
  res.json({ decision, event, warning: 'This is an on-screen / LED-only demonstration. Client results are not secure identity proof.' });
});

app.use('/api', (_req, res) => errors(res, 404, 'API endpoint not found.'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return errors(res, 400, 'Document upload failed: '+err.message);
  errors(res, 500, 'An unexpected server error occurred. Check server logs.');
});
const port = Number(process.env.PORT || 3001);
app.listen(port, '0.0.0.0', () => console.log(`SMART DRIVE GUARD listening on :${port} (LED demo only)`));
