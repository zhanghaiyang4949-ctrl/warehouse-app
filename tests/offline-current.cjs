const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(value=>value.includes('function createGuard(o)'));
const exposed = {exports:{}};
new Function('module',script)(exposed);
module.exports = exposed.exports;
