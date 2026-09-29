import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });

counterSchema.statics.next = async function (key) {
  const c = await this.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
};

export default mongoose.model('Counter', counterSchema);
