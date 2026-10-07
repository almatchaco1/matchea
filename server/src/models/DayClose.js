import mongoose from 'mongoose';

// End-of-day closing: who closed the day, the cash count and which GCash/GoTyme payments were checked.
const dayCloseSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    checked: { type: [String], default: [] }, // sale ids whose payment reference was checked
    closedAt: Date,
    closedBy: String,
    cashCounted: { type: Number, default: null },
    cashExpected: Number,
    net: Number,
    orders: Number,
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

export default mongoose.model('DayClose', dayCloseSchema);
