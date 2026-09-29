// Tiny Excel (.xlsx) writer: no extra packages. Makes a real workbook with
// several sheets, bold headers, peso formatting and column widths.
//   saveXlsx('report.xlsx', [{ name: 'Orders', columns: [{ header: 'Total', type: 'peso', width: 12 }], rows: [[123.5]] }])
// Column types: text | peso | int | num | pct (a number like 42.5 shown as 42.5%) | date (YYYY-MM-DD text)

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const STYLE = { text: 0, head: 1, peso: 2, int: 3, num: 4, pct: 5, title: 6, total: 7, totalText: 8 };

function sheetXml({ columns, rows, title, totals }) {
  const out = [];
  let r = 0;
  const cell = (c, v, type, style) => {
    const ref = `${colName(c)}${r}`;
    if (v == null || v === '') return '';
    if (type !== 'text' && type !== 'date' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style ?? STYLE[type] ?? 0}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${style ?? 0}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  if (title) { r++; out.push(`<row r="${r}" ht="22" customHeight="1">${cell(0, title, 'text', STYLE.title)}</row>`); r++; out.push(`<row r="${r}"/>`); }
  r++; const headRow = r;
  out.push(`<row r="${r}">${columns.map((c, i) => cell(i, c.header, 'text', STYLE.head)).join('')}</row>`);
  for (const row of rows) { r++; out.push(`<row r="${r}">${columns.map((c, i) => cell(i, row[i], c.type || 'text')).join('')}</row>`); }
  if (totals) { r++; out.push(`<row r="${r}">${columns.map((c, i) => cell(i, totals[i], typeof totals[i] === 'number' ? c.type || 'num' : 'text', typeof totals[i] === 'number' ? STYLE.total : STYLE.totalText)).join('')}</row>`); }
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || Math.max(10, String(c.header).length + 4)}" customWidth="1"/>`).join('');
  const last = `${colName(columns.length - 1)}${Math.max(headRow, r)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${out.join('')}</sheetData>${rows.length ? `<autoFilter ref="A${headRow}:${last}"/>` : ''}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="166" formatCode="#,##0.##"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF2B5A20"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B5A20"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7E1E4"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf borderId="0" fillId="0" fontId="0" numFmtId="0" xfId="0"/>
<xf borderId="0" numFmtId="0" fontId="1" fillId="2" applyFont="1" applyFill="1" xfId="0"/>
<xf borderId="0" fillId="0" fontId="0" numFmtId="164" applyNumberFormat="1" xfId="0"/>
<xf borderId="0" fillId="0" fontId="0" numFmtId="3" applyNumberFormat="1" xfId="0"/>
<xf borderId="0" fillId="0" fontId="0" numFmtId="166" applyNumberFormat="1" xfId="0"/>
<xf borderId="0" fillId="0" fontId="0" numFmtId="165" applyNumberFormat="1" xfId="0"/>
<xf borderId="0" fillId="0" numFmtId="0" fontId="2" applyFont="1" xfId="0"/>
<xf borderId="0" numFmtId="164" fontId="3" fillId="3" applyNumberFormat="1" applyFont="1" applyFill="1" xfId="0"/>
<xf borderId="0" numFmtId="0" fontId="3" fillId="3" applyFont="1" applyFill="1" xfId="0"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// ---- zip (stored, no compression) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = enc.encode(text), nm = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const size = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function makeXlsx(sheets) {
  const clean = (n, i) => (String(n || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`);
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(clean(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files);
}

export function saveXlsx(filename, sheets) {
  const url = URL.createObjectURL(makeXlsx(sheets));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
