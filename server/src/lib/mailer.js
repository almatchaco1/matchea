// Emails (sign-up codes), sent through any SMTP account. Easiest: the shop's Gmail with an
// "App password" (Google Account → Security → 2-Step Verification → App passwords).
// Put SMTP_USER and SMTP_PASS in server/.env to turn it on. Without them, no codes are emailed
// and Google / Facebook sign-up works without the extra code step.
import nodemailer from 'nodemailer';
import fs from 'fs';

export const mailEnabled = () => !!((process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.MAIL_LOG);

// Port 465 (SSL) first; if the network blocks it, port 587 (STARTTLS) is tried automatically.
const make = (port) => nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, requireTLS: port !== 465,
  auth: { user: String(process.env.SMTP_USER || '').trim(), pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, '') }, // Gmail shows app passwords with spaces
  connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000,
});
let tx = null;
const transport = () => { if (!tx) tx = make(+(process.env.SMTP_PORT || 465)); return tx; };
const netProblem = (e) => ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET', 'EDNS'].includes(e?.code);
async function withFallback(fn) {
  try { return await fn(transport()); }
  catch (e) {
    if (!netProblem(e) || process.env.SMTP_PORT) throw e;
    const alt = make(587);
    const r = await fn(alt);
    tx = alt; // 587 works on this network: keep using it
    return r;
  }
}

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || `AL Matcha Co <${String(process.env.SMTP_USER || '').trim()}>`;
  if (process.env.MAIL_LOG) { // testing only: write the email to a file instead of sending it
    fs.appendFileSync(process.env.MAIL_LOG, JSON.stringify({ at: new Date(), to, subject, text }) + '\n');
    return { logged: true };
  }
  return withFallback((t) => t.sendMail({ from, to, subject, text, html }));
}

/** Append a line to server/logs/signin.log (no passwords or codes are ever written). */
export function signinLog(msg) {
  try {
    const dir = new URL('../../logs/', import.meta.url);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(new URL('signin.log', dir), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
  console.log('[signin]', msg);
}

/** On startup: check the Gmail login works, and log the result. */
export async function checkMail() {
  if (process.env.MAIL_LOG) return;
  if (!mailEnabled()) { signinLog('email codes OFF (SMTP_USER / SMTP_PASS not set)'); return; }
  try { await withFallback((t) => t.verify()); signinLog(`email login OK as ${process.env.SMTP_USER} (port ${tx.options.port})`); }
  catch (e) { signinLog(`email login FAILED for ${process.env.SMTP_USER}: ${e.code || ''} ${e.responseCode || ''} ${String(e.message).slice(0, 160)}`); }
}
