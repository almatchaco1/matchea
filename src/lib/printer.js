// Talks to a receipt printer straight from Chrome / Edge (no print dialog).
//   usb       - USB printer (WebUSB)
//   serial    - Bluetooth printer paired in System Settings, or a USB-serial printer (Web Serial)
//   bluetooth - Bluetooth LE printer, e.g. from an Android tablet (Web Bluetooth)
// Settings are saved per device. Without a printer, the normal browser print is used.
import { receiptBytes, testBytes, logoRaster, closingBytes, labelBytes } from './escpos';

const KEY = 'matchaPos.printer';
const DEFAULTS = { kind: '', name: '', width: 32, auto: false, logo: true, labels: false };
export const loadPrinterSettings = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };
export const savePrinterSettings = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

export const support = () => ({
  usb: typeof navigator !== 'undefined' && !!navigator.usb,
  serial: typeof navigator !== 'undefined' && !!navigator.serial,
  bluetooth: typeof navigator !== 'undefined' && !!navigator.bluetooth,
});

// Common Bluetooth LE "serial" services used by cheap thermal printers
const BLE_SERVICES = [0x18f0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 0xff00, 0xffe0];

let conn = null; // { kind, write(bytes), close() }

async function openUsb(device) {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  // Prefer the printer-class interface; fall back to any interface with a bulk OUT endpoint
  const ifaces = device.configuration.interfaces;
  const pick = ifaces.find((i) => i.alternates.some((a) => a.interfaceClass === 7)) || ifaces.find((i) => i.alternates.some((a) => a.endpoints.some((e) => e.direction === 'out')));
  if (!pick) throw new Error('This USB device has no printer connection.');
  const alt = pick.alternates.find((a) => a.endpoints.some((e) => e.direction === 'out'));
  const ep = alt.endpoints.find((e) => e.direction === 'out');
  if (!pick.claimed) await device.claimInterface(pick.interfaceNumber);
  return {
    kind: 'usb', name: device.productName || 'USB printer',
    write: async (bytes) => { for (let i = 0; i < bytes.length; i += 4096) await device.transferOut(ep.endpointNumber, bytes.slice(i, i + 4096)); },
    close: () => device.close().catch(() => {}),
  };
}

async function openSerial(port) {
  if (!port.writable) await port.open({ baudRate: 9600 });
  return {
    kind: 'serial', name: 'Bluetooth / serial printer',
    write: async (bytes) => { const w = port.writable.getWriter(); try { await w.write(bytes); } finally { w.releaseLock(); } },
    close: () => port.close().catch(() => {}),
  };
}

async function openBle(device) {
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  let ch = null;
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) if (c.properties.writeWithoutResponse || c.properties.write) { ch = c; break; }
    if (ch) break;
  }
  if (!ch) throw new Error('Could not find the printer’s data channel.');
  return {
    kind: 'bluetooth', name: device.name || 'Bluetooth printer',
    write: async (bytes) => {
      for (let i = 0; i < bytes.length; i += 100) {
        const part = bytes.slice(i, i + 100);
        if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part); else await ch.writeValue(part);
      }
    },
    close: () => device.gatt.disconnect(),
  };
}

/** Ask the browser to pick a printer (needs a click). */
export async function connectPrinter(kind) {
  if (conn) { try { await conn.close(); } catch {} conn = null; }
  if (kind === 'usb') conn = await openUsb(await navigator.usb.requestDevice({ filters: [] }));
  else if (kind === 'serial') conn = await openSerial(await navigator.serial.requestPort());
  else if (kind === 'bluetooth') conn = await openBle(await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES }));
  else throw new Error('Choose how the printer is connected.');
  return conn;
}

/** Reconnect to a printer this browser already has permission for (no click needed for USB / serial). */
export async function reconnect(settings = loadPrinterSettings()) {
  if (conn) return conn;
  try {
    if (settings.kind === 'usb' && navigator.usb) { const [d] = await navigator.usb.getDevices(); if (d) conn = await openUsb(d); }
    if (settings.kind === 'serial' && navigator.serial) { const [p] = await navigator.serial.getPorts(); if (p) conn = await openSerial(p); }
    if (settings.kind === 'bluetooth' && navigator.bluetooth?.getDevices) { const [d] = await navigator.bluetooth.getDevices(); if (d) conn = await openBle(d); }
  } catch { conn = null; }
  return conn;
}

export const isConnected = () => !!conn;
export async function disconnectPrinter() { if (conn) { try { await conn.close(); } catch {} } conn = null; }

async function send(bytes) {
  const c = conn || (await reconnect());
  if (!c) throw new Error('The receipt printer isn’t connected.');
  try { await c.write(bytes); }
  catch (e) { conn = null; throw new Error(`Couldn’t print: ${e.message || 'printer not responding'}. Check it’s on and has paper.`); }
}

const logoCache = {};
async function logoFor(width) {
  try { return (logoCache[width] ||= await logoRaster(width >= 48 ? 256 : 192)); } catch { return null; } // print without it if it can't be drawn
}

/** Print a receipt on the receipt printer. Returns false when no printer is set up (use browser print). */
export async function printSale(sale, shopSettings) {
  const s = loadPrinterSettings();
  if (!s.kind) return false;
  await send(receiptBytes(sale, shopSettings, { width: s.width, logo: s.logo ? await logoFor(s.width) : null }));
  return true;
}
/** Print one label per cup on the receipt printer. Returns false when no printer is set up (use browser print). */
export async function printLabels(sale, shopSettings) {
  const s = loadPrinterSettings();
  if (!s.kind) return false;
  await send(labelBytes(sale, shopSettings, { width: s.width }));
  return true;
}
/** Print the end-of-day summary on the receipt printer. Returns false when no printer is set up. */
export async function printClosing(c, shopSettings, opts = {}) {
  const s = loadPrinterSettings();
  if (!s.kind) return false;
  await send(closingBytes(c, shopSettings, { width: s.width, ...opts }));
  return true;
}
export const printTest = () => send(testBytes({ width: loadPrinterSettings().width }));
