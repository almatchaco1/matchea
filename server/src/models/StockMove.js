import mongoose from 'mongoose';

// Audit trail: every change to an ingredient's stock.
const stockMoveSchema = new mongoose.Schema(
  {
    ing: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', index: true },
    delta: Number,
    after: Number,
    reason: { type: String, enum: ['sale', 'void', 'receive', 'count', 'create', 'waste', 'staff'] },
    note: String,
    value: Number, // ₱: amount paid (receive) or value lost (waste, count)
    why: String, // waste: spilled | expired | remade | other
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: String,
    by: String,
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  },
  { timestamps: true }
);
stockMoveSchema.index({ reason: 1, createdAt: -1 });

export default mongoose.model('StockMove', stockMoveSchema);
