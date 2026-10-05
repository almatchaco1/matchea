import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Customers of the online ordering site (separate from staff Users)
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    phone: { type: String, trim: true, index: { unique: true, partialFilterExpression: { phone: { $type: 'string' } } } }, // 09XXXXXXXXX
    passwordHash: String,
    googleId: { type: String, index: { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } } },
    facebookId: { type: String, index: { unique: true, partialFilterExpression: { facebookId: { $type: 'string' } } } },
    email: { type: String, trim: true, lowercase: true, default: '' },
    avatar: { type: String, default: '' },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: Date,
    agreedAt: Date, // agreed to the Terms and Privacy Policy
    // Stamp card
    stamps: { type: Number, default: 0, min: 0 },
    lifetimeStamps: { type: Number, default: 0 },
    rewardsUsed: { type: Number, default: 0 },
    smsReady: { type: Boolean, default: true }, // text me when my order is ready
    // Last delivery address, filled in for the next order
    address: { area: { type: String, maxlength: 80 }, lat: Number, lng: Number, label: { type: String, maxlength: 200 }, detail: { type: String, maxlength: 120 }, landmark: { type: String, maxlength: 120 }, note: { type: String, maxlength: 160 } },
    // Saved drinks with their options, for one-tap ordering (max 10)
    favorites: [{
      label: { type: String, trim: true, maxlength: 40 },
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      sizeId: String, sweet: String, addonIds: [String], note: { type: String, maxlength: 120 },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

customerSchema.methods.checkPassword = function (pw) {
  return this.passwordHash ? bcrypt.compare(String(pw), this.passwordHash) : Promise.resolve(false);
};
customerSchema.statics.hash = (pw) => bcrypt.hash(String(pw), 10);
customerSchema.set('toJSON', {
  transform: (_d, o) => ({
    _id: o._id, name: o.name, phone: o.phone || '', email: o.email || '', avatar: o.avatar || '',
    hasPassword: !!o.passwordHash, google: !!o.googleId, facebook: !!o.facebookId, createdAt: o.createdAt,
    favorites: (o.favorites || []).map((f) => ({ _id: f._id, label: f.label || '', productId: f.productId, sizeId: f.sizeId || null, sweet: f.sweet || '', addonIds: f.addonIds || [], note: f.note || '' })),
    stamps: o.stamps || 0, lifetimeStamps: o.lifetimeStamps || 0, rewardsUsed: o.rewardsUsed || 0, smsReady: o.smsReady !== false,
    address: o.address?.area || o.address?.detail ? { area: o.address.area || '', detail: o.address.detail || '', landmark: o.address.landmark || '', note: o.address.note || '' } : null,
  }),
});

export default mongoose.model('Customer', customerSchema);
