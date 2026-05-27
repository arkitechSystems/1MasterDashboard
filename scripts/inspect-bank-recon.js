const path = require('path');
const XLSX = require('xlsx');

const file = path.resolve(__dirname, '..', 'Reference', 'Example Bank Recon.xlsm');
const wb = XLSX.readFile(file);

console.log('Sheets:', wb.SheetNames);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws['!ref'] || 'EMPTY';
  console.log(`\n=== ${name} (${ref}) ===`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const preview = rows.slice(0, 20);
  preview.forEach((row, i) => {
    const cells = (row || []).map(v => v === null ? '' : String(v).slice(0, 30));
    console.log(`  R${i + 1}: [${cells.join(' | ')}]`);
  });
  if (rows.length > 20) {
    console.log(`  ... (${rows.length - 20} more rows)`);
  }
}
