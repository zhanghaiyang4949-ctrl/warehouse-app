(function(root){
 'use strict';
 function format(value){
  const raw=String(value??'').trim();
  if(!/^[0-9]+$/.test(raw))return raw;
  const groups=[];for(let end=raw.length;end>0;end-=4)groups.unshift(raw.slice(Math.max(0,end-4),end));
  return groups.join('-');
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={format};else root.WarehouseTrackingDisplay={format};
})(typeof window!=='undefined'?window:globalThis);
