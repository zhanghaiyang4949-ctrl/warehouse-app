const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createR2}=require('../cloudfunctions/warehouseQueryV1/r2');
const {createService}=require('../cloudfunctions/warehouseQueryV1/service');
const bytes=Buffer.from([255,216,255,217]),sha=crypto.createHash('sha256').update(bytes).digest('hex');
const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'warehouse-private',R2_ACCESS_KEY_ID:'b'.repeat(32),R2_SECRET_ACCESS_KEY:'c'.repeat(64)};
const full=`warehouse-images/2026/11/19/${sha.slice(0,2)}/${sha}.jpg`;
const record={hash:sha,thumbHash:sha,bytes:4,thumbBytes:4,storage:{provider:'r2',bucket:env.R2_BUCKET,full,thumbnail:full.replace('.jpg','-thumb.jpg')}};
function response(body=bytes,status=200){return new Response(body,{status,headers:{'content-type':'image/jpeg','content-length':String(body?.length||0),'x-amz-meta-sha256':sha,'x-amz-meta-bytes':'4'}});}
test('R2 absent is disabled; partial config fails without credential disclosure',async()=>{
 assert.deepEqual(await createR2({}).info(),{enabled:false,bucket:''});
 await assert.rejects(createR2({R2_SECRET_ACCESS_KEY:'private-secret'}).info(),e=>e.code==='R2_CONFIG_INVALID'&&!e.message.includes('private-secret'));
});
test('info probes pinned bucket credentials before reporting connected',async()=>{
 let called=false;const r2=createR2(env,async(url,options)=>{called=true;assert.equal(options.method,'HEAD');assert.equal(new URL(url).pathname,'/'+env.R2_BUCKET);return response();});
 assert.deepEqual(await r2.info(),{enabled:true,bucket:env.R2_BUCKET});assert.equal(called,true);
 await assert.rejects(createR2(env,async()=>new Response(null,{status:403})).info(),e=>e.code==='R2_UNAVAILABLE');
});
test('R2 upload rates have an independent bounded budget from admin review',async()=>{
 const keys=[];const repo={transaction:fn=>fn({get:async()=>null,put:async(table,key)=>keys.push(key)})};
 const source={r2:{info:async()=>({enabled:true})},info:async()=>({})};const service=createService({repo,source,adminSecret:'a'.repeat(64),now:()=>1000});
 const ctx={adminKey:'a'.repeat(64)};await service.dispatch('adminInfo',{},ctx);await service.dispatch('adminR2Info',{},ctx);assert.notEqual(keys[0],keys[1]);
});
test('disabled R2 record never falls back to GitHub photo credentials',async()=>{
 const {createSource}=require('../cloudfunctions/warehouseQueryV1/github');let calls=0;
 const source=createSource({QUERY_GITHUB_OWNER:'owner',QUERY_GITHUB_REPO:'repo',QUERY_GITHUB_TOKEN:'legacy'},async()=>{calls++;return response();});
 await assert.rejects(source.photo(record,'full'),e=>e.code==='R2_DISABLED');assert.equal(calls,0);
});
test('upload signs only pinned hash paths and payload, immutable short tickets',async()=>{
 const r2=createR2(env,async()=>response(null,404),()=>Date.UTC(2026,10,19));
 const ticket=await r2.upload(record);const f=ticket.files.full,u=new URL(f.url);
 assert.equal(f.exists,false);assert.equal(u.hostname,env.R2_ACCOUNT_ID+'.r2.cloudflarestorage.com');
 assert.equal(u.searchParams.get('X-Amz-Expires'),'120');assert.equal(f.headers['x-amz-content-sha256'],sha);assert.equal(f.headers['if-none-match'],'*');
 assert.ok(u.searchParams.get('X-Amz-SignedHeaders').includes('x-amz-content-sha256'));
 assert.ok(u.searchParams.get('X-Amz-SignedHeaders').split(';').includes('content-length'));assert.equal(f.headers['content-length'],undefined);
 for(const invalid of [{...record,bytes:4194305},{...record,hash:'d'.repeat(64)},{...record,storage:{...record.storage,bucket:'other'}},{...record,storage:{...record.storage,full:full.replace('/11/','/13/')}}])await assert.rejects(r2.upload(invalid),e=>e.code==='R2_RECORD_INVALID');
});
test('verify computes actual bytes and rejects forged metadata/corrupt JPEG',async()=>{
 let body=bytes;const r2=createR2(env,async()=>response(body));
 assert.deepEqual(await r2.verify(record,'full'),{verified:true});
 assert.equal(await r2.photo(record,'thumbnail'),bytes.toString('base64'));
 body=Buffer.from([255,216,1,2]);await assert.rejects(r2.verify(record,'full'),e=>e.code==='R2_INTEGRITY_FAILED');
 assert.throws(()=>r2.read(record,'../../secret'),e=>e.code==='R2_RECORD_INVALID');
});
test('admin auth and device auth reject before R2 network/signing',async()=>{
 let calls=0;const source={r2:{info(){calls++;return {};},upload(){calls++;return {};}}};
 const repo={transaction:fn=>fn({get:async()=>null,put:async()=>{}})};
 const service=createService({repo,source,adminSecret:'a'.repeat(64)});
 await assert.rejects(service.dispatch('adminR2Upload',{record},{adminKey:'wrong'}));
 await assert.rejects(service.dispatch('photo',{id:'x',variant:'full'},{}));assert.equal(calls,0);
 assert.deepEqual(await service.dispatch('adminR2Info',{}, {adminKey:'a'.repeat(64)}),{});assert.equal(calls,1);
});
test('HEAD metadata is bound before verification and GET bytes remain authoritative',async()=>{
 let methods=[],bad=false;
 const r2=createR2(env,async(url,options)=>{methods.push(options.method);const r=response();if(bad)r.headers.set('x-amz-meta-sha256','f'.repeat(64));return r;});
 await r2.verify(record,'full');assert.deepEqual(methods,['HEAD','GET']);
 methods=[];bad=true;await assert.rejects(r2.verify(record,'full'),e=>e.code==='R2_INTEGRITY_FAILED');assert.deepEqual(methods,['HEAD']);
});
test('configured source routes R2 separately while preserving legacy GitHub',async()=>{
 const {createSource}=require('../cloudfunctions/warehouseQueryV1/github');let urls=[];
 const source=createSource({...env,QUERY_GITHUB_OWNER:'owner',QUERY_GITHUB_REPO:'repo',QUERY_GITHUB_TOKEN:'github-secret'},async(url)=>{
  urls.push(url);if(url.includes('r2.cloudflarestorage.com'))return response();
  if(!url.includes('/contents/'))return new Response(JSON.stringify({private:true}));return response();
 });
 assert.equal(await source.photo(record,'full'),bytes.toString('base64'));assert.equal(urls.length,1);assert.ok(urls[0].includes('r2.cloudflarestorage.com'));
 urls=[];await source.photo({github:{owner:'owner',repo:'repo',branch:'main',full}},'full');assert.equal(urls.length,2);assert.ok(urls.every(u=>u.startsWith('https://api.github.com/')));
});
// Independent verifier reconstructs the canonical request from the wire, rather
// than invoking signer internals. Presigned query authentication uses UNSIGNED-PAYLOAD
// in the canonical request even when a separately signed payload hash header exists.
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
function verifyWireSignature(url,method,headers,body){
 const u=new URL(url),p=u.searchParams,escape=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt().toString(16).toUpperCase());
 const [access,...scopeParts]=p.get('X-Amz-Credential').split('/');assert.equal(access,env.R2_ACCESS_KEY_ID);
 const wireHeaders={host:u.host,...headers};
 const canonicalHeaders=p.get('X-Amz-SignedHeaders').split(';').map(name=>{assert.notEqual(wireHeaders[name],undefined);return name+':'+String(wireHeaders[name]).trim()+'\n';}).join('');
 const entries=[...p].filter(([key])=>key!=='X-Amz-Signature').map(([k,v])=>[escape(k),escape(v)]).sort(([a,av],[b,bv])=>a<b?-1:a>b?1:av<bv?-1:av>bv?1:0);
 const canonical=[method,u.pathname,entries.map(pair=>pair.join('=')).join('&'),canonicalHeaders,p.get('X-Amz-SignedHeaders'),'UNSIGNED-PAYLOAD'].join('\n');
 const hash=crypto.createHash('sha256').update(canonical).digest('hex');
 const key=scopeParts.reduce((key,part)=>crypto.createHmac('sha256',key).update(part).digest(),Buffer.from('AWS4'+env.R2_SECRET_ACCESS_KEY));
 const computed=crypto.createHmac('sha256',key).update(['AWS4-HMAC-SHA256',p.get('X-Amz-Date'),scopeParts.join('/'),hash].join('\n')).digest('hex');
 assert.equal(p.get('X-Amz-Signature'),computed);
 if(body){assert.equal(headers['content-length'],String(body.length));assert.equal(headers['x-amz-content-sha256'],crypto.createHash('sha256').update(body).digest('hex'));}
}
test('independent wire verification accepts GET/PUT and rejects altered scope, body and method',async()=>{
 const r2=createR2(env,async()=>response(null,404),()=>Date.UTC(2026,10,19,12,30));
 const ticket=(await r2.upload(record)).files.full,headers={...ticket.headers,'content-length':'4'};
 verifyWireSignature(ticket.url,'PUT',headers,bytes);
 verifyWireSignature(r2.read(record,'full').url,'GET',{});
 assert.throws(()=>verifyWireSignature(ticket.url,'GET',headers));
 assert.throws(()=>verifyWireSignature(ticket.url.replace('/warehouse-private/','/other-bucket/'),'PUT',headers));
 assert.throws(()=>verifyWireSignature(ticket.url,'PUT',{...headers,'content-length':'5'}));
 assert.throws(()=>verifyWireSignature(ticket.url,'PUT',headers,Buffer.from([255,216,1,2])));
 assert.throws(()=>verifyWireSignature(ticket.url.replace('X-Amz-Expires=120','X-Amz-Expires=3600'),'PUT',headers));
});
