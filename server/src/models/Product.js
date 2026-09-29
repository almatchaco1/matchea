import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    cat: { type: String, default: 'Other', trim: true, maxlength: 30 },
    desc: { type: String, default: '', trim: true, maxlength: 120 },
    image: { type: String, default: '', trim: true, maxlength: 300 }, // e.g. /drinks/matcha-latte.jpg
    // Add-ons allowed for this drink (ids from Settings.addons). Missing = all add-ons allowed.
    addons: { type: [String], default: undefined },
    price: { type: Number, required: true, min: 0.01, max: 10000 }, // base price, VAT-inclusive
    hasSizes: { type: Boolean, default: true },
    milkQty: { type: Number, default: 0, min: 0 }, // ml of the chosen milk per base-size drink
    sweet: { type: Boolean, default: true }, // offer a sweetness choice
    active: { type: Boolean, default: true },
    available: { type: Boolean, default: true }, // false = shown as "Not available", can't be ordered
    bestSeller: { type: Boolean, default: false }, // "Best seller" badge on the menus
    sort: { type: Number, default: 50 },
    steps: { type: [String], default: [] }, // how to make it, shown on the Barista screen
    recipe: [
      {
        _id: false,
        ing: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
        qty: { type: Number, required: true, min: 0 },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);
