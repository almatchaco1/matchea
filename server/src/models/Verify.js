import mongoose from 'mongoose';

// A one-time code sent by email or text while signing up (or adding a mobile number).
// Only a hash of the code is stored. Deleted when used; expired ones are cleaned up automatically.
const verifySchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['email', 'sms'], required: true },
    to: { type: String, required: true },
    codeHash: { type: String, required: true },
    tries: { type: Number, default: 0 },
    sends: { type: Number, default: 1 },
    sentAt: { type: Date, default: Date.now },
    pending: { type: mongoose.Schema.Types.Mixed, default: {} }, // what to do once the code is right
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
verifySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.model('Verify', verifySchema);
