const test=require('node:test'),assert=require('node:assert/strict');
const {createService,hash}=require('../cloudfunctions/warehouseQueryV1/service');
const crypto=require('node:crypto');
const {gunzipSync}=require('node:zlib');
function fixture(){
 let time=Date.now(),tables={devices:new Map(),rates:new Map(),audit:new Map()},serial=Promise.resolve();
 const adapter={get:async(t,id)=>structuredClone(tables[t].get(id)),put:async(t,id,v)=>tables[t].set(id,structuredClone(v))};
 const repo={...adapter,countPending:async()=>[...tables.devices.values()].filter(x=>x.status==='pending').length,transaction:fn=>{
  const run=serial.then(async()=>{const before=structuredClone(tables);try{return await fn(adapter);}catch(e){tables=before;throw e;}});serial=run.catch(()=>{});return run;
 },list:async(t,cursor,limit,order='asc')=>[...tables[t].values()].filter(x=>!cursor||(order==='asc'?x.id>cursor:x.id<cursor)).sort((a,b)=>order==='asc'?a.id.localeCompare(b.id):b.id.localeCompare(a.id)).slice(0,limit)};
 const snapshot={passwordHash:hash('test-password'),revision:'r1',updatedAt:'now',features:{batchQuery:true},items:[{id:1,express:'11111111',pallet:'A'},{id:2,express:'22222222',deleted:true}],photoAttachments:[{id:'photo1',targetType:'item',targetId:'1',github:{token:'never-return'}},{id:'photo2',targetType:'item',targetId:'2'}]};
 const source={load:async()=>snapshot,photo:async()=> 'jpeg',info:async()=>({repo:'private'})};
 const key='a'.repeat(64),ctx={ip:'test',adminKey:key};
 const args={deviceId:crypto.randomUUID(),deviceSecret:crypto.randomBytes(32).toString('hex'),name:'张三',password:'test-password'};
 const service=createService({repo,source,adminSecret:key,now:()=>time});
 return {call:(action,a=args,c=ctx)=>service.dispatch(action,a,c),args,ctx,snapshot,source,table:t=>tables[t],advance:()=>time+=61000};
}
test('首次申请不泄露库存，重复申请幂等，审核后才能读取',async()=>{
 const d=fixture();assert.equal((await d.call('login')).status,'pending');assert.equal((await d.call('login')).status,'pending');assert.equal(d.table('devices').size,1);
 await assert.rejects(d.call('data',{},{}),/请重新登录/);await assert.rejects(d.call('photo',{id:'photo1',variant:'full'},{}));
 await d.call('adminReview',{id:d.args.deviceId,status:'approved'});const login=await d.call('login');
 assert.ok(login.token);const data=await d.call('data',{}, {token:login.token});
 assert.equal(data.items.length,1);assert.equal(data.items[0].photos.length,1);assert.ok(!JSON.stringify(data).includes('never-return'));assert.ok(!JSON.stringify(data).includes('passwordHash'));
 assert.equal((await d.call('photo',{id:'photo1',variant:'thumbnail'},{token:login.token})).content,'jpeg');
 await assert.rejects(d.call('photo',{id:'photo2',variant:'full'},{token:login.token}));
});
test('撤销立即失效，重新批准也不能复用旧令牌',async()=>{
 const d=fixture();await d.call('login');await d.call('adminReview',{id:d.args.deviceId,status:'approved'});const {token}=await d.call('login');
 await d.call('adminReview',{id:d.args.deviceId,status:'revoked'});await assert.rejects(d.call('data',{}, {token}),/撤销/);
 assert.equal((await d.call('login')).status,'revoked');await d.call('adminReview',{id:d.args.deviceId,status:'approved'});await assert.rejects(d.call('data',{}, {token}));
});
test('不能冒用设备或姓名，错误密码不能提交申请',async()=>{
 const d=fixture();await assert.rejects(d.call('login',{...d.args,password:'wrong'}));assert.equal(d.table('devices').size,0);await d.call('login');
 await assert.rejects(d.call('login',{...d.args,name:'李四'}),/不一致/);await assert.rejects(d.call('status',{...d.args,deviceSecret:'b'.repeat(64)}));
 await assert.rejects(d.call('adminReview',{id:d.args.deviceId,status:'approved'},{adminKey:'wrong'}));
});
test('密码尝试限流，申请和审核日志不含密码凭据',async()=>{
 const d=fixture();for(let i=0;i<8;i++)await assert.rejects(d.call('login',{...d.args,password:'wrong'}));await assert.rejects(d.call('login'),e=>e.status===429);
 d.advance();await d.call('login');await d.call('adminReview',{id:d.args.deviceId,status:'rejected'});
 const logs=await d.call('adminLogs',{});assert.equal(logs.logs.length,2);const text=JSON.stringify(logs);assert.ok(!text.includes(d.args.deviceSecret));assert.ok(!text.includes('test-password'));
});
test('数据分页校验版本，不接受任意图片变体',async()=>{
 const d=fixture();await d.call('login');await d.call('adminReview',{id:d.args.deviceId,status:'approved'});const {token}=await d.call('login');
 await assert.rejects(d.call('data',{revision:'old'},{token}),e=>e.code==='REVISION_CHANGED');await assert.rejects(d.call('photo',{id:'photo1',variant:'../../secret'},{token}));
});
test('照片验证与图片下载共用一次请求预算，避免两个重试周期叠加',async()=>{
 const d=fixture();await d.call('login');await d.call('adminReview',{id:d.args.deviceId,status:'approved'});const {token}=await d.call('login');let deadline;
 d.source.load=async options=>{deadline=options?.deadline;assert.ok(Number.isFinite(deadline));return d.snapshot;};
 d.source.photo=async(photo,variant,options)=>{assert.equal(options?.deadline,deadline);return 'jpeg';};
 const result=await d.call('photo',{id:'photo1',variant:'thumbnail'},{token});assert.equal(result.content,'jpeg');
});
test('审核后的登录一次返回压缩查询数据，不包含密码校验值和GitHub路径',async()=>{
 const d=fixture();const pending=await d.call('login');assert.equal(pending.snapshot,undefined);
 await d.call('adminReview',{id:d.args.deviceId,status:'approved'});const login=await d.call('login');
 assert.equal(login.snapshot.encoding,'gzip-base64');const decoded=JSON.parse(gunzipSync(Buffer.from(login.snapshot.content,'base64')));
 assert.equal(decoded.items.length,1);assert.equal(decoded.items[0].express,'11111111');assert.equal(decoded.items[0].photos.length,1);
 assert.ok(!JSON.stringify(decoded).includes('never-return'));assert.equal(decoded.passwordHash,undefined);
});
test('版本未变只返回轻量确认，新版才返回数据，撤销后仍拒绝版本检查',async()=>{
 const d=fixture();await d.call('login');await d.call('adminReview',{id:d.args.deviceId,status:'approved'});const {token}=await d.call('login');
 const same=await d.call('compactData',{revision:'r1'},{token});assert.equal(same.unchanged,true);assert.equal(same.content,undefined);
 d.snapshot.revision='r2';d.snapshot.items[0].pallet='NEW';const changed=await d.call('compactData',{revision:'r1'},{token});
 assert.equal(JSON.parse(gunzipSync(Buffer.from(changed.content,'base64'))).items[0].pallet,'NEW');
 await d.call('adminReview',{id:d.args.deviceId,status:'revoked'});await assert.rejects(d.call('compactData',{revision:'r2'},{token}));
});
