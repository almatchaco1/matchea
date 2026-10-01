// One time: the old on/off "seasonal decorations" switch becomes the decoration picker.
// Shops that had it on keep the Christmas look they were seeing (lights + snow) until they pick their own.
import Settings from '../models/Settings.js';
import { GREETINGS } from '../../../src/shared/decor.mjs';

export async function startDecorPicker(log = console.log) {
  const s = await Settings.get();
  if (s.migrations?.includes('decor-picker')) return;
  const raw = await Settings.collection.findOne({ _id: s._id }, { projection: { seasonal: 1 } });
  const wasOn = raw?.seasonal !== false;
  if (wasOn && !s.decor?.length) { s.decor = ['lights', 'snow']; s.decorGreeting = GREETINGS[0]; }
  s.migrations = [...(s.migrations || []), 'decor-picker'];
  await s.save();
  await Settings.collection.updateOne({ _id: s._id }, { $unset: { seasonal: '' } });
  if (wasOn) log('Decorations: kept Christmas lights + snow (change them in Menu → Shop & options).');
}
