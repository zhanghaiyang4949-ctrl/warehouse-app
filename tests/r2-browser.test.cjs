const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const settings=new Map(),calls=[],objects=new Map();let drop=false,forbidden=false;const c={Blob,URL,AbortController,setTimeout,clearTimeout,JSON,fetch:async(url,o={})=>{if(o.method==='PUT'){objects.set(url,o.body);if(drop){drop=false;throw Error('response lost');}return {ok:true};}return {ok:!forbidden,status:forbidden?403:200,arrayBuffer:async()=>new Uint8Array([1]).buffer};},localStorage:{getItem:k=>settings.get(k)||null,setItem:(k,v)=>settings.set(k,v)},getGitHubConfigV44:()=>({owner:'a',repo:'b',branch:'main'}),WarehousePhotoStore:{cache:{put:async()=>{}}},WarehouseQueryAccessTransport:{call:async(action,args)=>{calls.push(action);if(action==='adminR2Info')return {enabled:true,bucket:'private'};if(action==='adminR2Upload')return {files:{full:{exists:objects.has('https://signed/full'),url:'https://signed/full'},thumbnail:{exists:false,url:'https://signed/thumbnail'}}};if(action==='adminR2Verify')return {verified:true};return {url:'https://signed/read'};}}};c.window=c;vm.runInNewContext(fs.readFileSync('assets/photos/r2.js','utf8'),c);return {api:c.WarehousePhotoR2,calls,settings,setDrop:()=>drop=true,setForbidden:()=>forbidden=true};}
function photo(){return {record:{storage:{provider:'r2',bucket:'private',full:'full',thumbnail:'thumbnail'},hash:'abc',thumbHash:'def'},full:new Blob(['x']),thumbnail:new Blob(['y']),uploaded:{}};}
test('R2 default remains GitHub; selecting requires successful info; settings survive reload without secrets',async()=>{const d=setup();assert.equal(d.api.config().provider,'github');assert.throws(()=>d.api.select('r2'));await d.api.connect();d.api.select('r2');assert.equal(d.api.draftStorage({full:'a',thumbnail:'b'}).bucket,'private');assert.ok(!JSON.stringify([...d.settings]).includes('signed'));});
test('R2 dropped PUT resumes using exists and verifies before completion; flags bind metadata',async()=>{const d=setup(),p=photo();d.setDrop();await assert.rejects(d.api.uploadFile(p,'full'),/response lost/);assert.equal(d.api.complete(p,'full'),false);await d.api.uploadFile(p,'full');assert.equal(d.api.complete(p,'full'),true);p.record.storage.bucket='other';assert.equal(d.api.complete(p,'full'),false);assert.ok(d.calls.includes('adminR2Verify'));});
test('R2 private reads fail closed on forbidden',async()=>{const d=setup();d.setForbidden();await assert.rejects(d.api.read(photo().record,'full'),/读取/);});

test('mixed router keeps GitHub legacy upload and uses verified R2 completion',async()=>{
 const rows=new Map(),writes=[];const github={owner:'a',repo:'b',branch:'main'};
 const r2={id:'r2',github,storage:{provider:'r2',bucket:'private',full:'f',thumbnail:'t'},hash:'abc',thumbHash:'def'};
 const legacy={id:'old',github:{...github,full:'warehouse-images/full.jpg',thumbnail:'warehouse-images/thumb.jpg'}};
 for(const record of [r2,legacy])rows.set(record.id,{id:record.id,record,originLocal:true,full:new Blob(['x']),thumbnail:new Blob(['y']),uploaded:{}});
 const context={Blob,URL,AbortController,Uint8Array,setTimeout,clearTimeout,Date,btoa,getGitHubConfigV44:()=>github,navigator:{},localStorage:{getItem:()=>null,setItem:()=>{}},addEventListener:()=>{},document:{querySelector:()=>null,createElement:()=>({querySelector:()=>({}),remove:()=>{}})},WarehousePhotoStore:{scope:c=>JSON.stringify([c.owner,c.repo,c.branch]),blobSha:async b=>b.text(),readBlobBytes:async b=>b.arrayBuffer(),cache:{get:async id=>rows.get(id),put:async p=>rows.set(p.id,structuredClone(p))}},WarehouseQueryAccessTransport:{call:async(action)=>action==='adminR2Upload'?{files:{full:{exists:true},thumbnail:{exists:true}}}:{verified:true}},fetch:async(url,o)=>{writes.push(url);return {ok:true,json:async()=>({sha:o?'x':'x'})};}};
 context.window=context;vm.runInNewContext(fs.readFileSync('assets/photos/r2.js','utf8'),context);vm.runInNewContext(fs.readFileSync('assets/photos/github.js','utf8'),context);
 await context.WarehousePhotoGit.upload([r2]);assert.equal(writes.length,0);assert.equal(await context.WarehousePhotoGit.pending([r2]),false);
 rows.get('r2').uploaded={full:true,thumbnail:true};assert.equal(await context.WarehousePhotoGit.pending([r2]),true);
 // Legacy cached uploaded markers remain valid; mixed iteration does not relabel either record.
 rows.get('old').uploaded={full:'x',thumbnail:'y'};await context.WarehousePhotoGit.upload([legacy,r2]);assert.equal(await context.WarehousePhotoGit.pending([legacy,r2]),false);assert.equal(rows.get('old').record.storage,undefined);
});

