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

test('all photo entries use existing fill rules and close on navigation',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const fields={},events={},photos=[],live=[];let queries=0,counts=0,closes=0;
 const config=require('../assets/scanner/entries.js').targets;
 for(const id of Object.keys(config)){
  const buttons=[];const parent={querySelector(selector){return buttons.find(b=>selector.includes('data-v6-photo-target')?b.dataset.v6PhotoTarget===id:b.dataset.v5Target===id)||null}};
  fields[id]={value:'',isConnected:true,parentElement:parent,getClientRects:()=>[{}],dispatchEvent(){},insertAdjacentElement(_,b){buttons.push(b);b.insertAdjacentElement=(_,n)=>buttons.push(n)},buttons};
 }
 const document={readyState:'complete',body:{},getElementById:id=>fields[id],createElement:()=>({dataset:{}}),querySelector:()=>null,addEventListener:(name,fn)=>events[name]=fn};
 const win={document,Event,MutationObserver:class{observe(){}},WarehouseV6Photos:{open:options=>photos.push(options),close:()=>closes++,isOpen:()=>false},V5Scanner:{openScanner:options=>live.push(options),closeScanner(){},isOpen:()=>false},findExpress:()=>queries++,updatePackOrderCountV83:()=>counts++,toast(){},addEventListener:(name,fn)=>events[name]=fn};win.window=win;
 vm.runInNewContext(fs.readFileSync('assets/scanner/entries.js','utf8'),win);
 for(const [id,input] of Object.entries(fields)){
  assert.equal(input.buttons.length,2);assert.equal(input.buttons[1].textContent,'照片');input.buttons[1].onclick();const options=photos.at(-1);assert.equal(input.value,'');options.onResult({text:'001-ABC'});assert.equal(input.value,'001-ABC');
  input.value='';input.buttons[0].onclick();assert.equal(live.at(-1).onResult,options.onResult);
 }
 assert.equal(queries,1);assert.equal(counts,1);fields.blindSortInputW99.value='OLD';const before=photos.length;fields.blindSortInputW99.buttons[1].onclick();assert.equal(photos.length,before);
 events.pagehide();assert.ok(closes>0);
});
