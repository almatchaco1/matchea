import mongoose from 'mongoose';

// Staff activity the owner can review: sign-ins, wrong PINs, locks, PIN changes…
export const LOG_TYPES = ['created', 'login', 'logout', 'wrong_pin', 'pin_lockout', 'blocked_login', 'locked', 'unlocked', 'signed_out', 'pin_changed', 'role_changed', 'lockout_cleared', 'removed', 'renamed', 'approved'];

const staffLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  userName: String,
  type: { type: String, enum: LOG_TYPES, required: true },
  note: String,
  by: String,          // who did it (for owner actions)
  ip: String,
  createdAt: { type: Date, default: Date.now },
});
staffLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 864e2 }); // keep 180 days

const StaffLog = mongoose.model('StaffLog', staffLogSchema);
export default StaffLog;

export const logStaff = (user, type, extra = {}) =>
  StaffLog.create({ user: user._id, userName: user.name, type, ...extra }).catch(() => {});
