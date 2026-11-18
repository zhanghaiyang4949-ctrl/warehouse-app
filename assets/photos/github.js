(function(root) {
 'use strict';
 const store=root.WarehousePhotoStore;
 let uploadController;
 const urls=new Map();
 function config() {return getGitHubConfigV44();}
 function endpoint(github,path) {
  if(!path?.startsWith('warehouse-images/') || path.split('/').includes('..'))throw Error('图片文件路径无效');
  return 'https://api.github.com/repos/'+encodeURIComponent(github.owner)+'/'+encodeURIComponent(github.repo)+'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 }
 async function request(url,options={},signal) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)controller.abort();
  try {
   const response=await fetch(url,{...options,cache:'no-store',signal:controller.signal});
   if(response.status===429 || response.status===403&&(response.headers.get('retry-after')||response.headers.get('x-ratelimit-remaining')==='0')) {
    const reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
    const after=Number(response.headers.get('retry-after'))*1000;
    const retryAt=Math.max(Date.now()+60000,Number.isFinite(reset)?reset:0,Date.now()+(after||0));
    localStorage.setItem('warehousePhotoRetryAt',String(retryAt));
    throw Object.assign(Error('GitHub暂时限流，照片已保留，稍后自动重试'),{status:response.status,transient:true,retryAt});
   }
   return response;
  } catch(error) {
   if(signal?.aborted)throw Object.assign(Error('已暂停照片上传，本机照片已保留，可重新同步续传'),{cancelled:true});
   if(error.name==='AbortError')throw TypeError('图片上传连接超时');
   throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 function headers(raw=false) {
  const c=config();
  if(!c.token)throw Error('请在数据安全中填写GitHub Token后读取或上传图片');
  return {Authorization:'Bearer '+c.token,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 }
 function base64(bytes) {
  let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(text);
 }
 function progress(text) {
  const el=document.querySelector('.photo-upload-progress span')||document.querySelector('[data-photo-sync-status]');
  if(el)el.textContent=text;
 }
 async function pace(signal,scope) {
  const retryAt=Number(localStorage.getItem('warehousePhotoRetryAt')||0);
  if(retryAt>Date.now())throw Object.assign(Error('GitHub限流等待中，照片暂存在本机，稍后自动重试'),{transient:true,retryAt});
  const key='warehousePhotoNextWrite:'+scope;
  const delay=Math.max(0,Number(localStorage.getItem(key)||0)-Date.now());
  if(delay){
   progress('照片已暂存，等待 '+Math.ceil(delay/1000)+' 秒后继续上传…');
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},delay);
    const cancel=()=>{clearTimeout(timer);reject(Object.assign(Error('已暂停照片上传'),{cancelled:true}));};
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
   });
  }
  localStorage.setItem(key,String(Date.now()+9000));
 }
 function storageIdentity(record) {
  const storage=record.storage;
  if(storage?.provider==='r2')return JSON.stringify(['r2',storage.bucket,storage.full,storage.thumbnail,record.hash,record.thumbHash,record.bytes,record.thumbBytes]);
  const github=record.github||{};return JSON.stringify(['github',github.owner,github.repo,github.branch,github.full,github.thumbnail]);
 }
 function complete(photo,variant) {return photo.record.storage?.provider==='r2'?root.WarehousePhotoR2.complete(photo,variant):!!photo.uploaded?.[variant];}
 async function uploadFile(photo,variant,signal) {
  if(photo.record.storage?.provider==='r2')return root.WarehousePhotoR2.uploadFile(photo,variant,signal);
  const github=photo.record.github,path=github[variant],blob=photo[variant];
  if(photo.uploaded?.[variant])return;
  if(!blob)throw Error('本机缺少待上传的照片，请在拍照的原设备上同步');
  if(store.scope(config())!==store.scope(github))throw Error('图片所属GitHub仓库与当前设置不同，请切回原仓库同步');
  const expected=await store.blobSha(blob),url=endpoint(github,path);
  let response=await request(url+'?ref='+encodeURIComponent(github.branch),{headers:headers()},signal);
  if(response.ok) {
   const file=await response.json();
   if(file.sha!==expected)throw Error('同名图片文件内容不一致，已暂停覆盖');
  } else {
   if(response.status!==404)throw Object.assign(Error('图片访问失败（'+response.status+'），请检查仓库权限'),{status:response.status});
   await pace(signal,store.scope(github));
   response=await request(url,{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({message:'Add warehouse photo',branch:github.branch,content:base64(new Uint8Array(await blob.arrayBuffer()))})},signal);
   if(response.status===409||response.status===422){
    const check=await request(url+'?ref='+encodeURIComponent(github.branch),{headers:headers()},signal);
    if(!check.ok||(await check.json()).sha!==expected)throw Object.assign(Error('图片写入发生冲突，请稍后重试'),{status:response.status});
   } else {
    if(!response.ok)throw Object.assign(Error('图片上传失败（'+response.status+'）'),{status:response.status});
    const result=await response.json();if(result.content?.sha!==expected)throw TypeError('图片上传结果未确认');
   }
  }
  photo.uploaded={...photo.uploaded,[variant]:expected};await store.cache.put(photo);
 }
 async function pending(records) {
  for(const record of records||[]) {
   if(record.deleted)continue;
   const photo=await store.cache.get(record.id);
   if(photo?.originLocal&&storageIdentity(photo.record)!==storageIdentity(record))throw Error('照片存储信息已变化，请重新预览');
   if(photo?.originLocal&&(!complete(photo,'full')||!complete(photo,'thumbnail')))return true;
  }
  return false;
 }
 async function upload(records) {
  const execute=async()=>{
   uploadController=new AbortController();const signal=uploadController.signal;
   const footer=document.querySelector('.offline-review-dialog footer');
   const bar=document.createElement('div');bar.className='photo-upload-progress';bar.innerHTML='<span>正在准备上传照片…</span><button type="button" class="gray">暂停上传</button>';
   bar.querySelector('button').onclick=()=>uploadController?.abort();footer?.prepend(bar);
   try {
    let index=0;
    for(const record of records||[]) {
     if(record.deleted)continue;
     const photo=await store.cache.get(record.id);if(!photo?.originLocal)continue;
     if(store.scope(photo.record.github)!==store.scope(config()))throw Error('图片所属仓库与当前设置不同，请切回原仓库同步');
     if(storageIdentity(photo.record)!==storageIdentity(record))throw Error('照片存储信息已变化，请重新预览');
     index++;progress('正在上传第 '+index+' 张照片…');
     try {
      if(!complete(photo,'full')||!complete(photo,'thumbnail')){
      // Materialize legacy IndexedDB blobs before any network write. New cache records use bytes.
      for(const variant of ['full','thumbnail'])if(!complete(photo,variant)) {
       if(!photo[variant])throw Error('缺少照片内容');
       photo[variant]=new Blob([await store.readBlobBytes(photo[variant])],{type:'image/jpeg'});
      }
      await store.cache.put(photo);
      }
     }catch(cause){
      if(!['NotFoundError','NotReadableError'].includes(cause.name))throw cause;
      const item=typeof db!=='undefined'?(db.items||[]).find(row=>record.targetType==='item'&&String(row.id)===String(record.targetId)):null;
      const label=item?'单号 '+item.express:record.name||('照片 '+record.id);
      throw Object.assign(Error('第 '+index+' 张照片（'+label+'）的本机内容无法读取。请到对应货物或托盘的图片中重新选图；仅添加新图不能修复旧图，需移除不可用旧图后保存，再同步。货物记录仍保留。'),{name:cause.name||'Error',photoId:record.id,cause});
     }
     await uploadFile(photo,'full',signal);await uploadFile(photo,'thumbnail',signal);
    }
   } finally {bar.remove();uploadController=null;}
  };
  if(navigator.locks)return navigator.locks.request('warehouse-photo-uploader',execute);
  return execute();
 }
 async function imageURL(record,variant='thumbnail') {
  const key=record.id+':'+variant+':'+storageIdentity(record);
  if(urls.has(key)){const value=urls.get(key);urls.delete(key);urls.set(key,value);return value;}
  let cached=await store.cache.get(record.id);
  if(cached?.record&&storageIdentity(cached.record)!==storageIdentity(record))throw Error('照片存储信息与本机缓存不同，已保留本机照片，请重新预览');
  let blob=cached?.[variant];
  if(!blob){
   if(record.storage?.provider==='r2'){blob=await root.WarehousePhotoR2.read(record,variant);}
   else {const github=record.github,response=await request(endpoint(github,github[variant])+'?ref='+encodeURIComponent(github.branch),{headers:headers(true)});
   if(!response.ok)throw Error('图片尚未上传或当前账号无读取权限');
   blob=new Blob([await response.arrayBuffer()],{type:'image/jpeg'});}
   cached={...cached,id:record.id,record,stage:'saved',draft:false,uploaded:{...cached?.uploaded,[variant]:true},[variant]:blob};
   await store.cache.put(cached);
  }
  const url=URL.createObjectURL(blob);urls.set(key,url);
  if(urls.size>60){const first=urls.keys().next().value;URL.revokeObjectURL(urls.get(first));urls.delete(first);}
  return url;
 }
 window.addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();});
 root.WarehousePhotoGit={pending,upload,imageURL};
})(window);
