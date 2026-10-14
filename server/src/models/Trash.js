import mongoose from 'mongoose';

// Archive: deleted drinks, ingredients, expenses, staff accounts and menu options (sizes, milks, add-ons,
// delivery areas), kept until the owner deletes them for good, so they can always be restored
const trashSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['product', 'ingredient', 'supplier', 'expense', 'user', 'option'], required: true },
    name: String, // shown in the list
    data: { type: mongoose.Schema.Types.Mixed, required: true }, // the whole record, as it was
    by: String,
    expiresAt: { type: Date }, // only on items from before the archive kept things for good (removed at start-up)
  },
  { timestamps: true }
);

export default mongoose.model('Trash', trashSchema);
