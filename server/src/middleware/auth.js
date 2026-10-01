import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role, name: user.name, sv: user.sessionVersion || 0 }, secret(), { expiresIn: '14d' });

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  try {
    const payload = jwt.verify(token, secret());
    if (payload.kind === 'customer') return res.status(401).json({ error: 'Please sign in with a staff account.' });
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'This account no longer exists.' });
    if (!user.active) return res.status(401).json({ error: 'Your account has been locked by the owner.', code: 'locked' });
    if ((payload.sv || 0) !== (user.sessionVersion || 0)) return res.status(401).json({ error: 'You were signed out by the owner. Please sign in again.', code: 'signed_out' });
    // "Online now" for the owner's Staff tab — at most one write a minute per person
    const now = Date.now();
    if (!user.lastSeenAt || now - user.lastSeenAt > 60e3) User.updateOne({ _id: user._id }, { lastSeenAt: new Date(now) }).catch(() => {});
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}

/** Short-lived admin approval ("admin PIN") for one cashier action: 'discount', 'void' or 'pickup'. */
export const signOverride = (admin, action, forUser) =>
  jwt.sign({ kind: 'override', action, by: admin.name, byId: String(admin._id), for: String(forUser) }, secret(), { expiresIn: '3m' });
export function checkOverride(token, action, forUser) {
  try {
    const p = jwt.verify(String(token || ''), secret());
    return p.kind === 'override' && p.action === action && p.for === String(forUser) ? p : null;
  } catch { return null; }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do this.' });
  next();
}
