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
  WarehousePhotoStore:{scope,blobSha:async blob=>await blob.text(),cache:{get:async id=>structuredClone(rows.get(id)),put:async row=>rows.set(row.id,structuredClone(row))}},
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
