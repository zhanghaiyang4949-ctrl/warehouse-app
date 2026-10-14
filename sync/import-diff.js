(function(root){
 const identity=typeof module!=='undefined'?require('./identity'):root.WarehouseIdentity;
 const fields=['express','customer','date','pallet','status','deletedAt','inTime','inboundNote','outTime','source'];
 function values(x){const v={};for(const f of fields)v[f]=String(f==='status'?(x.deleted?'已删除':x.status||'在库'):f==='source'?x.source||x.outboundSource||'':x[f]||'').trim();return v}
 function compare(incoming,current,mode='merge'){
  const groups=new Map(),seen=new Set(),counts={add:0,same:0,update:0,ambiguous:0,remove:0},ops=[];
  for(const x of current){const k=identity.businessIdentity(x);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
  incoming.forEach((x,index)=>{const key=identity.businessIdentity(x);if(seen.has(key))throw Error('文件中存在同一件货物的重复行：'+x.express);seen.add(key);const matches=groups.get(key)||[];if(matches.length>1){counts.ambiguous++;ops.push({key,kind:'ambiguous',incoming:x,matches:matches.map(y=>({id:y.id,...values(y)}))});return}const before=matches[0];if(!before){counts.add++;ops.push({key,kind:'add',incoming:x,index});return}const a=values(before),b=values(x),changed=fields.filter(f=>a[f]!==b[f]);if(!changed.length){counts.same++;return}counts.update++;ops.push({key,kind:'update',before,incoming:x,changed,index})});
  if(mode==='replace')for(const x of current)if(!seen.has(identity.businessIdentity(x))){counts.remove++;ops.push({key:identity.businessIdentity(x),kind:'remove',before:x})}
  return {counts,ops};
 }
 const api={compare,values,fields};if(typeof module!=='undefined')module.exports=api;else root.WarehouseImportDiff=api;
})(globalThis);
