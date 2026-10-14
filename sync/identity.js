(function(root){
 const normalize=value=>String(value||'').trim().replace(/[\s\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g,'').toUpperCase();
 function businessIdentity(item){const express=normalize(item.express);return express.length>=8?JSON.stringify(['long',express]):JSON.stringify(['short',express,String(item.date||'').trim(),String(item.customer||'').trim()])}
 const api={normalize,businessIdentity};if(typeof module!=='undefined')module.exports=api;else root.WarehouseIdentity=api;
})(globalThis);
