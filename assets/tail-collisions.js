(function(root){
 'use strict';
 function normalize(value){return String(value||'').trim().replace(/[\s\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g,'').toUpperCase();}
 function stock(x){return !!x&&!x.deleted&&!x._historyW107&&(!x.status||x.status==='在库');}
 function build(items){const groups=new Map();for(const x of items||[]){if(!stock(x))continue;const full=normalize(x.express),pallet=String(x.pallet||'').trim().toUpperCase();if(full.length<4||!pallet)continue;const key=JSON.stringify([pallet,full.slice(-4)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);}return groups;}
 function info(groups,x){if(!stock(x))return null;const full=normalize(x.express),rows=groups.get(JSON.stringify([String(x.pallet||'').trim().toUpperCase(),full.slice(-4)]))||[];if(rows.length<2)return null;const values=[...new Set(rows.map(row=>normalize(row.express)))].sort();return {tail:full.slice(-4),count:rows.length,color:values.indexOf(full)%4};}
 const api={normalize,stock,build,info};if(typeof module==='object'&&module.exports)module.exports=api;else root.WarehouseTailCollisions=api;
})(typeof window==='undefined'?globalThis:window);
