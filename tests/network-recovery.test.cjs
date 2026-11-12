const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createGuard } = require('./offline-current.cjs');
const clone = structuredClone;
const hash = async text => crypto.createHash('sha256').update(text).digest('hex');
function device() {
 let local = { items: [{ id: 1, express: '11111111', pallet: 'A' }] };
 let meta = null;
 let server = { sha: 'initial', db: clone(local) };
 let mode = 'normal';
 let writes = 0;
 const options = {
  key: () => 'repo', loadMeta: async () => clone(meta), saveMeta: async (key, value) => { meta = clone(value); },
  hash, blobHash: hash, db: () => local, snapshot: async () => {}, remote: async () => clone(server),
  pack: db => JSON.stringify({ db }), commit: async (db, baseline) => { local = clone(db); meta = clone(baseline); },
  exportedHash: () => '',
  put: async (sha, payload) => {
   writes++;
   if (mode === 'before') throw TypeError('Failed to fetch');
   server = { sha: await hash(payload), db: JSON.parse(payload).db };
   if (mode === 'after') throw TypeError('response lost');
   return { sha: server.sha };
  }
 };
 return { guard: createGuard(options), local: () => local, meta: () => meta, writes: () => writes, mode: value => { mode = value; }, changeRemote: () => { server.sha = 'other'; server.db.items[0].pallet = 'B'; } };
}
test('请求未到服务器，恢复检查解锁且本机修改可重新上传', async () => {
 const d = device(); await d.guard.inspect(); await d.guard.run(() => { d.local().items.push({ id: 2, express: '22222222' }); });
 const plan = await d.guard.prepare(); d.mode('before'); await assert.rejects(d.guard.confirm(plan));
 await d.guard.inspect(); assert.equal(d.meta().pending, undefined); assert.equal(d.local().items.length, 2);
 d.mode('normal'); await d.guard.confirm(await d.guard.prepare()); assert.equal(d.meta().pending, undefined);
});
test('服务器已接收但响应丢失，恢复确认成功且不重复上传', async () => {
 const d = device(); await d.guard.inspect(); await d.guard.run(() => { d.local().items.push({ id: 2 }); });
 d.mode('after'); await assert.rejects(d.guard.confirm(await d.guard.prepare())); await d.guard.inspect();
 assert.equal(d.meta().pending, undefined); assert.equal(d.local().items.length, 2); assert.equal(d.writes(), 1);
});
test('中断后另一设备更新，保留本机并允许重新预览合并', async () => {
 const d = device(); await d.guard.inspect(); await d.guard.run(() => { d.local().items.push({ id: 2 }); });
 d.mode('before'); await assert.rejects(d.guard.confirm(await d.guard.prepare())); d.changeRemote();
 const plan = await d.guard.prepare(); assert.equal(d.meta().pending, undefined); assert.equal(d.local().items.length, 2);
 assert.equal(plan.db.items[0].pallet, 'B'); assert.equal(plan.db.items.length, 2);
});
const {createRecovery} = require('../assets/sync-recovery');
test('自动重试只在服务器版本与本机输入仍一致时发送', async () => {
 const d = device(); await d.guard.inspect(); await d.guard.run(() => { d.local().items.push({id:2}); });
 const originalConfirm = d.guard.confirm; let attempts = 0;
 d.guard.confirm = async (...args) => { attempts++; d.mode(attempts === 1 ? 'before' : 'normal'); return originalConfirm(...args); };
 const recovery = createRecovery({guard:d.guard, key:()=> 'repo', delayMs:0, schedule:false});
 await recovery.confirm(await d.guard.prepare()); assert.equal(d.writes(),2); assert.equal(recovery.hasPending(),false);
});
test('自动核实已接收请求，不重复发送', async () => {
 const d = device(); await d.guard.inspect(); d.mode('after');
 const recovery = createRecovery({guard:d.guard, key:()=> 'repo', delayMs:0, schedule:false});
 await recovery.confirm(await d.guard.prepare()); assert.equal(d.writes(),1); assert.equal(recovery.hasPending(),false);
});
