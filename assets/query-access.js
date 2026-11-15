(function(root){
 'use strict';
 const configKey='warehouseQueryAccessV1',secretKey='warehouseQueryAdminSessionV1';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let settings;try{settings=JSON.parse(localStorage.getItem(configKey)||'{}');}catch{settings={};}
 if(!settings.endpoint)settings.endpoint='https://papaya-warehouse-d8e9ta3f6735f7d-1302971280.ap-shanghai.app.tcloudbase.com/warehouse-query';
 let key=sessionStorage.getItem(secretKey)||'',busy=false,listCursor='',deviceRows=[],pendingTotal=0,timer;
 const statusNames={pending:'待审核',approved:'已授权',rejected:'已拒绝',revoked:'已撤销'};
 const section=document.createElement('section');section.className='query-access';section.innerHTML='<h4>查询人员与设备授权</h4><p class="muted">人员在查询端提交申请后，在这里审核。授权绑定本设备；更换设备需重新申请。</p><label>腾讯云查询服务地址<input data-endpoint type="url" placeholder="https://…/warehouse-query"></label><label>查询管理密钥<input data-secret type="password" autocomplete="off" placeholder="只保留在当前管理会话，不会上传到GitHub"></label><div class="query-access-actions"><button type="button" data-connect class="primary">连接并查看申请</button><button type="button" data-refresh class="gray">刷新申请</button><button type="button" data-disconnect class="gray">断开审核管理</button></div><div data-status class="query-access-status" role="status">尚未连接审核服务。原库存操作和备份功能可照常使用。</div><div data-list class="query-access-list"></div><button type="button" data-more class="gray" hidden>加载更多人员</button><details style="margin-top:12px"><summary>登录与审核记录</summary><div class="query-access-actions"><button data-logs type="button" class="gray">刷新记录</button></div><div data-log-list></div><button data-more-logs type="button" class="gray" hidden>更早记录</button></details>';
 document.getElementById('queryManageCardV72').append(section);
 // 旧设置指向公共快照仓库；安全版的来源由云函数固定配置，不再由这个输入框决定。
 const oldRepoField=document.getElementById('queryRepoV73');if(oldRepoField)oldRepoField.parentElement.hidden=true;
 const el=selector=>section.querySelector(selector),badge=document.createElement('button');badge.className='query-access-badge';badge.type='button';document.body.append(badge);
 el('[data-endpoint]').value=settings.endpoint||'';el('[data-secret]').value=key;
 function say(message){el('[data-status]').textContent=message;}
 function endpoint(){const url=new URL(settings.endpoint);if(url.protocol!=='https:')throw Error('查询服务地址必须使用HTTPS');return url.href;}
 async function call(action,args={}){
  if(!key)throw Error('请先输入查询管理密钥，连接审核服务');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json','X-Query-Admin':key},body:JSON.stringify({action,args}),signal:controller.signal,cache:'no-store'});
   const result=await response.json();if(!response.ok||!result.ok)throw Error(result.message||'查询审核服务暂不可用');return result.data;
  }finally{clearTimeout(timeout);}
 }
 function showBadge(){badge.textContent='查询端有 '+pendingTotal+' 项待审核';badge.style.display=pendingTotal?'block':'none';}
 function render(){
  el('[data-list]').innerHTML=deviceRows.slice().sort((a,b)=>(a.status==='pending'?-1:0)-(b.status==='pending'?-1:0)||String(b.requestedAt).localeCompare(String(a.requestedAt))).map(row=>'<article><div><b>'+esc(row.name)+'</b> · '+esc(statusNames[row.status]||row.status)+'<small>'+esc(row.label||'设备')+'</small><small>申请：'+esc(new Date(row.requestedAt).toLocaleString())+' · 设备 '+esc(row.id.slice(0,8))+'</small></div><div class="query-access-actions">'+(row.status!=='approved'?'<button type="button" class="primary" data-review="approved" data-id="'+esc(row.id)+'">通过</button>':'<button type="button" class="danger" data-review="revoked" data-id="'+esc(row.id)+'">撤销授权</button>')+(row.status==='pending'?'<button type="button" class="gray" data-review="rejected" data-id="'+esc(row.id)+'">拒绝</button>':'')+'</div></article>').join('')||'<p class="muted">暂无人员申请</p>';
  el('[data-more]').hidden=!listCursor;showBadge();
 }
 async function refresh(append=false){
  if(busy)return;busy=true;
  try{const page=await call('adminList',{cursor:append?listCursor:''});deviceRows=append?deviceRows.concat(page.devices):page.devices;pendingTotal=page.pendingTotal;listCursor=page.nextCursor;render();say('已连接；'+pendingTotal+' 项待审核'+(listCursor?'（还有更多人员）':''));}
  catch(error){say(error.message);}finally{busy=false;}
 }
 function schedule(){clearInterval(timer);if(key&&settings.endpoint)timer=setInterval(()=>{if(!document.hidden)refresh();},30000);}
 el('[data-connect]').onclick=async()=>{
  settings={endpoint:el('[data-endpoint]').value.trim()};key=el('[data-secret]').value.trim();
  try{endpoint();const info=await call('adminInfo');localStorage.setItem(configKey,JSON.stringify(settings));sessionStorage.setItem(secretKey,key);say('已连接私有查询数据仓库 '+info.repo);await refresh();schedule();}catch(error){say(error.message);}
 };
 el('[data-refresh]').onclick=()=>refresh();el('[data-more]').onclick=()=>refresh(true);
 el('[data-disconnect]').onclick=()=>{key='';sessionStorage.removeItem(secretKey);el('[data-secret]').value='';clearInterval(timer);badge.style.display='none';deviceRows=[];el('[data-list]').replaceChildren();say('审核管理已断开；查询自动同步需重新连接后继续。');};
 badge.onclick=()=>{showPage('data');setWorkspaceModeW106('data','query');const card=document.getElementById('queryManageCardV72');card.open=true;card.scrollIntoView({behavior:'smooth',block:'start'});};
 section.addEventListener('click',async event=>{
  const button=event.target.closest('[data-review]');if(!button||busy)return;
  const row=deviceRows.find(x=>x.id===button.dataset.id);if(!row)return;
  const description={approved:'通过该人员在此设备上的查询申请',rejected:'拒绝此申请',revoked:'撤销该设备授权，当前登录也将失效'}[button.dataset.review];
  if(!confirm(row.name+'：'+description+'？'))return;
  busy=true;button.disabled=true;
  try{await call('adminReview',{id:row.id,status:button.dataset.review});busy=false;await refresh();}catch(error){say(error.message);}finally{busy=false;button.disabled=false;}
 });
 let logCursor='';
 async function logs(append=false){
  try{const page=await call('adminLogs',{cursor:append?logCursor:''}),host=el('[data-log-list]');if(!append)host.replaceChildren();
   const names={request:'提交登录申请',login:'登录成功',device_approved:'通过授权',device_rejected:'拒绝申请',device_revoked:'撤销授权'};
   for(const row of page.logs){const line=document.createElement('div');line.className='query-access-log';line.textContent=new Date(row.at).toLocaleString()+' · '+row.actor+' · '+(names[row.action]||row.action)+' · '+row.name+'（设备 '+row.targetId.slice(0,8)+'）';host.append(line);}
   logCursor=page.nextCursor;el('[data-more-logs]').hidden=!logCursor;
  }catch(error){say(error.message);}
 }
 el('[data-logs]').onclick=()=>logs();el('[data-more-logs]').onclick=()=>logs(true);
 const originalPayload=root.buildQueryPayloadV72;
 root.buildQueryPayloadV72=function(){
  const payload=originalPayload(),items=db.items.filter(x=>!x.deleted&&(!x.status||x.status==='在库'));
  payload.version=3;payload.items=payload.items.map((x,i)=>({...x,id:String(items[i].id)}));
  const ids=new Set(items.map(x=>String(x.id))),pallets=new Set(items.map(x=>String(x.pallet)));
  payload.photoAttachments=(db.photoAttachments||[]).filter(p=>!p.deleted&&(p.targetType==='item'&&ids.has(String(p.targetId))||p.targetType==='pallet'&&pallets.has(String(p.targetId)))).map(p=>({id:p.id,targetType:p.targetType,targetId:p.targetId,note:p.note||'',github:{owner:p.github?.owner,repo:p.github?.repo,branch:p.github?.branch,full:p.github?.full,thumbnail:p.github?.thumbnail}}));
  return payload;
 };
 // 仅替换查询快照的发布目的地；不替换库存保存、库存备份或配单操作。
 root.putQueryDataToGitHubV73=async function(){
  const source=await call('adminInfo'),c=getGitHubConfigV44(),payload=buildQueryPayloadV72();
  if(!payload.passwordHash)throw Error('请先保存查询密码');
  if(c.owner!==source.owner||c.repo!==source.repo||c.branch!==source.branch)throw Error('审核服务配置的私有仓库与当前备份仓库不一致，请核对查询服务配置');
  if(!c.token)throw Error('请先填写GitHub Token');
  const url='https://api.github.com/repos/'+encodeURIComponent(source.owner)+'/'+encodeURIComponent(source.repo)+'/contents/'+source.path.split('/').map(encodeURIComponent).join('/');
  const headers={Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const current=await fetch(url+'?ref='+encodeURIComponent(source.branch),{headers,cache:'no-store',signal:controller.signal});let sha='';
   if(current.ok)sha=(await current.json()).sha;else if(current.status!==404)throw Error('私有查询快照读取失败：'+current.status);
   const body={message:'Update private read-only query snapshot',branch:source.branch,content:utf8ToBase64V44(JSON.stringify(payload)),...(sha?{sha}:{})};
   const response=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body),signal:controller.signal});
   if(!response.ok)throw Error([409,422].includes(response.status)?'查询快照已被其他设备更新，请重试同步':'私有查询同步失败：'+response.status);
   localStorage.setItem('queryLastSyncAtV73',new Date().toISOString());return payload.items.length;
  }finally{clearTimeout(timeout);}
 };
 schedule();if(key&&settings.endpoint)refresh();
})(window);
