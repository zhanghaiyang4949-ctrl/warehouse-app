(function(root) {
 'use strict';
 const store=root.WarehousePhotoStore,git=root.WarehousePhotoGit;
 let inbound=[];
 let dialog=null;
 let observer;
 const busyImages=new WeakSet();
 function records(type,id) {return (db.photoAttachments||[]).filter(row=>!row.deleted&&row.targetType===type&&String(row.targetId)===String(id));}
 function escaped(value) {return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
 function panel(type,id,title='照片备注') {
  return '<section class="warehouse-photo-panel" data-photo-type="'+escaped(type)+'" data-photo-owner="'+encodeURIComponent(String(id))+'"><div class="warehouse-photo-heading"><span>'+escaped(title)+'</span><button class="gray" type="button" data-photo-open>拍照／选图</button></div><div class="warehouse-photo-thumbs"></div></section>';
 }
 function targetForItem(item) {
  if(!item._historyW107)return {type:'item',id:String(item.id)};
  const event=(db.outboundEvents||[]).find(row=>row.id===item._eventIdW107);
  if(event?.itemId!==undefined&&event.itemId!==null)return {type:'item',id:String(event.itemId)};
  return {type:'history',id:String(item._eventIdW107||item.id)};
 }
 const renderCard=root.renderFindCardV49;
 root.renderFindCardV49=function(item) {
  const html=renderCard(item),target=targetForItem(item);
  let content=panel(target.type,target.id);
  if(item.pallet&&records('pallet',item.pallet).length)content+=panel('pallet',item.pallet,'托盘照片');
  const end=html.lastIndexOf('</div>');
  return html.slice(0,end)+content+html.slice(end);
 };
 const renderPallet=root.renderPalletItemsV51;
 root.renderPalletItemsV51=function(...args) {
  const value=renderPallet.apply(this,args),host=document.getElementById('palletResult');
  const pallets=String(palletViewStateV51.pallet||'').split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
  for(const pallet of [...new Set(pallets)].reverse())host.insertAdjacentHTML('afterbegin',panel('pallet',pallet,'托盘 '+pallet+' 照片'));
  return value;
 };
 async function loadThumbnail(image) {
  if(busyImages.has(image)||!image.isConnected)return;busyImages.add(image);
  const record=(db.photoAttachments||[]).find(row=>row.id===image.dataset.photoId)||inbound.find(row=>row.id===image.dataset.photoId);
  if(!record)return;
  try {image.src=await git.imageURL(record);image.alt=record.note||'照片，点击放大';}
  catch(error){image.alt='照片暂不可用';image.title=error.message;}
 }
 const intersection='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){intersection.unobserve(entry.target);loadThumbnail(entry.target);}}):null;
 function thumbnailButton(record) {
  const button=document.createElement('button');button.type='button';button.className='warehouse-photo-thumb';button.dataset.photoView=record.id;
  const image=document.createElement('img');image.dataset.photoId=record.id;image.alt='加载照片';image.loading='lazy';
  const text=document.createElement('small');text.textContent=record.note||'点击放大';button.append(image,text);
  return button;
 }
 function refreshPanels() {
  for(const host of document.querySelectorAll('.warehouse-photo-panel')) {
   const type=host.dataset.photoType,id=decodeURIComponent(host.dataset.photoOwner),images=type==='draft'?inbound:records(type,id);
   const box=host.querySelector('.warehouse-photo-thumbs'),signature=JSON.stringify(images.map(x=>[x.id,x.note]));
   if(box.dataset.signature===signature)continue;
   box.dataset.signature=signature;box.replaceChildren();
   for(const record of images){const button=thumbnailButton(record);box.append(button);const image=button.querySelector('img');intersection?intersection.observe(image):loadThumbnail(image);}
   if(!images.length){const text=document.createElement('small');text.className='muted';text.textContent=type==='draft'?'照片压缩后随本次入库保存':'可补拍箱子或托盘照片';box.append(text);}
  }
  const count=document.querySelector('[data-photo-total]');
  if(count){const all=(db.photoAttachments||[]).filter(row=>!row.deleted),bytes=all.reduce((sum,row)=>sum+(row.bytes||0)+(row.thumbBytes||0),0);const text='已关联 '+all.length+' 张照片，图片合计约 '+(bytes/1e6).toFixed(1)+' MB（Git历史占用另计）';if(count.textContent!==text)count.textContent=text;}
 }
 async function showLarge(record) {
  const layer=document.createElement('div');layer.className='warehouse-photo-viewer';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','照片大图');
  const close=document.createElement('button');close.type='button';close.textContent='关闭';const image=document.createElement('img');image.alt=record.note||'照片大图';const status=document.createElement('p');status.textContent='正在加载大图…';
  layer.append(close,image,status);const previous=document.body.style.overflow;document.body.style.overflow='hidden';document.body.append(layer);
  close.onclick=()=>{layer.remove();document.body.style.overflow=previous;};
  try {image.src=await git.imageURL(record,'full');status.textContent=record.note||'双指缩放查看细节';}
  catch(error){status.textContent=error.message;}
 }
 async function markSaved(rows) {
  for(const record of rows){const cached=await store.cache.get(record.id);if(cached){cached.record=record;cached.draft=false;cached.stage='saved';await store.cache.put(cached);}}
 }
 async function open(type,id) {
  if(dialog)return;dialog={loading:true};
  let drafts;try{drafts=await store.drafts(type,id);}catch(error){dialog=null;throw error;}
  const current=type==='draft'?inbound:records(type,id);
  const selected=JSON.parse(JSON.stringify(current));
  for(const draft of drafts)if(!selected.some(x=>x.id===draft.id)&&!(db.photoAttachments||[]).some(x=>x.id===draft.id))selected.push(draft.record);
  const state={closed:false,processing:false,saving:false,selected};dialog=state;
  const layer=document.createElement('div');layer.className='warehouse-photo-editor';layer.innerHTML='<section role="dialog" aria-modal="true" aria-label="图片备注"><header><strong>图片备注</strong><button type="button" data-close>关闭</button></header><p>自动使用 MozJPEG 质量70压缩，列表显示缩略图。</p><div class="warehouse-photo-actions"><label class="photo-file-button">拍照<input type="file" accept="image/*" capture="environment" data-camera></label><label class="photo-file-button">选择图片<input type="file" accept="image/*" multiple data-files></label></div><div data-list></div><p data-message role="status"></p><footer><button type="button" class="primary" data-save>'+(type==='draft'?'用于本次入库':'保存图片备注')+'</button></footer></section>';
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';document.body.append(layer);
  const message=layer.querySelector('[data-message]'),saveButton=layer.querySelector('[data-save]');
  function close(){if(state.saving)return;state.closed=true;store.cancelCompression();layer.remove();dialog=null;document.body.style.overflow=previous;}
  layer.querySelector('[data-close]').onclick=close;
  function render(){
   const list=layer.querySelector('[data-list]');list.replaceChildren();
   for(const record of state.selected){
    const row=document.createElement('div');row.className='warehouse-photo-edit-row';const button=thumbnailButton(record);
    button.onclick=()=>showLarge(record);const image=button.querySelector('img');git.imageURL(record).then(url=>{image.src=url;}).catch(error=>{image.alt=error.message;});
    const note=document.createElement('input');note.type='text';note.maxLength=500;note.placeholder='图片说明，例如无单号蓝色纸箱';note.value=record.note||'';note.oninput=()=>{record.note=note.value;};
    row.append(button,note);list.append(row);
   }
  }
  async function choose(event){
   if(state.processing||state.saving)return;
   const files=[...event.target.files];event.target.value='';state.processing=true;saveButton.disabled=true;
   layer.querySelectorAll('input[type=file]').forEach(input=>input.disabled=true);
   try {
    for(const [index,file] of files.entries()){
     if(state.closed)break;
     message.textContent='正在压缩 '+(index+1)+' / '+files.length+'…';
     const record=await store.makeDraft(file,type,id);state.selected.push(record);render();
    }
    if(!state.closed)message.textContent='照片已暂存本机，合计 '+state.selected.length+' 张';
   }catch(error){if(!state.closed)message.textContent=error.message;}
   finally{state.processing=false;saveButton.disabled=false;layer.querySelectorAll('input[type=file]').forEach(input=>input.disabled=false);}
  }
  layer.querySelector('[data-camera]').onchange=choose;layer.querySelector('[data-files]').onchange=choose;
  saveButton.onclick=async()=>{
   if(state.processing||state.saving)return;
   state.saving=true;saveButton.disabled=true;
   try {
    for(const record of state.selected){const cached=await store.cache.get(record.id);if(cached?.draft){cached.record=record;await store.cache.put(cached);}}
    if(type==='draft'){inbound=state.selected;refreshPanels();state.saving=false;close();return;}
    let committed=false;
    await root.githubGuardRun20261023(async()=>{
     const previous=db.photoAttachments,updates=new Map(state.selected.map(row=>[row.id,row]));
     db.photoAttachments=(previous||[]).map(row=>updates.get(row.id)||row);
     db.photoAttachments=store.mergeRecords(db,state.selected);
     if(!await save()){db.photoAttachments=previous;throw Error('图片关联保存失败，本机照片已保留');}
     committed=true;
    });
    if(!committed){message.textContent='尚未保存，请处理同步提示后重试';return;}
    await markSaved(state.selected);refreshPanels();state.saving=false;close();toast('图片备注已保存在本机，联网同步后其他设备可见');
   }catch(error){message.textContent=error.message;}
   finally{state.saving=false;saveButton.disabled=false;}
  };
  render();
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-photo-open],[data-photo-view]');if(!button||button.closest('.warehouse-photo-editor'))return;
  event.preventDefault();event.stopPropagation();
  if(button.dataset.photoView){const record=(db.photoAttachments||[]).find(x=>x.id===button.dataset.photoView)||inbound.find(x=>x.id===button.dataset.photoView);if(record)showLarge(record);return;}
  const panel=button.closest('.warehouse-photo-panel');open(panel.dataset.photoType,decodeURIComponent(panel.dataset.photoOwner)).catch(error=>toast(error.message));
 },true);
 const guard=root.warehouseGitHubGuard20261023,originalConfirm=guard.confirm.bind(guard);
 guard.confirm=async function(plan,choices={}) {
  const merged=WarehouseOfflineSync.merge(plan.base.db,plan.local,plan.remote.db||{items:[]},choices);
  if(!merged.conflicts.length&&await git.pending(merged.db.photoAttachments)){
   const c=getGitHubConfigV44(),key='warehouseGitHubGuard20261023:'+JSON.stringify([c.owner,c.repo,c.branch,c.path]);
   if(key!==plan.key||await guard.hashLocal()!==plan.localHash)throw Error('预览后本机数据或仓库设置已变化，请重新预览');
   await git.upload(merged.db.photoAttachments);
  }
  return originalConfirm(plan,choices);
 };
 root.WarehousePhotos={
  open,
  prepareInbound:item=>{
   if(inbound.some(row=>store.scope(row.github)!==store.scope(getGitHubConfigV44())))throw Error('照片属于另一GitHub仓库，请切回原设置后入库');
   return inbound.map(row=>({...row,targetType:'item',targetId:String(item.id),name:'货物 '+item.express+' 照片'}));
  },
  inboundSaved:rows=>{const temporary=document.querySelector('.photo-temporary-tracking input');if(temporary)temporary.checked=false;const ids=new Set(rows.map(row=>row.id));inbound=inbound.filter(row=>!ids.has(row.id));markSaved(rows).catch(()=>{});refreshPanels();},
  hasPending:plan=>git.pending(plan.local.photoAttachments),
  refresh:refreshPanels
 };
 async function install(){
  if(navigator.onLine!==false)store.prepareCodec().catch(()=>{});
  const note=document.getElementById('inNoteV86');note.insertAdjacentHTML('afterend',panel('draft','inbound','箱子照片备注'));
  const label=document.createElement('label');label.className='photo-temporary-tracking';label.innerHTML='<input type="checkbox"> 无单号箱子（生成临时编号）';document.querySelector('.inboundStickyExpressV61').after(label);
  let generated='';label.querySelector('input').onchange=event=>{
   const input=document.getElementById('inExpress');
   if(event.target.checked){if(!input.value.trim()){generated='TEMP-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase();input.value=generated;}}
   else if(input.value===generated)input.value='';
   input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const status=document.createElement('div');status.className='warehouse-photo-summary';status.innerHTML='<span data-photo-total></span><span data-photo-sync-status>照片与货物一起在确认同步时上传</span><button type="button" class="gray">检查并续传</button>';status.querySelector('button').onclick=()=>root.WarehouseUploadRecovery?.hasPending()?root.WarehouseUploadRecovery.retry().catch(error=>toast(error.message)):backupToGitHubV44();document.querySelector('.github-version-box20261023')?.append(status);
  const drafts=await store.drafts('draft','inbound');inbound=drafts.map(row=>row.record).filter(row=>!(db.photoAttachments||[]).some(x=>x.id===row.id));
  observer=new MutationObserver(refreshPanels);observer.observe(document.querySelector('.wrap'),{childList:true,subtree:true});refreshPanels();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install().catch(error=>toast(error.message)));else install().catch(error=>toast(error.message));
})(window);
