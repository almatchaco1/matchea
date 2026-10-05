import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'shop', unique: true },
    name: { type: String, default: 'Matchéa' },
    address: { type: String, default: '' },
    tin: { type: String, default: '' },
    footer: { type: String, default: 'Thank you! Come back soon.' },
    vat: { type: Number, default: 0, min: 0, max: 100 }, // 0: not VAT-registered
    sizes: [{ label: String, price: { type: Number, default: 0 }, mult: { type: Number, default: 1 }, cup: { type: ObjectId, ref: 'Ingredient', default: null } }],
    milks: [{ label: String, price: { type: Number, default: 0 }, ing: { type: ObjectId, ref: 'Ingredient', default: null } }],
    addons: [{ label: String, price: { type: Number, default: 0 }, ing: { type: ObjectId, ref: 'Ingredient', default: null }, qty: { type: Number, default: 0 } }],
    sweetness: { type: [String], default: ['0%', '25%', '50%', '75%', '100%'] },
    // Store info shown in the website footer (all optional)
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    hours: { type: String, default: '' }, // up to 4 lines, e.g. 'Mon–Sat 10am–8pm'
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    onlineOpen: { type: Boolean, default: true }, // customers can place online orders
    onlineMessage: { type: String, default: '', maxlength: 160 }, // shown on the order page (e.g. 'Closed for the day')
    // Pay by scanning the shop's own GCash / Maya QR (v = image version, 0 = no image)
    qr: {
      gcash: { v: { type: Number, default: 0 }, name: { type: String, default: '' }, number: { type: String, default: '' }, payload: { type: String, default: '' } },
      maya: { v: { type: Number, default: 0 }, name: { type: String, default: '' }, number: { type: String, default: '' }, payload: { type: String, default: '' } },
    },
    qrOnline: { type: Boolean, default: true }, // customers can pay by QR when ordering online
    payAtPickup: { type: Boolean, default: true }, // online orders may be paid at the counter
    dailyGoal: { type: Number, default: 0, min: 0 }, // ₱ sales target per day (0 = off)
    decor: { type: [String], default: [] }, // decorations picked by the owner (ids from src/shared/decor.mjs)
    decorGreeting: { type: String, default: '', maxlength: 80 }, // greeting shown on the website home page
    decorPos: { type: Boolean, default: true }, // also show the top string (lights, flags…) on the POS
    // Delivery by Lalamove (the shop books it). Nearby areas only, each with its fee; free from freeDrinks drinks (the shop pays).
    delivery: {
      enabled: { type: Boolean, default: false }, label: { type: String, default: '' },
      areas: { type: [{ _id: false, name: String, fee: Number }], default: [] },
      freeDrinks: { type: Number, default: 5 },
    },
    backupCopyDir: { type: String, default: '' }, // extra copy of each backup (e.g. Google Drive folder)
    migrations: { type: [String], default: [] }, // one-time setup steps already done (e.g. the default GCash QR)
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  return (await this.findOne({ key: 'shop' })) || this.create({ key: 'shop', sizes: [{ label: 'Regular', price: 0, mult: 1 }] });
};

export default mongoose.model('Settings', settingsSchema);
