// One time: the shop's new name. "AL Matcha Co" becomes "Matchéa" (a name the owner typed herself is kept).
import Settings from '../models/Settings.js';

export async function renameToMatchea(log = console.log) {
  const s = await Settings.get();
  if (s.migrations?.includes('rename-matchea')) return;
  if (/^\s*al\s*matcha(\s*co\.?)?\s*$/i.test(s.name || '')) s.name = 'Matchéa';
  if (s.decorGreeting) s.decorGreeting = s.decorGreeting.replace(/AL Matcha( Co)?/g, 'Matchéa');
  s.migrations = [...(s.migrations || []), 'rename-matchea'];
  await s.save();
  log(`Shop name: ${s.name}`);
}