test('expired signed PUT retries once; repeated forbidden never marks uploaded',async()=>{
 const d=setup(),p=photo();let puts=0; // Replace browser fetch; transport is retained.
 // A second isolated VM makes expiry and abort deterministic.
 const c={Blob,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>null},getGitHubConfigV44:()=>({}),WarehousePhotoStore:{cache:{put:async()=>{}}},WarehouseQueryAccessTransport:{call:async action=>action==='adminR2Upload'?{files:{full:{url:'https://signed/expired'}}}:{verified:true}},fetch:async()=>{puts++;return {ok:false,status:403};}};c.window=c;vm.runInNewContext(fs.readFileSync('assets/photos/r2.js','utf8'),c);
 await assert.rejects(c.WarehousePhotoR2.uploadFile(p,'full'),/403/);assert.equal(puts,2);assert.equal(c.WarehousePhotoR2.complete(p,'full'),false);
 const controller=new AbortController();controller.abort();await assert.rejects(c.WarehousePhotoR2.uploadFile(p,'full',controller.signal),e=>e.cancelled===true);assert.equal(puts,2);
});
test('R2 fails closed without an admin transport; no provider fallback',async()=>{
 const c={Blob,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>null},getGitHubConfigV44:()=>({})};c.window=c;vm.runInNewContext(fs.readFileSync('assets/photos/r2.js','utf8'),c);await assert.rejects(c.WarehousePhotoR2.read(photo().record,'full'),/管理连接/);assert.equal(c.WarehousePhotoR2.config().provider,'github');
});

test('restored R2 metadata key order is equivalent; changed content metadata blocks upload and cached reads',async()=>{
 const github={owner:'a',repo:'b',branch:'main'},record={...photo().record,id:'semantic',github,bytes:1,thumbBytes:1},rows=new Map();
 rows.set(record.id,{id:record.id,record:structuredClone(record),originLocal:true,full:new Blob(['x']),thumbnail:new Blob(['y']),uploaded:{}});
 let requests=0;const context={Blob,URL,AbortController,Uint8Array,setTimeout,clearTimeout,Date,btoa,getGitHubConfigV44:()=>github,navigator:{},localStorage:{getItem:()=>null,setItem:()=>{}},addEventListener:()=>{},document:{querySelector:()=>null,createElement:()=>({querySelector:()=>({}),remove:()=>{}})},WarehousePhotoStore:{scope:c=>JSON.stringify([c.owner,c.repo,c.branch]),readBlobBytes:async b=>b.arrayBuffer(),cache:{get:async id=>rows.get(id),put:async p=>rows.set(p.id,structuredClone(p))}},WarehouseQueryAccessTransport:{call:async action=>{requests++;return action==='adminR2Upload'?{files:{full:{exists:true},thumbnail:{exists:true}}}:{verified:true};}}};context.window=context;
 vm.runInNewContext(fs.readFileSync('assets/photos/r2.js','utf8'),context);vm.runInNewContext(fs.readFileSync('assets/photos/github.js','utf8'),context);
 const reordered={...record,storage:{thumbnail:'thumbnail',full:'full',bucket:'private',provider:'r2'}};
 await context.WarehousePhotoGit.upload([reordered]);assert.equal(await context.WarehousePhotoGit.pending([reordered]),false);
 const before=rows.get(record.id),changed={...record,thumbHash:'different'};
 await assert.rejects(context.WarehousePhotoGit.upload([changed]),/存储信息/);
 await assert.rejects(context.WarehousePhotoGit.pending([changed]),/存储信息/);
 await assert.rejects(context.WarehousePhotoGit.imageURL(changed),/存储信息/);assert.equal(rows.get(record.id),before);assert.equal(requests,4);
});
