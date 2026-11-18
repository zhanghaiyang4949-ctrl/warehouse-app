const test=require('node:test'),assert=require('node:assert/strict');
const {encodePhoto,decodePhoto,readBlobBytes}=require('../assets/photos/store.js');
test('照片落库只保存独立字节，重新打开后完整重建两张图',async()=>{
 const row={id:'a',record:{id:'a'},originLocal:true,uploaded:{full:'sha'},full:new Blob(['full'],{type:'image/jpeg'}),thumbnail:new Blob(['thumb'],{type:'image/jpeg'})};
 const saved=await encodePhoto(row);assert.equal(saved.full,undefined);assert.equal(saved.thumbnail,undefined);assert.ok(saved.fullBytes instanceof ArrayBuffer);assert.ok(saved.thumbnailBytes instanceof ArrayBuffer);
 const reopened=decodePhoto(structuredClone(saved));assert.equal(await reopened.full.text(),'full');assert.equal(await reopened.thumbnail.text(),'thumb');assert.equal(reopened.uploaded.full,'sha');assert.ok(row.full instanceof Blob);
});
test('兼容旧缓存，第一次读取失败时可用备用读取器救回',async()=>{
 const broken={arrayBuffer:async()=>{throw Object.assign(Error('missing'),{name:'NotFoundError'})}};
 const bytes=await readBlobBytes(broken,async()=>new TextEncoder().encode('rescued').buffer);assert.equal(new TextDecoder().decode(bytes),'rescued');
});
test('照片内容彻底不可读时保留旧记录，不写空图',async()=>{
 const broken={arrayBuffer:async()=>{throw Object.assign(Error('missing'),{name:'NotFoundError'})}};
 const row={id:'x',full:broken,thumbnail:new Blob(['thumb'])};await assert.rejects(encodePhoto(row),/missing/);assert.equal(row.full,broken);assert.equal(row.fullBytes,undefined);
});
test('旧Blob记录仍能读取，新记录没有照片时不制造空照片',async()=>{
 const old={id:'old',full:new Blob(['old'])};assert.equal(decodePhoto(old).full,old.full);assert.equal(decodePhoto({id:'empty'}).full,undefined);
});
const {applyPhotoEdits}=require('../assets/photos/store.js');
test('用户确认保存后只软移除选中的图片，不改变货物或其他图片',()=>{
 const db={items:[{id:1}],photoAttachments:[{id:'bad',targetId:'1'},{id:'other',note:'keep'}]};
 const result=applyPhotoEdits(db,[{id:'new',targetId:'1'}],new Set(['bad']));
 assert.equal(result.find(x=>x.id==='bad').deleted,true);assert.equal(result.find(x=>x.id==='other').note,'keep');assert.ok(result.some(x=>x.id==='new'));assert.equal(db.photoAttachments[0].deleted,undefined);assert.equal(db.items.length,1);
});
