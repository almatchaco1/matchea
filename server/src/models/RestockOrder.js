import mongoose from 'mongoose';

// A shopping list sent to a supplier: "ordered" until the delivery arrives and staff receive it
const restockSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['ordered', 'received', 'cancelled'], default: 'ordered', index: true },
    items: [{
      _id: false,
      ing: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
      name: String, unit: String,
      qty: { type: Number, required: true }, // in the ingredient's unit (ml, g, pcs…)
      got: Number, // what actually arrived (set when received)
      paid: Number, // total paid for this line (set when received)
    }],
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, default: '' },
    note: { type: String, default: '' },
    estCost: { type: Number, default: 0 },
    createdBy: String,
    receivedBy: String, receivedAt: Date, paidTotal: Number,
    cancelledBy: String, cancelledAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('RestockOrder', restockSchema);
