const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');const tools=require('../assets/transfer-warnings');
const a={id:1,express:'11111234',pallet:'A',status:'在库'},b={id:2,express:'22221234',pallet:'B',status:'在库'};
test('transfer checks destination and incoming-incoming suffix collisions, excludes self/deleted/outbound',()=>{
 assert.equal(tools.collisions([a,b],[a],'B').length,1);assert.equal(tools.collisions([a,b],[b],'B').length,0);assert.equal(tools.collisions([a,{...b,deleted:true}],[a],'B').length,0);assert.equal(tools.collisions([a,{...b,status:'已出库'}],[a],'B').length,0);assert.equal(tools.collisions([a,b],[a,b],'C')[0].items.length,2);
});
function fn(name){const source=fs.readFileSync('index.html','utf8');const begin=source.indexOf('function '+name+'(');let at=source.indexOf('{',begin),depth=1,end=at+1;for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return (name==='executeBulkPalletMoveV65'?'async ':'')+source.slice(begin,end);}
test('both real transfer execution paths cancel before mutation, selection clearing or saving',async()=>{
 for(const name of ['executeBulkPalletMoveV65','executeSelectedTransfer']){const rows=structuredClone([a,b]);let saved=0;const context={window:{_pendingTransfer:{ids:[1],from:'A',to:'B'},WarehouseTransferWarnings:{confirm:()=>false}},db:{items:rows},save:()=>saved++,selectedPalletIds:new Set([1])};vm.createContext(context);vm.runInContext(fn(name),context);await vm.runInContext(name==='executeBulkPalletMoveV65'?'executeBulkPalletMoveV65([1],"B")':'executeSelectedTransfer()',context);assert.equal(rows[0].pallet,'A');assert.equal(saved,0);assert.equal(context.selectedPalletIds.size,1);}
});
