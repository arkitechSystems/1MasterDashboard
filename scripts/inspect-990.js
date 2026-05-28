const XLSX = require('xlsx');

const file = process.argv[2];
const sheetName = process.argv[3];
const mode = process.argv[4] || 'cells';

const wb = XLSX.readFile(file, { cellFormula: true, cellStyles: true });
const sheet = wb.Sheets[sheetName];
if (!sheet) {
  console.error('No sheet:', sheetName);
  process.exit(1);
}
const range = XLSX.utils.decode_range(sheet['!ref']);

const colA = (n) => XLSX.utils.encode_col(n);
const getFill = (s) => {
  if (!s || !s.fill || !s.fill.fgColor) return '';
  if (s.fill.fgColor.rgb) return s.fill.fgColor.rgb;
  return JSON.stringify(s.fill.fgColor);
};

for (let r = range.s.r; r <= range.e.r; r++) {
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[addr];
    if (!cell) continue;
    const v = cell.v;
    const f = cell.f ? ' = ' + cell.f : '';
    const s = cell.s ? ' [fill:' + getFill(cell.s) + ']' : '';
    if (mode === 'all' || cell.f || (v !== undefined && v !== '')) {
      console.log(`${addr}: ${JSON.stringify(v)}${f}${s}`);
    }
  }
}
