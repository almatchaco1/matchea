// Clear all sales and reports so the shop looks brand new (a backup is made first).
// Usage: npm run fresh-start
import 'dotenv/config';
import mongoose from 'mongoose';
import { freshStart } from './lib/freshStart.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/matcha_pos');
await freshStart();
await mongoose.disconnect();
