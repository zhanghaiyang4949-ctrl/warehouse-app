const fs=require('node:fs');const root='assets/photos/vendor/mozjpeg/';
const codec=fs.readFileSync(root+'codec/enc/mozjpeg_enc.js','utf8').replace(/import\.meta\.url/g,'self.codecBase').replace(/export default Module;?/,'');
const meta=fs.readFileSync(root+'meta.js','utf8').replace(/export /g,'');
const utils=fs.readFileSync(root+'utils.js','utf8').replace(/export /g,'');
const encode=fs.readFileSync(root+'encode.js','utf8').replace(/^import .*;\r?$/gm,'').replace(/export default /g,'').replace(/export /g,'');
const handler=`\nself.onmessage = async event => {\n try {\n  self.codecBase=event.data.codecBase;\n  await init({wasmBinary:event.data.wasm});\n  const {pixels,width,height,thumbPixels,thumbWidth,thumbHeight}=event.data;\n  const full=await encode({data:new Uint8ClampedArray(pixels),width,height},{quality:70});\n  const thumbnail=await encode({data:new Uint8ClampedArray(thumbPixels),width:thumbWidth,height:thumbHeight},{quality:70});\n  self.postMessage({full,thumbnail},[full,thumbnail]);\n } catch(error) {self.postMessage({error:error.message||'图片压缩失败'});}\n};\n`;
fs.writeFileSync('assets/photos/compress-worker.js','// Bundled from @jsquash/jpeg 1.6.0 for offline Blob Workers. License retained in vendor/mozjpeg.\n'+codec+'\nconst mozjpeg_enc=Module;\n'+meta+'\n'+utils+'\n'+encode+handler);
