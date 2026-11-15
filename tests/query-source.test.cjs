const test=require('node:test'),assert=require('node:assert/strict');
const {createSource}=require('../cloudfunctions/warehouseQueryV1/github');
const env={QUERY_GITHUB_OWNER:'qa',QUERY_GITHUB_REPO:'private-backup',QUERY_GITHUB_TOKEN:'fixture-secret'};
function response(value,status=200){return new Response(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value),{status});}
test('公开仓库拒绝服务，不从公共快照回退读取',async()=>{
 let requests=0;const source=createSource(env,async()=>{requests++;return response({private:false});});await assert.rejects(source.load(),e=>e.code==='PRIVATE_REPO_REQUIRED');assert.equal(requests,1);
});
test('大于1MB的查询快照用raw读取并缓存，不依赖content字段',async()=>{
 let requests=0;const text=JSON.stringify({version:3,items:[],passwordHash:'a'.repeat(64),padding:'a'.repeat(1200000)});
 const source=createSource(env,async(url,options)=>{requests++;if(url.includes('/contents/')){assert.equal(options.headers.Accept,'application/vnd.github.raw+json');return response(text);}return response({private:true});});
 const a=await source.load(),b=await source.load();assert.equal(a.revision,b.revision);assert.equal(requests,2);
});
test('图片必须来自固定私有仓库的合法JPEG路径',async()=>{
 let requests=0;const source=createSource(env,async(url)=>{requests++;return response(url.includes('/contents/')?Buffer.from([255,216,255]):{private:true});});
 const github={owner:'qa',repo:'private-backup',branch:'main',full:'warehouse-images/2026/11/15/ab/'+'ab'.repeat(32)+'.jpg'};
 assert.equal(await source.photo({github},'full'),Buffer.from([255,216,255]).toString('base64'));
 await assert.rejects(source.photo({github:{...github,repo:'other'}},'full'));
 await assert.rejects(source.photo({github:{...github,full:'../../private.json'}},'full'));
 assert.equal(requests,2);
});
test('无效源数据与错误格式图片不当作成功结果',async()=>{
 const source=createSource(env,async url=>response(url.includes('/contents/')?'{}':{private:true}));await assert.rejects(source.load(),/快照格式/);
 const imageSource=createSource(env,async url=>response(url.includes('/contents/')?'not JPEG':{private:true}));
 await assert.rejects(imageSource.photo({github:{owner:'qa',repo:'private-backup',branch:'main',full:'warehouse-images/2026/11/15/ab/'+'ab'.repeat(32)+'.jpg'}},'full'),/JPEG/);
});
test('GitHub首次连接超时会重试成功，不把临时超时报成配置错误',async()=>{
 let reads=0;const source=createSource(env,async url=>{
  if(!url.includes('/contents/'))return response({private:true});
  reads++;if(reads===1)throw new DOMException('connection timed out','AbortError');
  return response({version:3,items:[],passwordHash:'a'.repeat(64)});
 });
 const snapshot=await source.load();assert.equal(snapshot.items.length,0);assert.equal(reads,2);
});
test('连续连接超时返回可识别的临时网络错误',async()=>{
 let reads=0;const source=createSource(env,async()=>{reads++;throw new DOMException('connection timed out','AbortError');});
 await assert.rejects(source.load(),error=>error.code==='SOURCE_TIMEOUT'&&error.status===503);assert.equal(reads,2);
});
test('同一批分页读取复用已确认版本，不因5秒缓存到期重复拉取GitHub',async()=>{
 let time=1000000,reads=0;
 const source=createSource(env,async url=>{reads++;return response(url.includes('/contents/')?{version:3,items:[{id:'one'}],passwordHash:'a'.repeat(64)}:{private:true});},()=>time);
 const first=await source.load();time+=6000;const next=await source.load({revision:first.revision});assert.equal(next.revision,first.revision);assert.equal(reads,2);
 await source.load();assert.equal(reads,3);
});
test('已通过审核的完整登录流程遇到GitHub短暂超时仍返回登录令牌',async()=>{
 const {createService,hash}=require('../cloudfunctions/warehouseQueryV1/service');
 const id=require('node:crypto').randomUUID(),secret='c'.repeat(64),tables={devices:new Map(),rates:new Map(),audit:new Map()};
 tables.devices.set(id,{id,name:'连接回归测试',proof:hash(secret),status:'approved',version:2});
 const adapter={get:async(table,key)=>structuredClone(tables[table].get(key)),put:async(table,key,value)=>tables[table].set(key,structuredClone(value))};
 let reads=0;const source=createSource(env,async url=>{
  if(!url.includes('/contents/'))return response({private:true});
  if(++reads===1)throw new DOMException('timed out','AbortError');
  return response({version:3,items:[],passwordHash:hash('fixture-password')});
 });
 const service=createService({repo:{...adapter,transaction:fn=>fn(adapter)},source,adminSecret:'a'.repeat(64)});
 const result=await service.dispatch('login',{deviceId:id,deviceSecret:secret,name:'连接回归测试',password:'fixture-password'},{ip:'fixture'});
 assert.equal(result.status,'approved');assert.ok(result.token);assert.equal(reads,2);assert.ok(tables.devices.get(id).lastLoginAt);
});
