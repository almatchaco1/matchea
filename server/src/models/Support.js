import mongoose from 'mongoose';

// Customer service chat: one conversation per customer (customer ↔ shop staff)
const threadSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    topic: { type: String, default: '' }, // what the latest conversation is about
    orderNo: { type: Number, default: null }, // the order it is about, if any
    orderCode: { type: String, default: '' },
    lastAt: { type: Date, default: Date.now },
    lastText: { type: String, default: '' },
    lastFrom: { type: String, default: 'customer' },
    unreadStaff: { type: Number, default: 0 }, // customer messages staff haven't opened
    unreadCustomer: { type: Number, default: 0 }, // staff replies the customer hasn't seen
  },
  { timestamps: true }
);
threadSchema.index({ lastAt: -1 });

const msgSchema = new mongoose.Schema(
  {
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportThread', required: true, index: true },
    from: { type: String, enum: ['customer', 'staff', 'system'], required: true },
    staffName: { type: String, default: '' },
    text: { type: String, default: '' },
    orderNo: { type: Number, default: null },
    orderCode: { type: String, default: '' },
    img: { type: Buffer, select: false },
    imgType: { type: String, default: '' },
  },
  { timestamps: true }
);

export const SupportThread = mongoose.model('SupportThread', threadSchema);
export const SupportMsg = mongoose.model('SupportMsg', msgSchema);
