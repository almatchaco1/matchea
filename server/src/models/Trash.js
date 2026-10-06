import mongoose from 'mongoose';

// Recycle bin: deleted drinks, ingredients and expenses, kept 30 days so they can be restored
const trashSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['product', 'ingredient', 'supplier', 'expense'], required: true },
    name: String, // shown in the list
    data: { type: mongoose.Schema.Types.Mixed, required: true }, // the whole record, as it was
    by: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
trashSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB removes them after 30 days

export default mongoose.model('Trash', trashSchema);
