const fs = require('fs');
const path = 'C:/Users/ACSER DIRECTION/OneDrive/Desktop/new/HEURES TAF/index_v3.html';
let s = fs.readFileSync(path, 'utf8');
const before = s.length;
// Remove the "hide employee selector" lines in edit button handler
s = s.replace(
  'if (empSel) empSel.style.display = "none";',
  'if (empSel) empSel.style.display = "";\n            renderEmployeeCheckboxes(p.id);'
);
fs.writeFileSync(path, s);
console.log('index_v3.html:', s.length - before > 0 ? 'updated (+' + (s.length - before) + ' bytes)' : 'unchanged');