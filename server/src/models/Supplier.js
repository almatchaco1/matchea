import mongoose from 'mongoose';

// Who you buy from (shown when receiving a delivery, and in purchase history)
const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    notes: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
