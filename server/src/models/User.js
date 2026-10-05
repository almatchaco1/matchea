import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    pinHash: { type: String, required: true },
    pinLen: Number,                               // digits in the current PIN (6 = current rule; older PINs must be changed)
    role: { type: String, enum: ['admin', 'cashier'], default: 'cashier' },
    superAdmin: { type: Boolean, default: false }, // the shop owner: always admin, can't be locked, demoted or removed
    active: { type: Boolean, default: true },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },   // paused after too many wrong PINs
    lastLoginAt: Date,
    lastSeenAt: Date,                             // last request from their POS screen
    lastLogoutAt: Date,
    lockReason: String,                           // why the owner locked the account
    lockedAt: Date,
    lockedBy: String,
    sessionVersion: { type: Number, default: 0 }, // bump to sign someone out everywhere
  },
  { timestamps: true }
);

// Makes sure exactly one account is the super admin (the account named "Owner", else the oldest admin).
userSchema.statics.ensureSuperAdmin = async function () {
  if (await this.exists({ superAdmin: true })) return null;
  const pick = (await this.findOne({ role: 'admin', name: /^owner$/i })) || (await this.findOne({ role: 'admin' }).sort('createdAt'));
  if (!pick) return null;
  await this.updateOne({ _id: pick._id }, { superAdmin: true, role: 'admin', active: true });
  return pick.name;
};

userSchema.methods.checkPin = function (pin) {
  return bcrypt.compare(String(pin), this.pinHash);
};
userSchema.statics.hashPin = (pin) => bcrypt.hash(String(pin), 10);
userSchema.set('toJSON', { transform: (_d, o) => { o.needsNewPin = o.pinLen !== 6; delete o.pinHash; delete o.sessionVersion; delete o.pinLen; return o; } });

export default mongoose.model('User', userSchema);
