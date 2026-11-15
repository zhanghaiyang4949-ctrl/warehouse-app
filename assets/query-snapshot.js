(function(root){
 'use strict';
 function encode(payload,gzip=root.pako?.gzip){
  if(typeof gzip!=='function')throw Error('查询压缩组件未加载，请刷新管理端后重试');
  const bytes=gzip(new TextEncoder().encode(JSON.stringify(payload)),{level:6});
  let text='';for(let offset=0;offset<bytes.length;offset+=32768)text+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  return btoa(text);
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={encode};else root.WarehouseQuerySnapshot={encode};
})(typeof window!=='undefined'?window:globalThis);
