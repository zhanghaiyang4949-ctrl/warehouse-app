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
