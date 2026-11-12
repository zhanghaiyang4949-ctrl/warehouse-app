const test=require('node:test'),assert=require('node:assert/strict');
const {merge,normalize}=require('./offline-current.cjs');
const {paths,mergeRecords}=require('../assets/photos/store.js');
test('旧备份没有图片集合仍正常打开',()=>{const value=normalize({items:[]});assert.deepEqual(value.photoAttachments,[])});
test('两台设备分别增加照片引用可同时保留',()=>{const base={items:[]},local={items:[],photoAttachments:[{id:'a',targetType:'item',targetId:'1'}]},remote={items:[],photoAttachments:[{id:'b',targetType:'pallet',targetId:'A'}]};const result=merge(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.db.photoAttachments.length,2)});
test('同张照片备注两端冲突不能静默覆盖',()=>{const base={items:[],photoAttachments:[{id:'a',note:'original'}]},local=structuredClone(base),remote=structuredClone(base);local.photoAttachments[0].note='local';remote.photoAttachments[0].note='remote';assert.ok(merge(base,local,remote).conflicts.length)});
test('路径按日期与哈希分片，不使用原文件名',()=>{const value=paths('ab123',new Date('2026-11-12T00:00:00Z'));assert.equal(value.full,'warehouse-images/2026/11/12/ab/ab123.jpg');assert.ok(value.thumbnail.endsWith('-thumb.jpg'))});
test('重试添加同一照片关联保持唯一',()=>{const rows=mergeRecords({photoAttachments:[{id:'a'}]},[{id:'a'},{id:'b'}]);assert.deepEqual(rows.map(x=>x.id),['a','b'])});
