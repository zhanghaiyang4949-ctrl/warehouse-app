(function(root){'use strict';
function uniqueOrders(rows,same){const orders=[];for(const value of rows){if(!orders.some(x=>same(x,value)))orders.push(value)}return {orders,removed:rows.length-orders.length}}
function selectStates(states,mode){return states.map(x=>({...x,packed:mode==='all'?true:mode==='none'?false:!x.packed}))}
function needsSync(remote,base){return !!(remote&&base&&remote.sha!==base.sha)}
function advisory(o){let accepted='';return async function(run){
 if(o.online()){
  let timer;try{await Promise.race([Promise.resolve().then(o.inspect).catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,o.timeoutMs??2000)})])}finally{clearTimeout(timer)}
 }
 const state=o.state(),revision=(state.scope||'')+':'+state.remote?.sha+':'+state.base?.sha;
 if(needsSync(state.remote,state.base)&&accepted!==revision){
  if(!o.confirm('服务器已有新备份，当前数据尚未同步最新版本。\n建议先点击“联网同步并预览”。\n\n确定：本次先离线暂存，稍后联网合并；取消：先同步再修改。'))return;
  accepted=revision;
 }
 return run();
}}
if(typeof module!=='undefined'&&module.exports){module.exports={uniqueOrders,selectStates,needsSync,advisory};return}

// Task creation: use the same comparison as the existing packing matcher, retain first occurrence.
const originalCreate=root.createPackingTaskV83;
root.createPackingTaskV83=async function(...args){
 const input=document.getElementById('packOrdersV83'),originalText=input.value,rows=packOrderLinesV83(),result=uniqueOrders(rows,sameExpressForPackingV86),previous=currentPackingTaskV83;
 if(result.removed){input.value=result.orders.join('\n');updatePackOrderCountV83()}
 try{
  const value=await originalCreate.apply(this,args);
  if(result.removed&&currentPackingTaskV83&&currentPackingTaskV83!==previous)toast('配单任务已创建：'+result.orders.length+' 个单号，已去掉 '+result.removed+' 条重复项');
  else if(result.removed&&input.value===result.orders.join('\n')){input.value=originalText;updatePackOrderCountV83()}
  return value;
 }catch(error){if(input.value===result.orders.join('\n')){input.value=originalText;updatePackOrderCountV83()}throw error}
};
function enhanceSelection(){
 const list=document.getElementById('packMatchListV83');if(!list)return;
 if(!currentPackingTaskV83){const bar=document.getElementById('packSelectionToolbar');if(bar)bar.hidden=true;return}
 for(const [index,row] of [...list.children].entries()){
  const checkbox=row.querySelector('input[type="checkbox"]');if(!checkbox)continue;
  row.classList.add('pack-tap-row');row.dataset.packIndex=index;row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-pressed',String(checkbox.checked));
  checkbox.closest('label').classList.add('pack-old-selection');
  row.querySelectorAll('.pack-selection-badge').forEach(x=>x.remove());
  const badge=document.createElement('span');badge.className='pack-selection-badge';badge.textContent=checkbox.checked?'已选':'点选';badge.setAttribute('aria-hidden','true');row.append(badge);
 }
 let toolbar=document.getElementById('packSelectionToolbar');
 if(!toolbar){toolbar=document.createElement('div');toolbar.id='packSelectionToolbar';toolbar.className='pack-selection-toolbar';toolbar.innerHTML='<span data-pack-count></span><button type="button" class="gray" data-pack-selection="all">全选</button><button type="button" class="gray" data-pack-selection="invert">反选</button>';document.getElementById('packMatchSummaryV83').after(toolbar)}
 toolbar.hidden=!currentPackingTaskV83;
 const states=ensurePackingLineStatesV86();toolbar.querySelector('[data-pack-count]').textContent='已选 '+states.filter(x=>x.packed).length+' / '+states.length;
}
const originalRender=root.renderCurrentPackingV83;
root.renderCurrentPackingV83=function(...args){const value=originalRender.apply(this,args);enhanceSelection();return value};
function toggleRow(event){
 const row=event.target.closest('.pack-tap-row');if(!row||event.target.closest('input,textarea,select,button,a,label'))return;
 if(event.type==='keydown'){if(event.target!==row||!['Enter',' '].includes(event.key))return;event.preventDefault()}
 const index=Number(row.dataset.packIndex),state=ensurePackingLineStatesV86()[index];if(state)setPackingLinePackedV86(index,!state.packed);
}
document.addEventListener('click',toggleRow);document.addEventListener('keydown',toggleRow);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-pack-selection]');if(!button||!currentPackingTaskV83)return;
 const updated=selectStates(ensurePackingLineStatesV86(),button.dataset.packSelection);currentPackingTaskV83.lineStates=updated;savePackingDraftV86();renderCurrentPackingV83();updatePackFeedbackV83();refresh();
});

