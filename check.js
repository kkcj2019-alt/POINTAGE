const fs = require('fs');
const file = 'C:\\Users\\ACSER DIRECTION\\OneDrive\\Desktop\\new\\HEURES TAF\\app_v4.js';
let content = fs.readFileSync(file, 'utf8');

console.log("Length:", content.length);
console.log("Includes MP check:", content.includes('state.pointages[empId][dateKey].arrivee = "MP";'));
console.log("Includes Non justifie:", content.includes('Non justifi'));
console.log("Includes close month:", content.includes('Voulez-vous vraiment cl'));
console.log("Includes arriveeVal:", content.includes('const arriveeVal = pt.arrivee || "";'));

