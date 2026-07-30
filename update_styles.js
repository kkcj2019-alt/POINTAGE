const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const replacement = '<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal($1)}</span>';

code = code.replace(/<span[^>]*>\(\$\{minutesToDecimal\(([^)]+)\)\}\)<\/span>/g, replacement);
code = code.replace(/<small[^>]*>\(\$\{minutesToDecimal\(([^)]+)\)\}\)<\/small>/g, replacement);
code = code.replace(/<span class="kpi-decimal">\(\$\{minutesToDecimal\(([^)]+)\)\}\)<\/span>/g, replacement);

fs.writeFileSync('app.js', code);
