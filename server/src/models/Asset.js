import mongoose from 'mongoose';

// Small files stored in the database (e.g. the shop's GCash QR images)
const assetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. 'qr-gcash'
    type: { type: String, required: true }, // image/png, image/jpeg, image/webp
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Asset', assetSchema);
