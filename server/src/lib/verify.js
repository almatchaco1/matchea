// 6-digit sign-up codes: emailed (Google / Facebook sign-up) or texted (mobile number).
import crypto from 'crypto';
import Verify from '../models/Verify.js';
import { HttpError } from './util.js';
import { sendMail, signinLog } from './mailer.js';
import { sendSms } from './notify.js';

const CODE_MIN = 10, MAX_TRIES = 5, MAX_SENDS = 5, RESEND_SEC = 60;
const hash = (id, code) => crypto.createHash('sha256').update(`${id}:${code}:${process.env.JWT_SECRET || ''}`).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

export const mask = (kind, to) => kind === 'email'
  ? to.replace(/^(.)(.*?)(.?)@/, (_, a, mid, b) => `${a}${'•'.repeat(Math.min(6, Math.max(2, mid.length)))}${b}@`)
  : to.replace(/^(\d{4})\d{3}(\d{4})$/, '$1 ••• $2');

async function deliver(kind, to, code, pending = {}, shopName = 'AL Matcha Co') {
  const reset = pending?.type === 'reset', confirmEmail = pending?.type === 'email';
  if (kind === 'sms') {
    const r = await sendSms(to, `${code} is your ${shopName} code. It expires in ${CODE_MIN} minutes. Never share it with anyone.`);
    if (r?.skipped) throw new Error('SMS is not set up');
    return;
  }
  const digits = `<table role="presentation" cellpadding="0" cellspacing="6" style="margin:0 auto"><tr>${code.split('').map((d) => `<td width="42" height="54" align="center" valign="middle" style="width:42px;height:54px;border-radius:10px;background:#F7E1E4;color:#2B5A20;font:700 28px Georgia,serif">${d}</td>`).join('')}</tr></table>`;
  await sendMail({
    to,
    subject: reset ? `${code} is your ${shopName} password reset code` : `${code} is your ${shopName} code`,
    text: reset ? `Your ${shopName} password reset code is ${code}.\n\nIt expires in ${CODE_MIN} minutes. If you didn't ask to reset your password, you can ignore this email.\n\nGood Matcha, Good Mood` : `Your ${shopName} sign-up code is ${code}.\n\nIt expires in ${CODE_MIN} minutes. If you didn't try to sign up, you can ignore this email.\n\nGood Matcha, Good Mood`,
    html: `<div style="background:#FBEEF0;padding:28px 12px;font-family:Arial,sans-serif"><div style="max-width:440px;margin:0 auto;background:#FFFBF7;border-radius:20px;padding:28px 24px;text-align:center;color:#1D2E18">
      <div style="font:700 22px Georgia,serif;color:#2B5A20">${shopName}</div>
      <p style="margin:18px 0 6px;font-size:15px">${reset ? 'Here’s your password reset code:' : confirmEmail ? 'Here’s your code to confirm this email:' : 'Here’s your sign-up code:'}</p>
      <div style="margin:10px 0 16px">${digits}</div>
      <p style="margin:0;color:#5A6852;font-size:13px">It expires in ${CODE_MIN} minutes. ${reset ? 'If you didn’t ask to reset your password, you can ignore this email.' : 'If you didn’t try to sign up, you can ignore this email.'}</p>
      <p style="margin:22px 0 0;font:italic 16px Georgia,serif;color:#3F7A2C">Good Matcha, Good Mood</p></div></div>`,
  });
}

const view = (v) => ({ id: v._id, kind: v.kind, to: mask(v.kind, v.to), resendIn: RESEND_SEC, minutes: CODE_MIN });

/** Send a code and remember what to do when it's entered. */
export async function startVerify(kind, to, pending) {
  const v = new Verify({ kind, to, pending, codeHash: 'x', expiresAt: new Date(Date.now() + CODE_MIN * 60000) });
  const code = newCode(); v.codeHash = hash(v._id, code);
  await v.save();
  try { await deliver(kind, to, code, pending); }
  catch (e) {
    await Verify.deleteOne({ _id: v._id });
    signinLog(`could not send ${kind} code to ${mask(kind, to)}: ${e.code || ''} ${e.responseCode || ''} ${String(e.message).slice(0, 160)}`);
    throw new HttpError(502, kind === 'email' ? 'We couldn’t email your code right now. Please try again in a minute.' : 'We couldn’t text your code right now. Please check the number and try again.');
  }
  return view(v);
}

export async function resendVerify(id) {
  const v = await Verify.findById(String(id || '')).catch(() => null);
  if (!v || v.expiresAt < new Date()) throw new HttpError(410, 'This sign-up has expired. Please start again.');
  const wait = RESEND_SEC - Math.floor((Date.now() - v.sentAt) / 1000);
  if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before asking for a new code.`);
  if (v.sends >= MAX_SENDS) throw new HttpError(429, 'Too many codes sent. Please start again in a few minutes.');
  const code = newCode();
  v.codeHash = hash(v._id, code); v.sends += 1; v.sentAt = new Date(); v.tries = 0; v.expiresAt = new Date(Date.now() + CODE_MIN * 60000);
  await v.save();
  try { await deliver(v.kind, v.to, code, v.pending); } catch (e) { console.error('[verify] resend failed:', e.message); throw new HttpError(502, 'We couldn’t send a new code right now. Please try again in a minute.'); }
  return view(v);
}

/** Check a code. Returns the pending action once (the code can't be reused). */
export async function checkVerify(id, code) {
  const v = await Verify.findById(String(id || '')).catch(() => null);
  if (!v || v.expiresAt < new Date()) throw new HttpError(410, 'This code has expired. Tap “Send a new code”.', { code: 'This code has expired. Tap “Send a new code”.' });
  if (v.tries >= MAX_TRIES) throw new HttpError(429, 'Too many wrong codes. Tap “Send a new code”.', { code: 'Too many wrong codes. Tap “Send a new code”.' });
  const clean = String(code || '').replace(/\D/g, '');
  const a = Buffer.from(hash(v._id, clean)), b = Buffer.from(v.codeHash);
  if (clean.length !== 6 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    v.tries += 1; await v.save();
    const left = MAX_TRIES - v.tries;
    const m = left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Tap “Send a new code”.';
    throw new HttpError(400, m, { code: m });
  }
  const gone = await Verify.findOneAndDelete({ _id: v._id }); // one use only
  if (!gone) throw new HttpError(410, 'This code was already used.', { code: 'This code was already used.' });
  return gone;
}
