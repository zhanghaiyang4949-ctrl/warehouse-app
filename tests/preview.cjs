const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const types = {'.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png'};
http.createServer((request,response) => {
 let file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
 if (!file.startsWith(root + path.sep) && file !== root) {response.writeHead(403);response.end();return;}
 if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
 fs.readFile(file,(error,content) => {
  if (error) {response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type',types[path.extname(file)]||'text/html');response.end(content);
 });
}).listen(8875,'127.0.0.1',()=>console.log('preview ready'));
