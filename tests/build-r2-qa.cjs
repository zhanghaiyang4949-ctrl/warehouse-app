// Fake-service integration only. No real bucket, credentials or inventory.
const fs=require('node:fs');
const qa=`<script>(async()=>{
const results=[],check=(name,pass)=>{results.push({name,pass:!!pass});if(!pass)throw Error(name)},wait=async(fn)=>{const end=Date.now()+12000;while(!fn()){if(Date.now()>end)throw Error('等待测试页面超时');await new Promise(r=>setTimeout(r,30))}};
try{
 await wait(()=>storageReady&&window.WarehousePhotoR2&&window.WarehousePhotos);
 for(const [id,value]of Object.entries({ghOwnerV44:'fixture-owner',ghRepoV44:'fixture-backup',ghBranchV44:'main',ghTokenV44:'private-fixture-token'}))document.getElementById(id).value=value;
 check('未启用时新照片默认GitHub',WarehousePhotoR2.config().provider==='github');
 const objects=new Map(),calls=[],puts=[],realFetch=window.fetch.bind(window);let denied=false,drop=true;
 WarehouseQueryAccessTransport.call=async(action,args={})=>{
  calls.push(action);if(denied)throw Error('请先输入查询管理密钥');
  if(action==='adminR2Info')return {enabled:true,bucket:'fixture-private'};
  const record=args.record;
  if(action==='adminR2Upload')return {files:Object.fromEntries(['full','thumbnail'].map(v=>[v,{exists:objects.has(record.storage[v]),url:location.origin+'/r2-fixture/'+record.storage[v],headers:{'content-type':'image/jpeg','x-amz-content-sha256':v==='full'?record.hash:record.thumbHash}}]))};
  if(action==='adminR2Verify'){const bytes=objects.get(record.storage[args.variant]);if(!bytes||await WarehousePhotoStore.digest(bytes)!==(args.variant==='full'?record.hash:record.thumbHash))throw Error('校验失败');return {verified:true};}
  if(action==='adminR2Read')return {url:location.origin+'/r2-fixture/'+record.storage[args.variant]};throw Error('unexpected '+action);
 };
 window.fetch=async(url,options={})=>{const s=String(url);if(s.startsWith(location.origin+'/r2-fixture/')){const key=s.split('/r2-fixture/')[1];if(options.method==='PUT'){puts.push(key);check('图片为二进制Blob直传',options.body instanceof Blob);objects.set(key,await options.body.arrayBuffer());if(drop){drop=false;throw TypeError('模拟上传响应丢失')}return new Response('',{status:200});}const bytes=objects.get(key);return bytes?new Response(bytes,{headers:{'content-type':'image/jpeg'}}):new Response('',{status:404});}if(s.startsWith('https://api.github.com/'))throw Error('R2新图不应请求GitHub');return realFetch(url,options);};
 const settings=document.querySelector('.warehouse-photo-r2-settings'),select=settings.querySelector('select'),button=settings.querySelector('button');
 select.value='r2';select.onchange();check('没有连接时不能误选R2',WarehousePhotoR2.config().provider==='github'&&select.value==='github');
 await button.onclick();select.value='r2';select.onchange();check('检查私有桶后明确切换新照片',WarehousePhotoR2.config().provider==='r2'&&settings.querySelector('small').textContent.includes('仅影响'));
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;canvas.getContext('2d').fillRect(0,0,320,180);const file=await new Promise(r=>canvas.toBlob(r,'image/png'));
 const record=await WarehousePhotoStore.makeDraft(file,'item','r2-qa');check('真实压缩草稿包含R2定位及缩略图哈希',record.storage.provider==='r2'&&record.storage.bucket==='fixture-private'&&/^[a-f0-9]{64}$/.test(record.thumbHash));
 check('本机草稿没有长期凭据或签名地址',!JSON.stringify(record).includes('private-fixture-token')&&!JSON.stringify(record).includes('Signature'));
 try{await WarehousePhotoGit.upload([record]);throw Error('drop must fail')}catch(e){check('响应丢失不误报完成',e.message.includes('响应丢失')&&await WarehousePhotoGit.pending([record]));}
 await WarehousePhotoGit.upload([record]);check('续传仅补缺失文件且校验成功',puts.length===2&&!await WarehousePhotoGit.pending([record]));
 const cached=await WarehousePhotoStore.cache.get(record.id);check('大图和缩略图均有对应存储身份的成功标记',WarehousePhotoR2.complete(cached,'full')&&WarehousePhotoR2.complete(cached,'thumbnail'));
 await WarehousePhotoStore.cache.remove(record.id);const image=await WarehousePhotoGit.imageURL(record,'full');check('无本机缓存时私有读取可显示照片',image.startsWith('blob:'));
 const read=await WarehousePhotoStore.cache.get(record.id);check('下载缓存不会误作为新照片上传',!read.originLocal&&!await WarehousePhotoGit.pending([record]));
 denied=true;try{await WarehousePhotoR2.read(record,'thumbnail');throw Error('auth must fail')}catch(e){check('管理连接失效时读取拒绝',e.message.includes('管理密钥'));}denied=false;
 select.value='github';select.onchange();check('切回GitHub不改旧R2记录',WarehousePhotoR2.config().provider==='github'&&record.storage.provider==='r2');
 check('签名服务操作限于预期接口',calls.every(a=>['adminR2Info','adminR2Upload','adminR2Verify','adminR2Read'].includes(a)));
 window.fetch=realFetch;
}catch(error){results.push({error:error.message,stack:error.stack})}
const out=document.createElement('pre');out.id='r2-qa-result';out.textContent=JSON.stringify(results);document.body.append(out);
})();</script>`;
const html=fs.readFileSync('index.html','utf8').replace('</body>',qa+'</body>');fs.writeFileSync('.qa-r2.html',html);
