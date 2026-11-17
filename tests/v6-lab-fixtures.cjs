// Synthetic fixtures exercise plumbing only; they are not phone-photo quality evidence.
const fs=require('node:fs');
const path=require('node:path');
const ZXing=require('../assets/scanner/vendor/zxing-0.21.3.min.js');
const out=path.join(__dirname,'fixtures','v6');fs.mkdirSync(out,{recursive:true});
const text='V6-LAB-QR-20261117';
const matrix=new ZXing.MultiFormatWriter().encode(text,ZXing.BarcodeFormat.QR_CODE,256,256,new Map());
const cells=[];for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)if(matrix.get(x,y))cells.push(`M${x} ${y}h1v1h-1z`);
const truth={};for(const [name,angle,foreground,background] of [['qr-normal',0,'#000','#fff'],['qr-rotated',90,'#000','#fff'],['qr-lowcontrast',0,'#777','#bbb']]){
 const file=name+'.svg';fs.writeFileSync(path.join(out,file),`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="${background}"/><g transform="rotate(${angle} 160 160) translate(32 32)"><path fill="${foreground}" d="${cells.join('')}"/></g></svg>\n`);truth[file]=text;
}
// Code128C: fixed numeric pairs, weighted modulo-103 checksum, stop pattern.
// Patterns come directly from the existing Apache-licensed ZXing distribution.
const codeText='123456789012345678';
const pairs=codeText.match(/../g).map(Number),start=ZXing.Code128Reader.CODE_START_C;
const checksum=(start+pairs.reduce((total,value,index)=>total+value*(index+1),0))%103;
const symbols=[start,...pairs,checksum,ZXing.Code128Reader.CODE_STOP];
let moduleX=12;const bars=[];const bits=new ZXing.BitArray();
for(let i=0;i<12;i++)bits.appendBit(false);
for(const symbol of symbols){let dark=true;for(const width of ZXing.Code128Reader.CODE_PATTERNS[symbol]){if(dark)bars.push({x:moduleX,width});for(let i=0;i<width;i++)bits.appendBit(dark);moduleX+=width;dark=!dark}}
for(let i=0;i<12;i++)bits.appendBit(false);
const decoded=new ZXing.Code128Reader().decodeRow(0,bits,new Map());
if(decoded.getText()!==codeText)throw Error('Code128 fixture self-check failed');
const linearWidth=(moduleX+12)*3,linearHeight=240;
for(const [name,angle,foreground,background] of [['code128-normal',0,'#000','#fff'],['code128-rotated',90,'#000','#fff'],['code128-lowcontrast',0,'#777','#bbb']]){
 const file=name+'.svg',rotated=angle===90,width=rotated?linearHeight:linearWidth,height=rotated?linearWidth:linearHeight;
 const transform=rotated?`translate(${linearHeight} 0) rotate(90)`:'';
 const rects=bars.map(bar=>`<rect x="${bar.x*3}" y="45" width="${bar.width*3}" height="150"/>`).join('');
 fs.writeFileSync(path.join(out,file),`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/><g fill="${foreground}" transform="${transform}">${rects}</g></svg>\n`);truth[file]=codeText;
}
fs.writeFileSync(path.join(out,'truth.json'),JSON.stringify({notice:'Generated QR and Code128C fixtures only; not evidence of real phone-photo quality. Code128 patterns are from bundled Apache-licensed ZXing Code128Reader; normal row self-check passes.',expected:truth},null,2)+'\n');
fs.writeFileSync(path.join(out,'truth.tsv'),Object.entries(truth).map(([file,value])=>file+'\t'+value).join('\n')+'\n');
console.log('Generated 6 deterministic QR / Code128C SVG fixtures; Code128C reader self-check passed.');
// Keep the six single-image truth entries stable; multi-code truth is a sidecar.
function linearRects(value){
 const values=value.match(/../g).map(Number),sum=(start+values.reduce((n,v,i)=>n+v*(i+1),0))%103;
 let x=12;const rects=[],row=new ZXing.BitArray();for(let i=0;i<12;i++)row.appendBit(false);
 for(const symbol of [start,...values,sum,ZXing.Code128Reader.CODE_STOP]){let dark=true;for(const width of ZXing.Code128Reader.CODE_PATTERNS[symbol]){if(dark)rects.push(`<rect x="${x*3}" y="45" width="${width*3}" height="150"/>`);for(let i=0;i<width;i++)row.appendBit(dark);x+=width;dark=!dark}}
 for(let i=0;i<12;i++)row.appendBit(false);if(new ZXing.Code128Reader().decodeRow(0,row,new Map()).getText()!==value)throw Error('Multi-code fixture self-check failed');return rects.join('');
}
const secondText='987654321098765432';
fs.writeFileSync(path.join(out,'code128-multiple.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800"><rect width="1000" height="800" fill="white"/><g fill="black" transform="translate(80 60)">${linearRects(codeText)}</g><g fill="black" transform="translate(80 440)">${linearRects(secondText)}</g></svg>\n`);
fs.writeFileSync(path.join(out,'multi-truth.json'),JSON.stringify({notice:'Deterministic synthetic two-Code128C image; not real phone-photo evidence.',file:'code128-multiple.svg',width:1000,height:800,expected:[{text:codeText,region:{x:.08,y:.075,width:.8,height:.3}},{text:secondText,region:{x:.08,y:.55,width:.8,height:.3}}]},null,2)+'\n');
console.log('Generated distinct two-Code128C fixture and separate multi-truth.json.');
