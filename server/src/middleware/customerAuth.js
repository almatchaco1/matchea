import jwt from 'jsonwebtoken';
import Customer from '../models/Customer.js';

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

export const signCustomer = (c) => jwt.sign({ sub: String(c._id), kind: 'customer' }, secret(), { expiresIn: '60d' });

async function load(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try {
    const p = jwt.verify(token, secret());
    if (p.kind !== 'customer') return null;
    return await Customer.findById(p.sub);
  } catch { return null; }
}

/** Requires a signed-in customer. */
export async function requireCustomer(req, res, next) {
  const c = await load(req);
  if (!c) return res.status(401).json({ error: 'Please sign in to continue.', code: 'signin' });
  req.customer = c;
  next();
}