// Present the remote file's export timestamp, never the device's last upload timestamp.
const guard=root.warehouseGitHubGuard20261023;
let state={scope:'',remote:null,base:null,checkedAt:0,failed:false},pending=null,pendingScope='',lastAttempt=0;
function scope(){const c=getGitHubConfigV44();return JSON.stringify([c.owner,c.repo,c.branch,c.path])}
function scoped(){const key=scope();if(state.scope!==key){state={scope:key,remote:null,base:null,checkedAt:0,failed:false};lastAttempt=0}return state}
function paint(){
 const el=document.getElementById('storageStatusV44');if(!el)return;const s=scoped();
 for(const child of [...el.querySelectorAll('span')])if(/最后本地保存|本机最近上传备份/.test(child.textContent)||child.dataset.remoteStatus)child.remove();
 const time=document.createElement('span');time.dataset.remoteStatus='time';
 const stamp=s.remote?.exportedAt,parsed=stamp?new Date(stamp):null;
 time.textContent='服务器最后备份：'+(s.remote?(s.remote.sha?(parsed&&!Number.isNaN(parsed.getTime())?parsed.toLocaleString():'旧备份未记录时间'):'尚无备份'):'尚未联网核对');
 const notice=document.createElement('span');notice.dataset.remoteStatus='state';
 const stale=needsSync(s.remote,s.base);notice.className=stale?'server-version-stale':'';
 notice.textContent=stale?'当前数据需要同步最新版本':s.failed?'当前无法核对服务器；本机改动仍暂存':!s.base?'本机尚未建立同步底稿':s.remote?'已同步服务器备份版本':'等待核对服务器版本';
 el.append(time,notice);el.classList.toggle('server-version-stale',stale);
}
function capture(value,key){if(key!==scope())return;const s=scoped();
 if(value.base){if(s.base&&s.base.sha!==value.base.sha&&!value.remote){s.remote=null;s.checkedAt=0}s.base=value.base}
 if(value.remote){s.remote={sha:value.remote.sha,exportedAt:value.remote.exportedAt||''};s.checkedAt=Date.now();s.failed=false}
 paint();
}
window.addEventListener('warehouse-remote-backup',event=>{
 const detail=event.detail;if(detail.key!=='warehouseGitHubGuard20261023:'+scope())return;
 const s=scoped();s.remote={sha:detail.sha,exportedAt:detail.exportedAt};s.checkedAt=Date.now();s.failed=false;paint();
});
const originalUpdate=root.updateStorageStatusV44;
root.updateStorageStatusV44=function(...args){const value=originalUpdate.apply(this,args);paint();return value};
if(guard){
 const inspect=guard.inspect.bind(guard),changes=guard.changes.bind(guard),run=guard.run.bind(guard),confirm=guard.confirm.bind(guard),restore=guard.restore.bind(guard);
 guard.inspect=async function(){const key=scope();try{const value=await inspect();capture(value,key);return value}catch(e){if(key===scope()){scoped().failed=true;paint()}throw e}};
 guard.changes=async function(){const key=scope(),value=await changes();capture(value,key);return value};
 async function checkLatest(force=false){
  const key=scope();scoped();
  if(pending&&pendingScope===key)return pending;
  if(!force&&Date.now()-lastAttempt<10000)return;
  lastAttempt=Date.now();pendingScope=key;const work=guard.inspect();pending=work;
  try{return await work}finally{if(pending===work){pending=null;pendingScope=''}}
 }
 const advise=advisory({inspect:()=>checkLatest(),state:scoped,online:()=>navigator.onLine!==false,confirm:message=>root.confirm(message)});
 guard.run=fn=>advise(async()=>{try{return await run(fn)}finally{try{await guard.changes()}catch(e){}}});
 for(const [name,original] of [['confirm',confirm],['restore',restore]])guard[name]=async function(...args){const value=await original(...args);await guard.changes();checkLatest(true).catch(()=>{});return value};
 const onVisible=()=>{if(!document.hidden&&storageReady)checkLatest(true).catch(()=>{})};
 window.addEventListener('online',onVisible);document.addEventListener('visibilitychange',onVisible);
 setInterval(()=>{const page=document.getElementById('data');if(!document.hidden&&storageReady&&page?.classList.contains('active'))checkLatest().catch(()=>{})},60000);
}
function install(){document.getElementById('日期统一规则V59')?.remove();enhanceSelection();paint()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(typeof window!=='undefined'?window:globalThis);
