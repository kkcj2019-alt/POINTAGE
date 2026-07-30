const fs = require('fs');
const path = process.argv[2];
if (!path) { console.log('Usage: node fix_init.js <file>'); process.exit(1); }
let s = fs.readFileSync(path, 'utf8');
const before = s.length;
// Fix 1: Add renderEmployeeCheckboxes() at init (after setupAbsenceAddListener in the init block)
s = s.replace(
  /(Initialiser les \xc3\xa9couteurs de formulaires\s+setupAbsenceAddListener\(\);\s+)(\})/g,
  '$1renderEmployeeCheckboxes();\n$2'
);
// Fix 2: parseInt -> parseFloat for hours-per-day
s = s.replace(
  /minutesPerDay: parseInt\(document\.getElementById\("absence-hours-per-day"\)\.value\) \|\| 480/g,
  'minutesPerDay: Math.round((parseFloat(document.getElementById("absence-hours-per-day").value) || 8) * 60)'
);
fs.writeFileSync(path, s);
console.log(path, s.length !== before ? 'updated (+' + (s.length - before) + ' bytes)' : 'unchanged');