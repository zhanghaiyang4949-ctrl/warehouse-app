const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
 const rows = new Map(), remote = new Map(), writes = [];
 let loseResponse = true;
 const config = {owner:'qa',repo:'photos',branch:'main',token:'fixture'};
 const record = {id:'photo',github:{...config,full:'warehouse-images/full.jpg',thumbnail:'warehouse-images/thumb.jpg'}};
 delete record.github.token;
 rows.set(record.id,{id:record.id,record,originLocal:true,full:new Blob(['full']),thumbnail:new Blob(['thumb']),uploaded:{}});
 const scope = c => JSON.stringify([c.owner,c.repo,c.branch]);
 const context = {AbortController,Blob,Uint8Array,Map,URL,setTimeout,clearTimeout,Date,btoa,
  getGitHubConfigV44:()=>config,navigator:{},localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{querySelector:()=>null,createElement:()=>({querySelector:()=>({}),remove:()=>{}})},
  WarehousePhotoStore:{scope,readBlobBytes:async blob=>blob.arrayBuffer(),blobSha:async blob=>await blob.text(),cache:{get:async id=>rows.get(id),put:async row=>rows.set(row.id,structuredClone(row))}},
  addEventListener:()=>{},
  fetch:async(url,options)=>{
   const path=url.split('?')[0];
   if(options.method==='PUT') {
    writes.push(path);const sha=atob(JSON.parse(options.body).content);remote.set(path,sha);
    if(loseResponse){loseResponse=false;throw TypeError('response lost');}
    return {ok:true,status:201,json:async()=>({content:{sha}})};
   }
   const sha=remote.get(path);return {ok:!!sha,status:sha?200:404,json:async()=>({sha}),headers:{get:()=>null}};
  }
 };
 context.window=context;
 vm.runInNewContext(fs.readFileSync('assets/photos/github.js','utf8'),context);
 return {api:context.WarehousePhotoGit,rows,writes,record};
}

test('图片已上传但响应丢失，续传核对哈希且不重复写入',async()=>{
 const d=setup();await assert.rejects(d.api.upload([d.record]),/response lost/);
 assert.equal(await d.api.pending([d.record]),true);
 await d.api.upload([d.record]);
 assert.equal(d.writes.length,2); // 原图一次、缩略图一次。
 assert.equal(await d.api.pending([d.record]),false);
 await d.api.upload([d.record]);assert.equal(d.writes.length,2);
});

test('从其他设备下载的缩略图缓存不作为待上传原图',async()=>{
 const d=setup();d.rows.set(d.record.id,{id:d.record.id,record:d.record,thumbnail:new Blob(['thumb'])});
 assert.equal(await d.api.pending([d.record]),false);
 await d.api.upload([d.record]);assert.equal(d.writes.length,0);
});

test('不可读旧图给出照片定位且不发送任何上传，不丢货物关联',async()=>{
 const d=setup(),row=d.rows.get(d.record.id);row.full={arrayBuffer:async()=>{throw Object.assign(Error('The object can not be found here.'),{name:'NotFoundError'})}};
 await assert.rejects(d.api.upload([d.record]),error=>error.photoId==='photo'&&error.message.includes('第 1 张照片')&&error.message.includes('移除不可用旧图'));
 assert.equal(d.writes.length,0);assert.equal(d.rows.get('photo'),row);assert.equal(await d.api.pending([d.record]),true);
});
