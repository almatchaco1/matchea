import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { checkMail } from './lib/mailer.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import ingredientRoutes from './routes/ingredients.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import reportRoutes from './routes/reports.js';
import publicRoutes from './routes/public.js';
import onlineRoutes from './routes/online.js';
import customerRoutes from './routes/customer.js';
import backupRoutes from './routes/backups.js';
import baristaRoutes from './routes/barista.js';
import supplierRoutes from './routes/suppliers.js';
import customerAdminRoutes from './routes/customers.js';
import expenseRoutes from './routes/expenses.js';
import trashRoutes from './routes/trash.js';
import { help as helpRoutes, support as supportRoutes } from './routes/support.js';
import { scheduleDailyBackups } from './lib/backup.js';
import { requireAuth } from './middleware/auth.js';
import { applyMenuDefaults } from './update-menu.js';
import { installDefaultQr } from './lib/defaultQr.js';
import { startDecorPicker } from './lib/decorStart.js';
import { freshStartIfRequested } from './lib/freshStart.js';
import User from './models/User.js';

const app = express();
app.set('trust proxy', 1); // real client IPs behind Render/Railway/Nginx (used for rate limits)
const smallJson = express.json({ limit: '200kb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }); // raw body kept for PayMongo webhook signatures
const bigJson = express.json({ limit: '4mb' }); // QR image uploads only
const orderJson = express.json({ limit: '1mb' }); // online orders can carry a small receipt screenshot
app.use((req, res, next) => (/^\/api\/settings\/qr\//.test(req.path) ? bigJson : req.method === 'POST' && (req.path === '/api/public/orders' || /^\/api\/(help\/messages|support\/[\w]+\/reply|online\/[\w]+\/refund)$/.test(req.path)) ? orderJson : smallJson)(req, res, next));
if (process.env.CLIENT_ORIGIN) app.use(cors({ origin: process.env.CLIENT_ORIGIN.split(',') }));

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api/public', publicRoutes); // customer ordering page
app.use('/api/customer', customerRoutes); // customer accounts
app.use('/api/auth', authRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/ingredients', requireAuth, ingredientRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/sales', requireAuth, saleRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/online', requireAuth, onlineRoutes);
app.use('/api/backups', requireAuth, backupRoutes);
app.use('/api/barista', requireAuth, baristaRoutes);
app.use('/api/suppliers', requireAuth, supplierRoutes);
app.use('/api/expenses', requireAuth, expenseRoutes);
app.use('/api/customers', requireAuth, customerAdminRoutes);
app.use('/api/trash', requireAuth, trashRoutes);
app.use('/api/help', helpRoutes); // customer service chat (customer side)
app.use('/api/support', requireAuth, supportRoutes); // customer service chat (staff inbox)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app (npm run build → my-app/build)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../build');
// (checked on every request, so a new build works without restarting the server)
app.use(express.static(dist));
app.get('*', (_req, res) => {
  const index = path.join(dist, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(404).type('html').send('<p style="font:16px system-ui;padding:24px">The website isn’t built yet. In the <b>my-app</b> folder run <code>npm run build</code>, then refresh this page.</p>');
});

// Errors → JSON
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id.' });
  if (err.code === 11000) return res.status(409).json({ error: 'That name is already used.', fields: { name: 'That name is already used.' } });
  if (err.fields) return res.status(err.status || 400).json({ error: err.message, fields: err.fields });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
});

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/matcha_pos')
  .then(async () => {
    // Give drinks their photos and add-on rules if they don't have them yet
    try {
      const n = await applyMenuDefaults({ log: () => {} });
      if (n) console.log(`Added photos / add-on rules to ${n} drinks.`);
    } catch (e) { console.error('Could not update menu defaults:', e.message); }
    try { await freshStartIfRequested(); } catch (e) { console.error('Could not start fresh:', e.message); }
    try { const who = await User.ensureSuperAdmin(); if (who) console.log(`${who} is the super admin.`); } catch (e) { console.error('Could not set the super admin:', e.message); }
    try { await installDefaultQr(); } catch (e) { console.error('Could not add the GCash QR:', e.message); }
    try { await startDecorPicker(); } catch (e) { console.error('Could not set up decorations:', e.message); }
    scheduleDailyBackups();
    app.listen(PORT, () => console.log(`Matcha POS API on http://localhost:${PORT}`));
    checkMail(); // logs whether the Gmail login for sign-up codes works
  })
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });

export default app;
