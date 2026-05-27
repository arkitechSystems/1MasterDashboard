// Copies server/data/gldet.json + metadata into public/data/ and
// generates available-months.json so the CRA build can serve everything
// the frontend used to fetch from /api/* as static files on GitHub Pages.
//
// Mirrors the logic in server/src/server.ts (gl-data, gl-metadata,
// available-months endpoints) so the static build is byte-equivalent
// to what the API would have returned.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const srcGl = path.join(repoRoot, 'server', 'data', 'gldet.json');
const srcMeta = path.join(repoRoot, 'server', 'data', 'gldet-metadata.json');
const outDir = path.join(repoRoot, 'public', 'data');
const outGl = path.join(outDir, 'gldet.json');
const outMeta = path.join(outDir, 'gldet-metadata.json');
const outMonths = path.join(outDir, 'available-months.json');

if (!fs.existsSync(srcGl)) {
  console.error(`Source GL data not found: ${srcGl}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

console.log(`Copying ${srcGl} -> ${outGl}`);
fs.copyFileSync(srcGl, outGl);

const stats = fs.statSync(outGl);
if (fs.existsSync(srcMeta)) {
  console.log(`Copying ${srcMeta} -> ${outMeta}`);
  fs.copyFileSync(srcMeta, outMeta);
} else {
  console.log(`No source metadata — synthesizing ${outMeta}`);
  fs.writeFileSync(outMeta, JSON.stringify({
    lastModified: stats.mtime.toISOString(),
    fileSize: stats.size,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

console.log('Generating available-months.json from ME values...');
const glData = JSON.parse(fs.readFileSync(outGl, 'utf-8'));
const meValues = [...new Set(
  glData.map(r => r.ME).filter(v => v && v !== '')
)].sort((a, b) => a - b);

const excelEpoch = new Date(1899, 11, 30).getTime();
const monthNames = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const shortMonthNames = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'];

const months = meValues.map(me => {
  const date = new Date(excelEpoch + me * 86400000);
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    value: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: `${monthNames[month]} ${year}`,
    shortLabel: `${shortMonthNames[month]} ${year}`,
    meValue: me,
    fiscalYear: month >= 7 ? year + 1 : year,
  };
});

fs.writeFileSync(outMonths, JSON.stringify(months));
console.log(`Wrote ${months.length} months -> ${outMonths}`);
console.log('Static data ready.');
