// 仅用于本机自动验收：假数据、假密钥，不连接真实仓库或腾讯云。
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createService,hash}=require('../cloudfunctions/warehouseQueryV1/service');
const manager=path.resolve('.'),client=path.resolve('../warehouse-query'),key='local-fixture-only-'.repeat(4);
let tables={devices:new Map(),rates:new Map(),audit:new Map()},serial=Promise.resolve();
const adapter={get:async(t,id)=>structuredClone(tables[t].get(id)),put:async(t,id,row)=>tables[t].set(id,structuredClone(row))};
const repo={...adapter,countPending:async()=>[...tables.devices.values()].filter(x=>x.status==='pending').length,transaction:fn=>{const result=serial.then(()=>fn(adapter));serial=result.catch(()=>{});return result;},list:async(t,c,l,order='asc')=>[...tables[t].values()].filter(x=>!c||(order==='asc'?x.id>c:x.id<c)).sort((a,b)=>(order==='asc'?1:-1)*a.id.localeCompare(b.id)).slice(0,l)};
const data={passwordHash:hash('fixture-password'),revision:'fixture-v1',updatedAt:new Date().toISOString(),features:{batchQuery:true},items:[
 {id:1,express:'11110001',last4:'0001',customer:'QA',date:'2026-11-10',pallet:'A-2'},
 {id:2,express:'22220002',last4:'0002',customer:'QA',date:'2026-11-11',pallet:'A-10'},
 {id:3,express:'33330003',last4:'0003',customer:'QB',date:'2026-11-12',pallet:'B-1'}
],photoAttachments:[{id:'fixture-photo',targetType:'item',targetId:'1',note:'测试箱子'}]};
let photo='',uploadedSnapshot;const service=createService({repo,source:{load:async()=>data,photo:async()=>photo,info:async()=>({owner:'fixture-owner',repo:'fixture-backup',branch:'main',path:'query-secure/query-data.json.gz'})},adminSecret:key});
const transport=`<script>const realFetch=window.fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('https://query.fixture/')?realFetch('/api',options):String(url).startsWith('https://api.github.com/repos/fixture-owner/fixture-backup/contents/')?realFetch('/capture-query-upload',options):realFetch(url,options);</script>`;
const clientTests=`<script>
(async()=>{
 const tests=[],check=(name,ok)=>{tests.push({name,pass:!!ok});if(!ok)throw Error(name);},wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('界面等待超时');};
 const admin=async(action,args={})=>(await(await fetch('https://query.fixture/',{method:'POST',headers:{'Content-Type':'application/json','X-Query-Admin':${JSON.stringify(key)}},body:JSON.stringify({action,args})})).json()).data;
 try{
  await wait(()=>window.WarehouseQuery);document.getElementById('personName').value='测试人员';document.getElementById('pwd').value='fixture-password';await login();
  check('未审核不进入查询且无库存载入',document.getElementById('app').style.display==='none'&&payload===null);
  const devices=await admin('adminList'),own=JSON.parse(localStorage.getItem('warehouseQueryDeviceV1')),device=devices.devices.find(x=>x.id===own.id);check('申请已生成',device?.status==='pending');
  await admin('adminReview',{id:device.id,status:'approved'});
  await wait(()=>payload?.items.length===3&&document.getElementById('app').style.display==='block');check('审核通过后等待页自动进入查询',true);
  document.getElementById('quick').value='QA';await quickSearch();check('快速查询保留原规则',currentItems.length===2);
  const filter=document.getElementById('palletFilter');check('快速查询生成筛选项',filter.options.length===3);filter.value='A-2';onBatchFilterChangeV81();check('快速筛选生效',document.querySelectorAll('#results .query-result').length===1);
  clearBatchFiltersV79();document.getElementById('sortField').value='pallet';document.getElementById('sortDirection').value='desc';renderCurrent();check('自然排序降序生效',document.querySelector('#results .query-result-pallet').textContent==='A-10');
  clearBatchFiltersV79();document.getElementById('batch').value='0002\\n9999\\n0001';await batchSearch();check('批量查询保留原输入及未找到项',currentBatch.length===3&&document.getElementById('results').textContent.includes('9999')&&document.getElementById('results').textContent.indexOf('22220002')<document.getElementById('results').textContent.indexOf('11110001'));
  const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,20,20);await fetch('/fixture-photo',{method:'POST',body:canvas.toDataURL('image/jpeg').split(',')[1]});
  document.querySelector('[data-query-view]').click();await wait(()=>document.querySelector('.query-photo-viewer img')?.naturalWidth>0);check('授权图片可放大',!!document.querySelector('.query-photo-viewer'));document.querySelector('.query-photo-viewer button').click();
  check('手机页面无横向溢出',document.documentElement.scrollWidth<=innerWidth);
  await admin('adminReview',{id:device.id,status:'revoked'});await refreshLatestDataV75(false);check('撤销后立即清空界面和图片',payload===null&&document.getElementById('app').style.display==='none'&&!document.querySelector('.query-photo-viewer'));
  await admin('adminReview',{id:device.id,status:'approved'});document.getElementById('pwd').value='fixture-password';await login();document.getElementById('quick').value='QA';await quickSearch();document.querySelector('[data-query-view]').click();await wait(()=>document.querySelector('.query-photo-viewer img')?.naturalWidth>0);
  const connectedFetch=window.fetch;window.fetch=()=>Promise.reject(TypeError('fixture offline'));await WarehouseQuery.checkAuthorization();window.fetch=connectedFetch;
  check('断网无法核实权限时清空库存及已打开大图',payload===null&&!document.querySelector('.query-photo-viewer')&&document.getElementById('app').style.display==='none');
  document.getElementById('pwd').value='fixture-password';await login();document.getElementById('quick').value='QA';await quickSearch();document.querySelector('[data-query-view]').click();await wait(()=>document.querySelector('.query-photo-viewer img')?.naturalWidth>0);WarehouseQuery.lock('日期已变化，请重新登录');
  check('每日退出通过统一锁定清空图片及会话',payload===null&&!document.querySelector('.query-photo-viewer'));
 }catch(error){tests.push({error:error.message,stack:error.stack});}
 const out=document.createElement('pre');out.id='query-qa-result';out.textContent=JSON.stringify(tests);document.body.append(out);
})();</script>`;
const managerTests=`<script>
(async()=>{
 const tests=[],check=(name,ok)=>{tests.push({name,pass:!!ok});if(!ok)throw Error(name);},wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('界面等待超时');};
 try{
  await wait(()=>storageReady&&document.querySelector('.query-access'));
  const name='管理端验收人员',id=crypto.randomUUID(),secret='a'.repeat(64);
  await fetch('https://query.fixture/',{method:'POST',body:JSON.stringify({action:'login',args:{name,password:'fixture-password',deviceId:id,deviceSecret:secret}})});
  const box=document.querySelector('.query-access');box.querySelector('[data-endpoint]').value='https://query.fixture/';box.querySelector('[data-secret]').value=${JSON.stringify(key)};box.querySelector('[data-connect]').click();
  await wait(()=>box.querySelector('[data-id="'+id+'"]'));check('管理端收到人员申请提醒',document.querySelector('.query-access-badge').style.display==='block');
  window.confirm=()=>true;box.querySelector('[data-id="'+id+'"][data-review="approved"]').click();await wait(()=>box.textContent.includes('已授权'));check('管理端审核按钮生效',box.querySelector('[data-id="'+id+'"][data-review="revoked"]'));
  showPage('data');setWorkspaceModeW106('data','query');check('审批位置在原查询管理页',!document.getElementById('data_queryW106').hidden);
  db.items=[{id:101,express:'QA0000101',customer:'QA',date:'2026-11-15',pallet:'T1'}];db.photoAttachments=[{id:'photo',targetType:'item',targetId:'101',github:{owner:'fixture-owner',repo:'fixture-backup',branch:'main',full:'warehouse-images/test.jpg',thumbnail:'warehouse-images/thumb.jpg',token:'must-not-leak'}}];
  localStorage.setItem('queryPasswordHashV72','fixture-hash');const snapshot=buildQueryPayloadV72();check('查询快照携带ID与图片但不泄露Token',snapshot.items[0].id==='101'&&snapshot.photoAttachments.length===1&&!JSON.stringify(snapshot).includes('must-not-leak'));
  document.getElementById('ghOwnerV44').value='fixture-owner';document.getElementById('ghRepoV44').value='fixture-backup';document.getElementById('ghBranchV44').value='main';document.getElementById('ghTokenV44').value='fixture-token';
  await putQueryDataToGitHubV73();const uploaded=await(await fetch('/captured-query-status')).json();check('管理端同步上传有效压缩快照且内容保持一致',uploaded.gzip&&uploaded.id==='101'&&uploaded.photos===1);
  box.querySelector('[data-logs]').click();await wait(()=>box.querySelector('[data-log-list]').textContent.includes('通过授权'));check('登录审核日志可查看',true);
  check('管理手机版无横向溢出',document.documentElement.scrollWidth<=innerWidth);
 }catch(error){tests.push({error:error.message,stack:error.stack});}
 const out=document.createElement('pre');out.id='query-qa-result';out.textContent=JSON.stringify(tests);document.body.append(out);
})();</script>`;
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),body=[];for await(const chunk of req)body.push(chunk);
 if(url.pathname==='/capture-query-upload'){
  if(req.method==='GET'){res.writeHead(404);res.end();return;}
  const encoded=JSON.parse(Buffer.concat(body)).content,bytes=Buffer.from(encoded,'base64');
  uploadedSnapshot={gzip:bytes[0]===31&&bytes[1]===139,data:JSON.parse(require('node:zlib').gunzipSync(bytes))};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({content:{sha:'fixture-sha'}}));return;
 }
 if(url.pathname==='/captured-query-status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({gzip:uploadedSnapshot?.gzip,id:uploadedSnapshot?.data.items[0].id,photos:uploadedSnapshot?.data.photoAttachments.length}));return;}
 if(url.pathname==='/fixture-photo'){photo=Buffer.concat(body).toString();res.end('ok');return;}
 if(url.pathname==='/api'){
  try{const value=JSON.parse(Buffer.concat(body).toString()),result=await service.dispatch(value.action,value.args,{adminKey:req.headers['x-query-admin'],token:String(req.headers.authorization||'').replace(/^Bearer /,''),ip:'fixture'});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,data:result}));}
  catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,message:error.message,code:error.code}));}return;
 }
 const isManager=url.pathname.startsWith('/admin/'),root=isManager?manager:client,relative=decodeURIComponent(url.pathname.replace(/^\/(admin|client)\//,'')),file=path.resolve(root,relative||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{
  let contents=fs.readFileSync(file);if(file.endsWith('index.html')){
   let html=contents.toString();html=html.replace('<head>','<head>'+transport);
   if(!isManager)html=html.replace('<script src="assets/secure-client.js','<script>window.WarehouseQueryConfig={endpoint:"https://query.fixture/"};</script><script src="assets/secure-client.js');
   html=html.replace('</body>',(isManager?managerTests:clientTests)+'</body>');contents=Buffer.from(html);
  }
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(contents);
 }catch{res.writeHead(404);res.end();}
}).listen(8876,'127.0.0.1',()=>console.log('query fixture ready'));
