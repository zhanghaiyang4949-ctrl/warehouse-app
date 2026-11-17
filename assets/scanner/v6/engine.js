(function(root){
 'use strict';
 const base=new URL('.',document.currentScript.src);let worker=null,serial=0,active=null,tail=Promise.resolve(),library=null,unavailableUntil=0;
 function abortError(){return Object.assign(Error('识别已取消'),{name:'AbortError'});}
 function reset(error){const job=active;active=null;if(worker)worker.terminate();worker=null;if(job){clearTimeout(job.timer);job.reject(error||abortError());}}
 function ensureWorker(){if(worker)return worker;if(!root.Worker)throw Error('浏览器不支持计算线程');worker=new Worker(new URL('worker.js',base));const instance=worker;worker.onmessage=event=>{if(worker!==instance)return;const m=event.data;if(!active||active.id!==m.id)return;const job=active;active=null;clearTimeout(job.timer);m.error?job.reject(Error(m.error)):job.resolve(Object.assign(m.rows,{box:m.box}));};worker.onerror=()=>{if(worker===instance)reset(Error('V6引擎加载失败'));};return worker;}
 function pixels(source){
  if(source&&source.data&&source.width&&source.height){if(source.width*source.height>8e6)throw Error('图片过大，请裁切条码区域');return {width:source.width,height:source.height,data:new Uint8ClampedArray(source.data)};}
  const w=source.naturalWidth||source.videoWidth||source.width,h=source.naturalHeight||source.videoHeight||source.height;if(!w||!h)throw Error('图片尚未加载');
  const scale=Math.min(1,3200/Math.max(w,h),Math.sqrt(8e6/(w*h))),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);return ctx.getImageData(0,0,canvas.width,canvas.height);
 }
 function legacy(){if(root.ZXing)return Promise.resolve();if(!library)library=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('../vendor/zxing-0.21.3.min.js',base);s.onload=()=>resolve();s.onerror=()=>{library=null;reject(Error('备用引擎加载失败'));};document.head.append(s);});return library;}
 async function fallback(image){await legacy();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.putImageData(new ImageData(image.data,image.width,image.height),0,0);const z=root.ZXing,reader=new z.MultiFormatReader(),hints=new Map([[z.DecodeHintType.TRY_HARDER,true],[z.DecodeHintType.POSSIBLE_FORMATS,[z.BarcodeFormat.CODE_128,z.BarcodeFormat.CODE_39,z.BarcodeFormat.ITF,z.BarcodeFormat.EAN_13,z.BarcodeFormat.QR_CODE]]]);reader.setHints(hints);try{const value=reader.decodeWithState(new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(c))));return [{text:value.getText(),format:z.BarcodeFormat[value.getBarcodeFormat()],engine:'ZXing JS 备用'}];}catch(error){if(error instanceof z.NotFoundException||error instanceof z.ChecksumException||error instanceof z.FormatException)return [];throw error;}finally{reader.reset();}}
 function decode(source,options={}){
  const {signal}=options;if(signal?.aborted)return Promise.reject(abortError());
  const job=async()=>{if(signal?.aborted)throw abortError();const image=pixels(source);if(Date.now()<unavailableUntil){const rows=await fallback(image);if(signal?.aborted)throw abortError();return rows;}const safeCopy=new Uint8ClampedArray(image.data);let cancel;
   try{return await new Promise((resolve,reject)=>{const own=++serial,w=ensureWorker();active={id:own,resolve,reject,timer:setTimeout(()=>{if(active?.id===own)reset(Error('V6识别超时，可重试或切回V5'));},options.heavy?16000:8000)};cancel=()=>{if(active?.id===own)reset(abortError());};signal?.addEventListener('abort',cancel,{once:true});w.postMessage({type:'decode',id:own,width:image.width,height:image.height,buffer:image.data.buffer,heavy:!!options.heavy,engine:options.engine==='zbar'?'zbar':undefined},[image.data.buffer]);});}
   catch(error){if(signal?.aborted||error.name==='AbortError')throw abortError();unavailableUntil=Date.now()+60000;root.console?.warn('V6暂不可用，使用本地备用解码器',error);const rows=await fallback({...image,data:safeCopy});if(signal?.aborted)throw abortError();return rows;}
   finally{if(cancel)signal?.removeEventListener('abort',cancel);}
  };
  const result=tail.then(job,job);tail=result.catch(()=>{});return result;
 }
 root.WarehouseV6={decode,reset,version:'6.0.0',pixels};root.addEventListener('pagehide',()=>reset(abortError()));
})(window);
