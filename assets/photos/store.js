(function(root) {
 'use strict';
 function scope(config) { return JSON.stringify([config.owner,config.repo,config.branch]); }
 function paths(hash, date = new Date()) {
  const day = date.toISOString().slice(0,10).replaceAll('-', '/');
  const prefix = 'warehouse-images/' + day + '/' + hash.slice(0,2) + '/' + hash;
  return {full:prefix+'.jpg', thumbnail:prefix+'-thumb.jpg'};
 }
 function mergeRecords(db, records) {
  const existing = db.photoAttachments || [];
  const ids = new Set(existing.map(row => row.id));
  return existing.concat(records.filter(row => !ids.has(row.id)));
 }
 function formatBytes(bytes) {
  if(!Number.isFinite(bytes)||bytes<0)return '大小未知';
  if(bytes<1024)return bytes+' B';
  return bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(2)+' MB';
 }
 function photoSizeSummary(records) {
  const known=records.every(row=>Number.isFinite(row.bytes)&&Number.isFinite(row.thumbBytes));
  const total=records.reduce((sum,row)=>sum+(row.bytes||0)+(row.thumbBytes||0),0);
  return '共 '+records.length+' 张 · '+(known?'图片合计 '+formatBytes(total)+'（含缩略图）':'部分图片大小未知');
 }
 if (typeof module !== 'undefined' && module.exports) { module.exports={scope,paths,mergeRecords,formatBytes,photoSizeSummary};return; }
 let opened;
 function database() {
  if (!opened) opened = new Promise((resolve,reject) => {
   const request = indexedDB.open('warehouse-photo-cache',1);
   request.onupgradeneeded = () => {
    request.result.createObjectStore('codecs');
    const store=request.result.createObjectStore('photos',{keyPath:'id'});
    store.createIndex('drafts',['scope','owner','stage']);
   };
   request.onsuccess = () => resolve(request.result);
   request.onerror = () => reject(request.error);
  });
  return opened;
 }
 async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve,reject) => {
   const tx = db.transaction('photos',mode), store = tx.objectStore('photos');
   let value;
   const request = action(store);
   request.onsuccess = () => {value=request.result;};
   tx.oncomplete = () => resolve(value);
   tx.onerror = () => reject(tx.error);tx.onabort = () => reject(tx.error || Error('照片本机保存失败'));
  });
 }
 const cache = {
  get:id => transaction('readonly',store=>store.get(id)),
  put:record => transaction('readwrite',store=>store.put(record)),
  remove:id => transaction('readwrite',store=>store.delete(id))
 };
 async function digest(buffer, algorithm='SHA-256') {
  return [...new Uint8Array(await crypto.subtle.digest(algorithm,buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 async function blobSha(blob) {
  const prefix=new TextEncoder().encode('blob '+blob.size+'\0'),data=new Uint8Array(prefix.length+blob.size);
  data.set(prefix);data.set(new Uint8Array(await blob.arrayBuffer()),prefix.length);
  return digest(data,'SHA-1');
 }
 function ownerKey(type,id) {return type+':'+String(id);}
 let codecPromise;
 async function prepareCodec() {
  if(codecPromise)return codecPromise;
  codecPromise=(async()=>{
   const databaseHandle=await database();
   const cached=await new Promise((resolve,reject)=>{const request=databaseHandle.transaction('codecs','readonly').objectStore('codecs').get('mozjpeg-1.6.0');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   if(cached)return cached;
   const [script,wasm]=await Promise.all([fetch('assets/photos/compress-worker.js',{cache:'force-cache'}),fetch('assets/photos/vendor/mozjpeg/codec/enc/mozjpeg_enc.wasm',{cache:'force-cache'})]);
   if(!script.ok||!wasm.ok)throw Error('请联网准备一次离线压缩组件');
   const assets={source:await script.text(),wasm:await wasm.arrayBuffer()};
   await new Promise((resolve,reject)=>{const tx=databaseHandle.transaction('codecs','readwrite');tx.objectStore('codecs').put(assets,'mozjpeg-1.6.0');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
   return assets;
  })().catch(error=>{codecPromise=null;throw error;});
  return codecPromise;
 }
 let worker;
 let cancelWorker;
 let compressionEpoch=0;
 function cancelCompression() {compressionEpoch++;cancelWorker?.();}
 async function compress(file) {
  const epoch=compressionEpoch;
  const url=URL.createObjectURL(file),image=new Image();
  try {
   image.src=url;
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('无法读取这张图片，请选择JPEG或PNG照片'));});
   if(epoch!==compressionEpoch)throw Object.assign(Error('已取消图片处理'),{cancelled:true});
   const ratio=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight));
   const width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
   const pixels=context.getImageData(0,0,width,height);
   const thumbRatio=Math.min(1,320/Math.max(width,height));
   const thumbnail=document.createElement('canvas');thumbnail.width=Math.max(1,Math.round(width*thumbRatio));thumbnail.height=Math.max(1,Math.round(height*thumbRatio));
   const thumbContext=thumbnail.getContext('2d');thumbContext.drawImage(canvas,0,0,thumbnail.width,thumbnail.height);
   const thumbPixels=thumbContext.getImageData(0,0,thumbnail.width,thumbnail.height);
   const assets=await prepareCodec();
   if(epoch!==compressionEpoch)throw Object.assign(Error('已取消图片处理'),{cancelled:true});
   const codecBase=new URL('assets/photos/vendor/mozjpeg/codec/enc/mozjpeg_enc.js',location.href).href;
   const workerURL=URL.createObjectURL(new Blob(['self.codecBase='+JSON.stringify(codecBase)+';\n'+assets.source],{type:'text/javascript'}));
   const result=await new Promise((resolve,reject)=>{
    worker=new Worker(workerURL);
    const finish=(error,value)=>{clearTimeout(timer);URL.revokeObjectURL(workerURL);worker?.terminate();worker=null;cancelWorker=null;error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('图片压缩超时，请重新选择')),120000);
    cancelWorker=()=>finish(Object.assign(Error('已取消图片处理'),{cancelled:true}));
    worker.onerror=()=>finish(Error('MozJPEG组件加载失败，请联网后重试'));
    worker.onmessage=event=>event.data.error?finish(Error(event.data.error)):finish(null,event.data);
    const wasm=assets.wasm.slice(0);
    worker.postMessage({pixels:pixels.data.buffer,width,height,thumbPixels:thumbPixels.data.buffer,thumbWidth:thumbnail.width,thumbHeight:thumbnail.height,wasm,codecBase},[pixels.data.buffer,thumbPixels.data.buffer,wasm]);
   });
   return {full:new Blob([result.full],{type:'image/jpeg'}),thumbnail:new Blob([result.thumbnail],{type:'image/jpeg'}),width,height};
  } finally {URL.revokeObjectURL(url);}
 }
 async function makeDraft(file,type,targetId) {
  const config=getGitHubConfigV44();
  if(!config.owner || !config.repo)throw Error('请先在数据安全中设置GitHub备份仓库');
  const encoded=await compress(file),hash=await digest(await encoded.full.arrayBuffer());
  const record={id:crypto.randomUUID(),targetType:type,targetId:String(targetId),note:'',name:type==='pallet'?'托盘 '+targetId+' 照片':'箱子照片',createdAt:new Date().toISOString(),hash,width:encoded.width,height:encoded.height,bytes:encoded.full.size,thumbBytes:encoded.thumbnail.size,github:{owner:config.owner,repo:config.repo,branch:config.branch,...paths(hash)}};
  await cache.put({id:record.id,record,full:encoded.full,thumbnail:encoded.thumbnail,originLocal:true,draft:true,stage:'draft',scope:scope(config),owner:ownerKey(type,targetId),uploaded:{}});
  return record;
 }
 async function drafts(type,targetId) {
  const key=scope(getGitHubConfigV44());
  return transaction('readonly',store=>store.index('drafts').getAll([key,ownerKey(type,targetId),'draft']));
 }
 root.WarehousePhotoStore={scope,paths,mergeRecords,formatBytes,photoSizeSummary,cache,digest,blobSha,prepareCodec,compress,cancelCompression,makeDraft,drafts,ownerKey};
})(typeof window!=='undefined'?window:globalThis);
