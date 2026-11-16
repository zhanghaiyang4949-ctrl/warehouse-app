(function(root){
 'use strict';
 function collisions(all,moving,target){
  const tools=root.WarehouseTailCollisions||require('./tail-collisions');
  const pallet=String(target||'').trim().toUpperCase();
  const incoming=moving.filter(x=>tools.stock(x)&&String(x.pallet||'').trim().toUpperCase()!==pallet);
  const ids=new Set(incoming.map(x=>String(x.id))),groups=new Map();
  for(const x of all){if(!tools.stock(x)||ids.has(String(x.id))||String(x.pallet||'').trim().toUpperCase()!==pallet)continue;const tail=tools.normalize(x.express).slice(-4);if(tail.length<4)continue;if(!groups.has(tail))groups.set(tail,[]);groups.get(tail).push(x);}
  const touched=new Set();for(const x of incoming){const tail=tools.normalize(x.express).slice(-4);if(tail.length<4)continue;touched.add(tail);if(!groups.has(tail))groups.set(tail,[]);groups.get(tail).push(x);}
  return [...touched].filter(tail=>groups.get(tail).length>1).map(tail=>({tail,items:groups.get(tail)}));
 }
 function confirmMove(all,moving,target){const hits=collisions(all,moving,target);if(!hits.length)return true;return root.confirm('目标托盘 '+target+' 转移后存在相同后四位的货物：\n'+hits.slice(0,8).map(hit=>'尾号 '+hit.tail+'：'+hit.items.slice(0,6).map(x=>String(x.express)).join('、')).join('\n')+'\n请核对完整单号，是否继续转移？');}
 const api={collisions,confirm:confirmMove};root.WarehouseTransferWarnings=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
