import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    cat: String,
    mods: String,
    qty: Number,
    unit: Number,
    total: Number,
    cost: Number, // ingredient cost of this line when it was sold
    sizeId: String, milkId: String, addonIds: [String], // choices, so the Barista screen can show the recipe
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    no: { type: Number, required: true }, // order number, restarts daily
    date: { type: String, required: true, index: true }, // YYYY-MM-DD in shop timezone
    hour: { type: Number, min: 0, max: 23 },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cashierName: String,
    customer: { type: String, default: '' },
    source: { type: String, enum: ['pos', 'online'], default: 'pos', index: true },
    phone: { type: String, default: '' }, // online orders: customer's mobile number
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true, sparse: true },
    pickupNote: { type: String, default: '' },
    trackCode: { type: String, index: true, sparse: true }, // secret code in the customer's tracking link
    acceptedAt: Date, readyAt: Date, completedAt: Date, cancelledAt: Date,
    cancelReason: String,
    stockDeducted: { type: Boolean, default: true },
    // Online payment (PayMongo)
    paidOnline: { type: Boolean, default: false },
    paidAt: Date,
    checkoutId: String,
    checkoutUrl: String,
    // Paid by scanning the shop's QR when ordering online; staff checks their GCash / Maya, then accepts
    qrPay: { method: String, ref: String, at: Date, verified: Boolean, verifiedBy: String, shot: Boolean, shotHash: String, shotPrint: String, // shot: customer attached a receipt screenshot (hash of the picture + of the original file)
      shotReused: { no: Number, date: String, code: String, same: Boolean }, // set when this screenshot was already used for another order
      paidAt: Date, timeOld: Number }, // paidAt: time on the customer's receipt; timeOld: minutes it was before the order (set when that's suspiciously long)
    noShow: { type: Boolean, default: false }, // cancelled because the customer never picked it up
    refundDue: { type: Boolean, default: false }, // paid online, then cancelled: refund in the PayMongo dashboard
    lines: [lineSchema],
    subtotal: Number,
    discount: { type: { type: String, default: 'none' }, pct: Number, amount: Number, idNo: String, idName: String, approvedBy: String }, // idNo/idName: Senior / PWD; approvedBy: admin who OK'd a big discount
    total: Number,
    cost: Number, // ingredient cost of the whole order when it was sold
    vat: Number,
    vatExempt: Number,
    pay: {
      method: { type: String, enum: ['cash', 'gcash', 'maya', 'online', 'unpaid', 'staff'], required: true },
      tendered: Number,
      change: Number,
      ref: { type: String, default: '' },
    },
    usage: [{ _id: false, ing: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient' }, qty: Number }], // amounts deducted from stock
    // POS sales are 'paid' straight away. Online orders go new → preparing → ready → paid (or cancelled).
    status: { type: String, enum: ['awaiting_payment', 'new', 'preparing', 'ready', 'paid', 'cancelled', 'void', 'staff'], default: 'paid', index: true },
    // Stamp card
    stampsUsed: { type: Number, default: 0 },      // 9 when this order used a free drink
    stampsReturned: Boolean,
    stampsAwarded: { type: Number, default: null }, // set once the order is completed
    stampsBalance: Number,                          // customer's stamps right after this order
    stampsTakenBack: Boolean,
    readyNotified: Boolean,
    // Barista screen
    lineDone: { type: [Number], default: undefined }, // drinks already made (line numbers)
    baristaDone: Boolean, madeAt: Date, madeBy: String,
    // Customer's private rating after pickup
    rating: { stars: { type: Number, min: 1, max: 5 }, comment: { type: String, maxlength: 300 }, at: Date },
    // Free drink for a staff member: stock is used, but it isn't a sale
    staffFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, staffForName: String,
    voidedAt: Date,
    voidedBy: String,
    voidApprovedBy: String, // admin whose PIN allowed a cashier's void
    voidReason: String,
  },
  { timestamps: true }
);

saleSchema.index({ date: 1, no: 1 }, { unique: true });

export default mongoose.model('Sale', saleSchema);
