/* Fixed local WASM assets; this worker never accesses inventory or backup APIs. */
'use strict';
importScripts('pixels.js','vendor/zxing-wasm-3.1.7.js');
ZXingWASM.prepareZXingModule({overrides:{locateFile:path=>new URL('vendor/'+path,self.location.href).href}});
let zbarReady=false;
const formats=['Code128','Code39','ITF','EAN13','EAN8','UPCA','UPCE','QRCode'];
async function read(image,enhanced=false){return (await ZXingWASM.readBarcodes(image,{formats,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain',maxNumberOfSymbols:8})).filter(x=>!x.error&&x.isValid!==false).map(x=>({text:x.text,format:x.format,engine:'ZXing-C++ WASM',enhanced}));}
async function run(message){
 const image={data:new Uint8ClampedArray(message.buffer),width:message.width,height:message.height};
 if(image.width*image.height*4!==image.data.length)throw Error('无效图片像素');
 let rows=message.engine==='zbar'?[]:await read(image);
 if(!rows.length&&(message.heavy||message.engine==='zbar')){
  const enhanced={...image,data:WarehouseV6Pixels.contrast(image.data)};if(message.engine!=='zbar')rows=await read(enhanced,true);
  if(!rows.length){
   if(!zbarReady){importScripts('vendor/zbar-0.11.0.js');zbarWasm.setModuleArgs({locateFile:()=>new URL('vendor/zbar.wasm',self.location.href).href});zbarReady=true;}
   rows=(await zbarWasm.scanImageData(image)).map(x=>({text:x.decode(),format:x.typeName,engine:'ZBar WASM',enhanced:true}));
  }
 }
 return {rows:WarehouseV6Pixels.unique(rows),box:WarehouseV6Pixels.stripeBox(image.data,image.width,image.height)};
}
let queue=Promise.resolve();
self.onmessage=event=>{const m=event.data;if(m.type==='decode')queue=queue.then(async()=>{try{self.postMessage({id:m.id,...await run(m)});}catch(error){self.postMessage({id:m.id,error:error.message||String(error)});}});};
