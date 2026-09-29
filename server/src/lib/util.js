import Ingredient from '../models/Ingredient.js';
import StockMove from '../models/StockMove.js';

export const TZ = process.env.SHOP_TZ || 'Asia/Manila';

/** YYYY-MM-DD and hour for a moment, in the shop's timezone. */
export function shopTime(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour };
}

export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

/** Throw a 400 with per-field messages when a rules check found problems. */
export function assertValid(errs, message) {
  const keys = Object.keys(errs || {});
  if (keys.length) throw new HttpError(400, message || errs[keys[0]], errs);
}

/** Case-insensitive exact match for unique names. */
export const nameRegex = (s) => new RegExp('^' + String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');

/** Validate a from/to report range. */
export function dayRange(q, today, maxDays) {
  const from = q.from == null ? today : q.from;
  const to = q.to == null ? from : q.to;
  if (!isDay(from) || !isDay(to)) throw new HttpError(400, 'Dates must look like YYYY-MM-DD.');
  if (from > to) throw new HttpError(400, 'The start date must be on or before the end date.');
  const days = (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
  if (!(days <= maxDays)) throw new HttpError(400, `Choose a range of at most ${maxDays} days.`);
  return { from, to };
}

/**
 * Atomically change stock for several ingredients ($inc, so two registers
 * selling at the same time never overwrite each other) and log each move.
 */
export async function applyUsage(usage, sign, { reason, by, sale, note } = {}) {
  const entries = Object.entries(usage || {}).filter(([, q]) => q);
  if (!entries.length) return;
  await Ingredient.bulkWrite(
    entries.map(([id, q]) => ({ updateOne: { filter: { _id: id }, update: { $inc: { stock: sign * q } } } }))
  );
  const after = await Ingredient.find({ _id: { $in: entries.map(([id]) => id) } }, 'stock');
  const map = Object.fromEntries(after.map((i) => [String(i._id), i.stock]));
  await StockMove.insertMany(
    entries.map(([id, q]) => ({ ing: id, delta: sign * q, after: map[id], reason, by, sale, note }))
  );
}
