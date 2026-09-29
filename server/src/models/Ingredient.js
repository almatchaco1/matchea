import mongoose from 'mongoose';

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    cat: { type: String, default: '', trim: true, maxlength: 30 },
    unit: { type: String, default: 'g', enum: ['g', 'kg', 'ml', 'L', 'pcs', 'pack'] },
    stock: { type: Number, default: 0 },
    reorder: { type: Number, default: 0, min: 0 },
    cost: { type: Number, default: 0, min: 0 }, // ₱ per unit
    // How you buy it, e.g. 1 carton = 1000 ml for ₱150 (cost per unit is worked out from this)
    pack: { name: String, size: Number, cost: Number },
  },
  { timestamps: true }
);

export default mongoose.model('Ingredient', ingredientSchema);
