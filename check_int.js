const fs = require('fs');
const s = fs.readFileSync('C:/Users/ACSER DIRECTION/OneDrive/Desktop/new/HEURES TAF/index_v2.html', 'utf8');
const idx = s.indexOf('absence-hours-per-day');
console.log('absence-hours-per-day at:', idx);
// Find parseInt near that field
const after = s.substring(idx, idx + 500);
const pIdx = after.indexOf('parseInt');
console.log('parseInt found nearby:', pIdx > -1);
if (pIdx > 0) {
  console.log('Context:', after.substring(pIdx, pIdx + 100));
}