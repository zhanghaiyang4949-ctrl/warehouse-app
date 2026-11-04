const {test}=require('node:test');const assert=require('node:assert/strict');
const {applyScan,targets}=require('../assets/scanner/entries.js');
function field(value=''){return {value,dispatchEvent(){this.changed=true}}}
test('六入口及两个分堆模式明确',()=>{assert.equal(Object.keys(targets).length,8);assert.equal(targets.packOrdersV83.mode,'single');assert.equal(targets.blindSortInputW99.mode,'single')});
test('入库保留前导零与合法字符，不触发业务提交',()=>{let n=0;const e=field();assert.equal(applyScan('inExpress',e,'001-ABC',{query(){n++}}).accepted,true);assert.equal(e.value,'001-ABC');assert.equal(n,0)});
test('快速查询仅调用现有查询',()=>{let n=0;const e=field();applyScan('findInput',e,'0012',{query(){n++}});assert.equal(n,1);assert.equal(e.value,'0012')});
test('批量完整单号去重，保留同尾号不同全号与原顺序',()=>{const e=field('00001234');assert.equal(applyScan('batchFindInput',e,'00001234').accepted,false);applyScan('batchFindInput',e,'99991234');assert.equal(e.value,'00001234\n99991234')});
test('配单保留重复与顺序，只更新计数',()=>{const e=field('ABC');let n=0;applyScan('packOrdersV83',e,'ABC',{count(){n++}});assert.equal(e.value,'ABC\nABC');assert.equal(n,1)});
for(const id of ['blindSortInputW99','tableSortInputW99'])test(id+'保护未处理输入，不触发分堆',()=>{const e=field('OLD');assert.equal(applyScan(id,e,'NEW').accepted,false);assert.equal(e.value,'OLD');e.value='';applyScan(id,e,'NEW');assert.equal(e.value,'NEW')});
test('数据整理只填单号',()=>{const e=field();applyScan('dataSearchInput',e,'000A');assert.equal(e.value,'000A')});
test('拒绝空白但不改写合法字符',()=>{const e=field('old');assert.equal(applyScan('inExpress',e,' ').accepted,false);assert.equal(e.value,'old')});

test('配单单次扫码仍追加、不覆盖已有单号',()=>{const e=field('001');applyScan('packOrdersV83',e,'002');assert.equal(e.value,'001\n002');assert.equal(targets.packOrdersV83.mode,'single')});

test('托盘扫码只填托盘号并触发输入更新',()=>{const e=field();assert.equal(targets.palletInput.mode,'single');assert.equal(applyScan('palletInput',e,'A111').accepted,true);assert.equal(e.value,'A111');assert.equal(e.changed,true)});
