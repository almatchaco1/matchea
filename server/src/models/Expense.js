import mongoose from 'mongoose';

// Shop expenses that aren't ingredients: rent, electricity, salaries…
const expenseSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    cat: { type: String, required: true, trim: true, maxlength: 30 },
    amount: { type: Number, required: true, min: 0.01, max: 10000000 },
    note: { type: String, default: '', trim: true, maxlength: 120 },
    by: String,
  },
  { timestamps: true }
);

export default mongoose.model('Expense', expenseSchema);
