const fs=require('node:fs');let html=fs.readFileSync('index.html','utf8');
const qa=`<script>
(async()=>{
 const results=[];
 const check=(name,pass,details)=>{results.push({name,pass:!!pass,details});if(!pass)throw Error(name)};
 const wait=async fn=>{const until=Date.now()+5000;while(!fn()){if(Date.now()>until)throw Error('等待界面超时');await new Promise(r=>setTimeout(r,20));}};
 try {
  await wait(()=>storageReady&&window.WarehousePhotos);
  document.getElementById('ghOwnerV44').value='test-owner';document.getElementById('ghRepoV44').value='test-repo';document.getElementById('ghTokenV44').value='test-token';
  window.githubGuardRun20261023=fn=>fn();
  await WarehousePhotoStore.prepareCodec();
  const originalFetch=window.fetch;window.fetch=()=>Promise.reject(TypeError('模拟离线：禁止所有网络请求'));
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const context=canvas.getContext('2d');context.fillStyle='#cda76b';context.fillRect(0,0,1200,800);context.fillStyle='#203e56';context.font='70px sans-serif';context.fillText('BOX TEST 123',80,300);
  const file=await new Promise(r=>canvas.toBlob(r,'image/png'));
  const encoded=await WarehousePhotoStore.compress(file);const magic=new Uint8Array(await encoded.full.arrayBuffer());
  check('真实MozJPEG离线编码',magic[0]===255&&magic[1]===216,{full:encoded.full.size,thumbnail:encoded.thumbnail.size,width:encoded.width,height:encoded.height});
  const first=await WarehousePhotoStore.makeDraft(file,'draft','inbound');
  const photoDB=await new Promise((resolve,reject)=>{const r=indexedDB.open('warehouse-photo-cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const raw=await new Promise((resolve,reject)=>{const r=photoDB.transaction('photos').objectStore('photos').get(first.id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});photoDB.close();
  check('实际IndexedDB仅存图片字节而非Blob',raw.fullBytes instanceof ArrayBuffer&&raw.thumbnailBytes instanceof ArrayBuffer&&!raw.full&&!raw.thumbnail);
  const reread=await WarehousePhotoStore.cache.get(first.id);check('重新读取字节重建JPEG',new Uint8Array(await reread.full.arrayBuffer())[0]===255&&reread.full.size===first.bytes);
  await WarehousePhotos.open('draft','inbound');
  check('确认前显示压缩大小和含缩略图合计',document.querySelector('.warehouse-photo-size').textContent.includes(WarehousePhotoStore.formatBytes(first.bytes))&&document.querySelector('[data-size-summary]').textContent.includes(WarehousePhotoStore.formatBytes(first.bytes+first.thumbBytes)));
  document.querySelector('.warehouse-photo-editor [data-save]').click();await wait(()=>!document.querySelector('.warehouse-photo-editor'));
  document.querySelector('.photo-temporary-tracking input').click();check('无单号生成临时编号',document.getElementById('inExpress').value.startsWith('TEMP-'));
  document.getElementById('palletInput').value='A111';document.getElementById('inCustomer').value='QA';
  const success=await addExpress();check('照片随入库原子保存',success===true&&db.items.length===1&&db.photoAttachments.length===1&&db.photoAttachments[0].targetId===String(db.items[0].id));
  check('备份JSON只含引用',!JSON.stringify(db).includes('data:image')&&!JSON.stringify(db).includes('base64'));
  await WarehousePhotoStore.makeDraft(file,'draft','inbound');await WarehousePhotos.open('draft','inbound');document.querySelector('.warehouse-photo-editor [data-save]').click();await wait(()=>!document.querySelector('.warehouse-photo-editor'));
  document.getElementById('inExpress').value='QA-SECOND';const originalSave=window.save;window.save=async()=>false;const failed=await addExpress();window.save=originalSave;
  check('保存失败回滚货物和照片关联',failed===false&&db.items.length===1&&db.photoAttachments.length===1);
  check('保存失败保留照片草稿',document.querySelector('[data-photo-type=draft] .warehouse-photo-thumb')!==null);
  const retry=await addExpress();check('重新保存不重复关联',retry===true&&db.items.length===2&&db.photoAttachments.length===2);
  await WarehousePhotos.open('item',String(db.items[0].id));
  window.confirm=()=>true;let remove=[...document.querySelectorAll('.warehouse-photo-edit-details button')].find(x=>x.textContent==='移除');remove.click();document.querySelector('.warehouse-photo-editor [data-close]').click();
  check('取消移除不会改变已保存照片',!db.photoAttachments[0].deleted);
  await WarehousePhotos.open('item',String(db.items[0].id));remove=[...document.querySelectorAll('.warehouse-photo-edit-details button')].find(x=>x.textContent==='移除');remove.click();document.querySelector('.warehouse-photo-editor [data-save]').click();await wait(()=>!document.querySelector('.warehouse-photo-editor'));
  check('确认移除只软删除该照片关联',db.photoAttachments[0].deleted===true&&!db.photoAttachments[1].deleted&&db.items.length===2&&!!await WarehousePhotoStore.cache.get(db.photoAttachments[0].id));
  window.fetch=originalFetch;
 }catch(error){results.push({error:error.message,stack:error.stack});}
 const output=document.createElement('pre');output.id='photo-qa-result';output.textContent=JSON.stringify(results);document.body.append(output);
})();
</script>`;
html=html.replace('</body>',qa+'</body>');fs.writeFileSync('.qa-photo-bytes.html',html);
