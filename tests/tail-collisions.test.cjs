const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tools=require('../assets/tail-collisions');
test('same-pallet in-stock suffix collisions use full inventory, exclude short/deleted/outbound and distinguish complete numbers',()=>{
 const rows=[{id:1,express:'1111-1234',pallet:'A-1'},{id:2,express:'22221234',pallet:'A-1'},{id:3,express:'33331234',pallet:'B-1'},{id:4,express:'44441234',pallet:'A-1',deleted:true},{id:5,express:'55551234',pallet:'A-1',status:'已出库'},{id:6,express:'12',pallet:'A-1'}],groups=tools.build(rows);
 const a=tools.info(groups,rows[0]),b=tools.info(groups,rows[1]);assert.equal(a.count,2);assert.notEqual(a.color,b.color);assert.equal(tools.info(groups,rows[2]),null);assert.equal(tools.info(groups,rows[3]),null);assert.equal(tools.info(groups,rows[5]),null);
});
test('cancelled shelving collision exits before preparing photos or mutating inventory',()=>{
 const source=fs.readFileSync('index.html','utf8'),start=source.indexOf(' const collisionTail='),end=source.indexOf(' const inNowV86=',start);assert.ok(start>0&&end>start);
 const rows=[{express:'88881234',pallet:'A-1'}];let prompts=0,continued=false;const context={v:'99991234',p:'A-1',db:{items:rows},normalizeStoredTrackingW100:tools.normalize,formatTrackingDisplayW96:String,confirm:()=>{prompts++;return false;},continueWrite:()=>continued=true};
 vm.runInNewContext('(function(){'+source.slice(start,end)+'continueWrite();})()',context);assert.equal(prompts,1);assert.equal(continued,false);assert.equal(rows.length,1);
 context.confirm=()=>true;vm.runInNewContext('(function(){'+source.slice(start,end)+'continueWrite();})()',context);assert.equal(continued,true);
});
test('both clients share identical collision semantics',()=>assert.equal(fs.readFileSync('assets/tail-collisions.js','utf8'),fs.readFileSync('../warehouse-query/assets/tail-collisions.js','utf8')));
