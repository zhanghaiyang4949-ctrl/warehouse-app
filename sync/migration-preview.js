(function(root){
 function migrationPreview(input,cloud=[]){
  const data=input?.data||input;if(!data||!Array.isArray(data.items))throw Error('备份中未找到 items 数组');
  const result={counts:{total:data.items.length,stock:0,outbound:0,deleted:0,packing:(data.packingHistory||[]).length,maps:(data.warehouseMaps||[]).length},duplicates:[],cloudConflicts:[],missingTimes:[],invalid:[]},seen=new Map();
  const identity=x=>JSON.stringify([String(x.express||'').trim(),String(x.customer||'').trim(),String(x.date||'').trim()]);
  const cloudIdentities=new Set(cloud.filter(x=>!x.deleted&&x.status!=='已出库').map(identity));
  data.items.forEach((x,i)=>{if(!x||typeof x!=='object'){result.invalid.push(i+1);return}
   if(x.deleted)result.counts.deleted++;else if(x.status==='已出库')result.counts.outbound++;else result.counts.stock++;
   if(!x.express||!x.pallet||!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date||'')))result.invalid.push(i+1);
   if(!(x.inTimeIso||x.inTime)||x.status==='已出库'&&!x.outTime||x.deleted&&!x.deletedAt)result.missingTimes.push(i+1);
   const k=identity(x);if(!x.deleted&&x.status!=='已出库'){if(seen.has(k))result.duplicates.push([seen.get(k),i+1]);else seen.set(k,i+1);if(cloudIdentities.has(k))result.cloudConflicts.push(i+1)}
  });return result;
 }
 if(typeof module!=='undefined')module.exports={migrationPreview};else root.migrationPreview=migrationPreview;
})(globalThis);
