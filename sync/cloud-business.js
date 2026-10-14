'use strict';
function cloudIdArg(id){return JSON.stringify(String(id)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function cloudItemTime(item){return Date.parse(item.inTimeIso||item.inTime||item.createdAt||'')||0}
(function(){
 const el=id=>document.getElementById(id),sessionKey='warehouseWebSessionV1',pendingKey='warehouseWebPendingV1',cacheKey='warehouseWebReadCacheV1';
 let session=null,online=false,busy=false,timer=null,delay=5000,editingVersion=null,selectedVersions=new Map(),taskDirty=false,authoritative='',backgroundPaint=false,taskItemVersions={};
 const bar=document.createElement('section');bar.className='cloudBar';bar.innerHTML='<div><b id="cloudAccount">云端仓库 · 同步开发版</b><span id="cloudStatus" role="status">正在核对账号与库存…</span></div><div class="cloudActions"><button id="cloudRefresh" class="gray">刷新</button><button id="cloudRetry" class="primary" hidden>确认上次操作</button><a href="连接测试.html">连接与退出登录</a></div>';
 document.querySelector('.storageSafetyCardV44').prepend(bar);const miniStatus=document.createElement('small');miniStatus.id='cloudMiniStatus';miniStatus.setAttribute('role','status');document.querySelector('.nav').append(miniStatus);
 const setStatus=(s,error=false)=>{el('cloudStatus').textContent=s;miniStatus.textContent=s;bar.dataset.error=String(error);el('cloudRetry').hidden=!client.pending};
 const client=new CloudWarehouse({request:request,publish:publish});
 let migrationControl=null,importControl=null;
 window.warehouseCloud=client;
 try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');const saved=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(saved&&saved.sessionId===session?.sessionId)client.pending=saved.request}catch{}
 async function request(action,args={}){
  if(!session||session.expiresAt<=Date.now())throw Object.assign(Error('请先在连接页获取登录码并由小程序授权'),{code:'ACCESS_DENIED'});
  let r,result;
  try{r=await fetch(session.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.secret,'X-Session-Id':session.sessionId},body:JSON.stringify({action,args}),cache:'no-store',signal:AbortSignal.timeout(20000)});result=await r.json()}
  catch(e){throw Object.assign(Error('网络未确认，保留当前内容；请恢复连接后重试'),{uncertain:true})}
  if(!result.ok){const error=Object.assign(Error(result.message||'请求未完成'),{code:result.code,uncertain:r.status>=500});if(error.code==='ACCESS_DENIED'){online=false;sessionStorage.removeItem(sessionKey);sessionStorage.removeItem(cacheKey);session=null;client.snapshot=null;client.revision=null;db={items:[],packingHistory:[],outboundEvents:[],warehouseMaps:[]};currentPackingTaskV83=null;refresh();renderCurrentPackingV83();renderTaskList()}throw error}
  return result.data;
 }
 function allowed(p){return !!client.snapshot&&client.can(client.snapshot.user,p)}
 function publish(snapshot){
  db={items:snapshot.items.map(x=>({...x,last4:String(x.express||'').slice(-4),inTimeIso:x.inTime||''})),warehouseMaps:[],outboundEvents:snapshot.events.filter(x=>x.kind!=='unpicked'),packingHistory:snapshot.tasks.filter(x=>x.status==='completed').map(toWebTask)};
  authoritative=JSON.stringify(db);
  try{sessionStorage.setItem(cacheKey,JSON.stringify({sessionId:session?.sessionId,snapshot}))}catch{}
  online=true;storageReady=false;storageReadError=false;
  el('cloudAccount').textContent=(snapshot.user.name||'员工')+' · 云端仓库';
  backgroundPaint=true;try{refresh();renderPackingHistoryV83();renderTaskList()}finally{backgroundPaint=false}
  if(el('viewPallet').value)viewPallet();
  setStatus('已同步 '+new Date(snapshot.readAt).toLocaleTimeString()+' · '+db.items.length+' 条记录'+(taskDirty?' · 配单有未保存内容':''));
  savePending();
  if(migrationControl)void migrationControl.update(snapshot.user);if(importControl)void importControl.update(snapshot.user);
 }
 function toWebTask(task){return {...task,lineStates:structuredClone(task.lines||[])} }
 function failure(e){online=false;setStatus(e.message+'；当前显示上次读取的数据，暂停提交',true);toast(e.message);if(client.maintenance&&migrationControl)void request('me').then(r=>migrationControl.update(r.user)).catch(()=>{})}
 function savePending(){try{if(client.pending)sessionStorage.setItem(pendingKey,JSON.stringify({sessionId:session?.sessionId,request:client.pending}));else sessionStorage.removeItem(pendingKey)}catch{toast('浏览器无法保存重试凭据，请保持当前页面打开')}el('cloudRetry').hidden=!client.pending;for(const field of document.querySelectorAll('#packCurrentCardV83 input,#packCurrentCardV83 select,#packWeightRowsV83 input,#packNoteV83'))field.disabled=!!client.pending}
 async function mutate(action,args,onSuccess=()=>{}){
  if(busy){toast('正在处理，请稍候');return false}
  if(!online||!client.snapshot){toast('请先刷新并确认云端连接');return false}
  busy=true;setStatus('正在提交…');bar.dataset.busy='true';try{
   const response=client.write(action,args);savePending();const result=await response;savePending();onSuccess(result);
   if(!result.changes){try{await client.refresh()}catch(e){failure(e);setStatus('操作已成功提交；刷新失败，请恢复连接后刷新核对',true)}}else void client.check().catch(failure);
   toast('云端已确认');return true;
  }catch(e){savePending();setStatus(e.message,true);toast(e.message);if(e.uncertain)online=false;return false}finally{busy=false;bar.dataset.busy='false'}
 }
 function versions(ids){const result={};for(const id of ids){const item=db.items.find(x=>x.id===id);if(!item)throw Error('记录已不存在，请刷新');result[id]=selectedVersions.has(id)?selectedVersions.get(id):item.version||0}return result}
 function change(action,ids,changes,onSuccess){ids=(ids||[]).map(String);try{return mutate(action,{ids,versions:versions(ids),...(changes?{changes}:{})},onSuccess)}catch(e){toast(e.message);return Promise.resolve(false)}}
 // No original whole-database saver or restore path may write in cloud mode.
 function rejectLocalWrite(){if(authoritative)db=JSON.parse(authoritative);refresh();toast('此入口尚未接入云端，未保存任何变更');return false}
 safePersistV44=async()=>rejectLocalWrite();
 initializeSafeStorageV44=async()=>{};loadPackingDraftV86=()=>{};
 save=()=>{if(authoritative&&JSON.stringify(db)!==authoritative)return Promise.resolve(rejectLocalWrite());for(const [key,id]of [['inCustomerV1','inCustomer'],['inPalletV1','palletInput'],['inDateV1','inDate']])localStorage.setItem(key,el(id).value);localStorage.setItem('customerUsageV1',JSON.stringify(customerUsage));refresh();return Promise.resolve(true)};
 for(const name of ['restoreSnapshotV44','prepareSnapshotRestoreV44','restoreFromGitHubV44','prepareGitHubRestoreV44','establishNewBackupBaselineV85','executeHistoryCleanup','openHistoryCleanupConfirm','undoPackedHistoryV88','deletePackingHistoryV89','saveWarehouseEditorV66','deleteWarehouseV66','saveWarehouseCellV66','clearWarehouseCellV66','commitWarehouseCellV66'])window[name]=()=>toast('此操作尚未接入云端，未更改数据；原基础版仍可独立使用');
 updateStorageStatusV44=()=>{};recheckStorageV45=()=>manualRefresh();showLocalSnapshotsV44=()=>toast('同步开发版不使用原网页的本地库存或快照');
 const exportCsv=exportCsvData,exportQuery=exportQueryDataV72;
 const locationsUI=WarehouseLocations.mount({request,items:()=>db.items,revision:()=>client.revision});exportCsvData=async()=>{if(!allowed('exportData')||!online)return toast('请先连接并确认导出权限');try{await client.check();await locationsUI.exportCsv()}catch(e){toast(e.message)}};
 backupToGitHubV44=()=>toast('请使用云端 JSON 导出；同步开发版不改写原网页 GitHub 备份');
 exportQueryDataV72=()=>allowed('exportData')?exportQuery():toast('没有导出权限');
 syncQueryDataNowV73=async()=>{toast('查询面板自动发布尚未接入云端');return false};scheduleQuerySyncV73=()=>{};
 addExpress=async()=>{
  const express=el('inExpress').value.trim(),pallet=formatPalletInput(el('palletInput').value,el('palletAssist').checked),date=normalizeWarehouseDateV59(el('inDate').value),customer=el('inCustomer').value.trim();
  if(!express||!pallet||!date)return failInbound('请填写单号、托盘和有效日期');
  el('palletInput').value=pallet;
  return mutate('inbound',{express,pallet,date,customer,inboundNote:el('inNoteV86').value.trim()},()=>{el('inExpress').value='';if(customer)customerUsage[customer]=(customerUsage[customer]||0)+1;showInboundSuccessFeedback();refocusInboundExpress()});
 };
 const localEdit=editItem;editItem=id=>{const item=db.items.find(x=>x.id===String(id));editingVersion=item?{id:item.id,version:item.version||0}:null;localEdit(id)};
 saveEditModal=async()=>{
  if(!editingVersion)return toast('请重新打开记录');
  const item=db.items.find(x=>x.id===editingVersion.id);if(!item)return toast('记录已不存在');
  const values={express:el('editExpressW95').value.trim(),customer:el('editCustomer').value.trim(),date:normalizeWarehouseDateV59(el('editDate').value),pallet:el('editPallet').value.trim(),inboundNote:el('editInboundNoteV86').value.trim()};
  const changes=Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==(item[k]||'')));if(!Object.keys(changes).length)return closeEditModal();
  await mutate('update',{ids:[editingVersion.id],versions:{[editingVersion.id]:editingVersion.version},changes},closeEditModal);
 };
 executeTakenItemsV64=ids=>change('ship',ids,null,()=>{ids.forEach(id=>{selectedFindIdsV64.delete(String(id));selectedVersions.delete(String(id))})});
 executeBulkPalletMoveV65=(ids,target)=>change('update',ids,{pallet:target});
 executeBulkDateChangeV65=(ids,target)=>change('update',ids,{date:target});
 const originalDelete=softDeleteItem;let deleteVersion=null;
 softDeleteItem=id=>{const item=db.items.find(x=>x.id===String(id));deleteVersion=item?{id:item.id,version:item.version||0}:null;originalDelete(id)};
 confirmDeleteModal=()=>deleteVersion?mutate('remove',{ids:[deleteVersion.id],versions:{[deleteVersion.id]:deleteVersion.version}},closeDeleteModal):toast('请重新打开删除确认');
 confirmBatchDeleteModal=()=>change('remove',pendingBatchDeleteIds,null,()=>{selectedDataIds.clear();closeBatchDeleteModal()});
 function confirmItemAction(action,id,title,message){id=String(id);const item=db.items.find(x=>x.id===id);if(!item)return toast('记录已不存在');const version=item.version||0;openSafetyConfirmV44(title,message,()=>mutate(action,{ids:[id],versions:{[id]:version}}))}
 restoreDeletedItemV54=id=>confirmItemAction('restore',id,'确认还原','是否将此记录还原到在库？');
 undoRecentInboundV63=id=>confirmItemAction('remove',id,'撤销本次入库','云端将保留记录并标记为已删除，确认继续？');
 prepareSingleTakenV64=id=>confirmItemAction('ship',id,'确认已取走','确认这件货物已经取走？');
 executeSelectedTransfer=()=>{const p=window._pendingTransfer;if(!p)return;return change('update',p.ids,{pallet:p.to},()=>{selectedPalletIds.clear();closeTransferConfirmModal();closeTransferModal()})};
 for(const name of ['toggleFindSelectionV64','selectAllFindVisibleV68','togglePalletSelection','selectAllPalletItems','invertPalletSelectionV68','toggleDataSelection','toggleSelectAllData']){
  const original=window[name];window[name]=function(...args){const result=original(...args);const selected=new Set([...selectedFindIdsV64,...selectedPalletIds,...selectedDataIds]);for(const x of db.items)if(selected.has(x.id)&&!selectedVersions.has(x.id))selectedVersions.set(x.id,x.version||0);for(const id of selectedVersions.keys())if(!selected.has(id))selectedVersions.delete(id);return result};
 }
 // Drafts have an explicit cloud save; background refresh never overwrites an open draft.
 savePackingDraftV86=()=>{taskDirty=true};
 setPackingLineNoteV86=(index,value)=>{const states=ensurePackingLineStatesV86();if(states[index]){states[index].note=String(value||'');taskDirty=true}};
 const renderTask=renderCurrentPackingV83;
 renderCurrentPackingV83=()=>{if(backgroundPaint&&el('packCurrentCardV83').contains(document.activeElement))return;renderTask()};
 function captureTaskVersions(){taskItemVersions=Object.fromEntries(db.items.map(x=>[x.id,x.version||0]))}
 createPackingTaskV83=async()=>{
  if(currentPackingTaskV83&&taskDirty)return toast('请先保存当前任务草稿');
  await mutate('packingCreate',{mark:sanitizePackMarkV84(el('packMarkV83').value),customerService:selectedPackCsV83,orders:packOrderLinesV83()},r=>{currentPackingTaskV83=toWebTask(r.task);captureTaskVersions();taskDirty=false;el('packMarkV83').value='';el('packOrdersV83').value='';el('packCsNewV83').value='';selectedPackCsV83='';renderPackCsV83();updatePackOrderCountV83();renderCurrentPackingV83();initPackWeightsV83()});
 };
 function taskArgs(){
  const task=currentPackingTaskV83;if(!task)throw Error('请先选择任务');
  const lines=ensurePackingLineStatesV86().map((x,i)=>{const candidates=matchPackingOrderV83(task.orders[i]);return {packed:!!x.packed,note:x.note||'',itemId:x.itemId|| (candidates.length===1?candidates[0].id:'')}});
  const itemVersions={};for(const line of lines)if(line.packed&&line.itemId)itemVersions[line.itemId]=taskItemVersions[line.itemId]??-1;
  const segments=[];for(const row of document.querySelectorAll('#packWeightRowsV83 .row')){const [b,w]=row.querySelectorAll('input');if(!b.value.trim()&&!w.value.trim())continue;segments.push({boxes:Number(b.value),weight:Number(w.value)})}
  return {id:task.id,version:task.version,lines,itemVersions,segments,note:el('packNoteV83').value.trim()};
 }
 async function saveTask(){try{await mutate('packingSave',taskArgs(),r=>{currentPackingTaskV83=toWebTask(r.task);taskDirty=false;renderCurrentPackingV83()})}catch(e){toast(e.message)}}
 finishPackingTaskV83=async()=>{
  try{const args=taskArgs(),task=currentPackingTaskV83,checked=args.lines.filter(x=>x.packed);if(!checked.length)return toast('至少勾选一条已配');
   const boxes=args.segments.reduce((s,x)=>s+x.boxes,0);if(boxes!==checked.length){if(!confirm('称重箱数与已配数量不一致，仍要提交吗？'))return;args.confirmWeightMismatch=true}
   if(args.lines.some((x,i)=>x.packed&&getOutboundForOrderW107(task.orders[i]).length)){const reason=prompt('存在历史出库记录，请填写补发或更正原因');if(!reason?.trim())return;args.correctionReason=reason.trim()}
   if(!confirm('确认提交已配货物出库？未配单号和备注将保留。'))return;
   await mutate('packingFinish',args,()=>{currentPackingTaskV83=null;taskDirty=false;el('packNoteV83').value='';renderCurrentPackingV83()});
  }catch(e){toast(e.message)}
 };
 const drafts=document.createElement('div');drafts.className='card';drafts.innerHTML='<div class="title">云端配单草稿</div><div id="cloudTasks"></div>';el('packing').prepend(drafts);
 const saveButton=document.createElement('button');saveButton.className='primary';saveButton.textContent='保存草稿到云端';saveButton.onclick=saveTask;el('packCurrentCardV83').append(saveButton);
 el('packWeightRowsV83').addEventListener('input',()=>{taskDirty=true});el('packNoteV83').addEventListener('input',()=>{taskDirty=true});
 function renderTaskList(){el('cloudTasks').replaceChildren();for(const t of client.snapshot?.tasks||[])if(t.status==='draft'){const button=document.createElement('button');button.className='gray';button.textContent=t.mark+' · '+t.customerService+' · '+t.orders.length+' 单';button.onclick=()=>{if(taskDirty&&!confirm('当前草稿有未保存内容，确认放弃并重新打开吗？'))return;currentPackingTaskV83=toWebTask(t);captureTaskVersions();taskDirty=false;renderCurrentPackingV83();el('packNoteV83').value=t.note||'';el('packWeightRowsV83').replaceChildren();for(const segment of t.segments||[]){addPackWeightRowV83();const inputs=el('packWeightRowsV83').lastElementChild.querySelectorAll('input');inputs[0].value=segment.boxes;inputs[1].value=segment.weight}if(!t.segments?.length)initPackWeightsV83();updatePackFeedbackV83()};el('cloudTasks').append(button)}if(!el('cloudTasks').children.length)el('cloudTasks').textContent='暂无草稿'}
 async function manualRefresh(){if(busy||client.writing)return;try{await client.refresh();delay=5000}catch(e){failure(e)}}
 async function poll(){clearTimeout(timer);if(document.hidden)return;try{if(!busy&&!client.pending){const wasOnline=online;await client.check();online=!!client.snapshot;if(!wasOnline&&online)setStatus('连接已恢复 · 云端记录已核对');delay=5000}}catch(e){failure(e);delay=client.maintenance?5000:Math.min(delay*2,60000)}finally{if(session&&!document.hidden)timer=setTimeout(poll,delay)}}
 el('cloudRefresh').onclick=manualRefresh;
 el('cloudRetry').onclick=async()=>{if(busy)return;busy=true;try{const pending=client.pending,result=await client.retry();savePending();const recovered=recoverDraft(pending,result,currentPackingTaskV83,taskDirty);taskDirty=recovered.dirty;currentPackingTaskV83=recovered.draft;if(result.changes)void client.check().catch(failure);else await client.refresh();renderCurrentPackingV83();toast('原请求已确认，请核对记录后再操作')}catch(e){savePending();failure(e)}finally{busy=false}};
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)poll()});
 window.addEventListener('beforeunload',e=>{if(taskDirty||client.pending){e.preventDefault();e.returnValue=''}});
 // Original backup/import entry remains visible and now performs preview only.
 importCsvData=async input=>{const file=input.files?.[0];input.value='';if(!file)return;if(client.snapshot?.user.role!=='owner')return toast('只有最高管理员可以替换云端数据');importControl.show();const transfer=new DataTransfer();transfer.items.add(file);el('importFileV2').files=transfer.files;el('importFileV2').dispatchEvent(new Event('change'))};
 const safety=document.querySelector('.storageSafetyCardV44');if(safety){const oldNote=safety.querySelector('.muted');if(oldNote)oldNote.textContent='云端保存货物记录。导入前核对差异，提交后其他设备自动获取更新。';for(const button of safety.querySelectorAll('button[onclick]'))button.hidden=true;const note=document.createElement('p');note.textContent='同步开发版以云端为准，不读取原网页本地库存；断网时仅查看本次会话已读取的缓存。';safety.prepend(note)}
 const oldGitHub=document.querySelector('.githubBackupCardV44');if(oldGitHub)oldGitHub.hidden=true;
 el('storageStatusV44').textContent='云端同步模式：本地库存保存功能未启用';
 const migration=document.createElement('div');migration.className='card';migration.innerHTML='<div class="title">旧数据迁移预览与云端导出</div><p class="muted">先从原网页导出备份。这里仅预览，不导入、不覆盖已有云端记录。</p><label>选择原网页 JSON 备份<input id="cloudMigrationFile" type="file" accept=".json,application/json"></label><button id="cloudExport" class="gray">导出当前云端 JSON</button><pre id="cloudMigrationResult" style="white-space:pre-wrap"></pre>';
 el('backupTools').append(migration);
 el('cloudMigrationFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!allowed('importData'))return toast('没有导入权限');try{if(file.size>20*1024*1024)throw Error('请先拆分超过20MB的备份');const r=migrationPreview(JSON.parse(await file.text()),db.items);el('cloudMigrationResult').textContent=JSON.stringify(r,null,2)+'\n仅预览：缺失历史时间不会自动补造；实际导入尚未开放。'}catch(error){toast(error.message)}};
 el('cloudExport').onclick=()=>{if(!allowed('exportData')||!online)return toast('请先连接并确认导出权限');const content={version:1,source:'native_v1',exportedAt:new Date().toISOString(),data:{items:client.snapshot.items,events:client.snapshot.events,tasks:client.snapshot.tasks}},url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='warehouse-cloud-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 importControl=WarehouseImportV2.mount({client,request,parent:el('backupTools'),storageKey:'warehouseImportV2:'+(session?.endpoint||''),canStart:()=>online&&!busy&&!client.pending&&!taskDirty,onComplete:()=>manualRefresh()});
 migrationControl=WarehouseMigration.mountMigration({client,request,sessionId:session?.sessionId||'no-session',canStart:()=>online&&!busy&&!client.pending&&!taskDirty,onMaintenance:()=>{online=false;setStatus('仓库维护中 · 请在备份工具中完成 CSV 导入，其他设备暂停提交',true)},onComplete:async s=>{if(s.phase==='complete'){currentPackingTaskV83=null;taskDirty=false;selectedVersions.clear();selectedFindIdsV64.clear();selectedPalletIds.clear();selectedDataIds.clear();renderCurrentPackingV83()}await manualRefresh()}});
 if(!session){setStatus('请先完成小程序授权登录',true);refresh()}else{try{const cache=JSON.parse(sessionStorage.getItem(cacheKey)||'null');if(cache?.sessionId===session.sessionId&&session.expiresAt>Date.now()){client.snapshot=cache.snapshot;publish(cache.snapshot);online=false;setStatus('正在核对连接，暂时显示本次会话的只读缓存',true)}}catch{}manualRefresh().then(()=>{if(session)timer=setTimeout(poll,5000)})}
})();
