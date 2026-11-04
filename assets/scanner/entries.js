(function(root){
'use strict';
const targets={
 palletInput:{mode:'single',title:'托盘号扫码'},
 inExpress:{mode:'single',title:'入库扫码'},findInput:{mode:'single',title:'快速找货扫码'},
 batchFindInput:{mode:'continuous',title:'批量找货扫码',batch:true},
 packOrdersV83:{mode:'single',append:true,title:'配货单号扫码'},
 blindSortInputW99:{mode:'single',title:'盲扫分堆扫码',protect:true},
 tableSortInputW99:{mode:'single',title:'指定分堆扫码',protect:true},
 dataSearchInput:{mode:'single',title:'数据整理扫码'}
};
function applyScan(id,input,text,hooks={}){
 const config=targets[id];if(!config||!text||!text.trim())return {accepted:false,message:'未识别到有效单号'};
 if(config.protect&&input.value.trim())return {accepted:false,message:'请先确认或清空原单号，再扫码'};
 const lines=String(input.value).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(config.batch&&lines.includes(text.trim()))return {accepted:false,message:'重复单号，未追加'};
 const repeated=lines.includes(text.trim());
 input.value=(config.append||config.mode==='continuous')?input.value+(input.value&&!/\n$/.test(input.value)?'\n':'')+text:text;
 if(typeof Event!=='undefined')input.dispatchEvent(new Event('input',{bubbles:true}));
 if(id==='packOrdersV83'&&hooks.count)hooks.count();
 if(id==='findInput'&&hooks.query)hooks.query();
 return {accepted:true,message:repeated&&config.mode==='continuous'?'重复单号已按原规则保留':'已填入单号'};
}
if(typeof module!=='undefined'&&module.exports){module.exports={targets,applyScan};return}
root.WarehouseScannerEntries={targets,applyScan};
function visible(el){return !!el&&el.isConnected&&el.getClientRects().length>0}
function install(){
 for(const [id,config] of Object.entries(targets)){
  const input=document.getElementById(id);if(!input)continue;
  let button=input.parentElement.querySelector('[data-v5-target="'+id+'"]');
  if(!button){
   button=document.createElement('button');button.type='button';button.className='gray v5-entry-button';button.textContent='扫码';button.dataset.v5Target=id;
   input.insertAdjacentElement('afterend',button);
  }
  button.onclick=()=>{
   if(config.protect&&input.value.trim()){root.toast('请先确认或清空原单号，再扫码');return}
   root.V5Scanner.openScanner({mode:config.mode,title:config.title,batch:!!config.batch,
    isCurrent:()=>visible(input),
    onResult:result=>{
     if(!visible(input))return {accepted:false,message:'原页面已切换'};
     return applyScan(id,input,result.text,{query:()=>root.findExpress(),count:()=>root.updatePackOrderCountV83()});
    }});
  };
 }
 // Observe page and tab visibility without changing any existing business function.
 new MutationObserver(()=>{if(root.V5Scanner.isOpen()&&!root.V5Scanner.isCurrent())root.V5Scanner.closeScanner()}).observe(document.querySelector('.wrap')||document.body,{subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
 document.addEventListener('click',e=>{if(e.target.closest('.warehouse-blank-button'))root.V5Scanner.closeScanner()},true);
 document.addEventListener('keydown',e=>{
  if(!root.V5Scanner.isOpen())return;
  if(e.key==='Escape')root.V5Scanner.closeScanner();
  if(e.key==='Tab'){
   const buttons=[...document.querySelectorAll('.v5-scanner-layer button')].filter(x=>!x.disabled&&x.getClientRects().length);
   const first=buttons[0],last=buttons[buttons.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)root.V5Scanner.closeScanner()});
 new MutationObserver(()=>{if(root.V5Scanner.isOpen()&&!root.V5Scanner.isCurrent())root.V5Scanner.closeScanner()}).observe(document.body,{childList:true});
 window.addEventListener('popstate',()=>root.V5Scanner.closeScanner());
 window.addEventListener('pagehide',()=>root.V5Scanner.closeScanner());
 window.addEventListener('beforeunload',()=>root.V5Scanner.closeScanner());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(typeof window!=='undefined'?window:globalThis);
