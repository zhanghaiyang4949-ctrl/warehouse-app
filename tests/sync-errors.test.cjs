const test=require('node:test'),assert=require('node:assert/strict');
const {createGuard}=require('./offline-current.cjs');
for(const field of ['snapshot','blobHash','saveMeta','put','commit'])test('同步错误标出阶段且保留本机数据：'+field,async()=>{
 let meta=null,writes=0,fail=false;const local={items:[{id:1,express:'123'}]};
 const o={key:()=> 'x',db:()=>local,hash:async s=>s,blobHash:async()=> 'uploaded',loadMeta:async()=>meta,saveMeta:async(k,v)=>{meta=v},snapshot:async()=>{},remote:async()=>({sha:'old',db:structuredClone(local)}),pack:d=>JSON.stringify({db:d}),put:async()=>{writes++;return {sha:'uploaded'}},commit:async()=>{},exportedHash:()=>''};
 const original=o[field];o[field]=async(...args)=>{if(fail)throw Object.assign(new Error('The object can not be found here.'),{name:'NotFoundError',status:field==='put'?401:undefined});return original(...args)};
 const guard=createGuard(o);await guard.inspect();const plan=await guard.prepare();fail=true;
 await assert.rejects(guard.confirm(plan),e=>e.syncStage&&e.message.includes('NotFoundError')&&(field!=='put'||e.status===401));
 assert.equal(local.items.length,1);if(['snapshot','blobHash','saveMeta'].includes(field))assert.equal(writes,0);
});
