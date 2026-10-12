(function(root){
 'use strict';
 function parseCsv(text){
  text=String(text||'').replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
   if(c==='"'){if(field||closed)throw Error('CSV 引号位置错误');quoted=true}else if(c===','||c==='\n'){row.push(field);field='';closed=false;if(c==='\n'){rows.push(row);row=[]}}else{if(closed)throw Error('CSV 引号结束后存在多余字符');field+=c}}
  if(quoted)throw Error('CSV 引号未闭合');if(field||row.length||closed){row.push(field);rows.push(row)}return rows;
 }
 const columns={express:'快递单号',customer:'客户名称',date:'入库日期',pallet:'托盘号',status:'状态',deletedAt:'删除日期',inTime:'实际入库时间',inboundNote:'入库备注',outTime:'出库时间',source:'出库来源'};
 function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
 function validateItem(x){const errors=[];for(const f of Object.keys(columns)){if(typeof x[f]!=='string')errors.push(f+' 必须为文本');else if(x[f].length>(f==='inboundNote'?500:200))errors.push(columns[f]+' 过长')}
  if(!x.express||!x.pallet)errors.push('单号和托盘号不能为空');if(!validDate(x.date))errors.push('入库日期无效');if(!['在库','已出库','已删除'].includes(x.status))errors.push('状态无效');if(x.deleted!==(x.status==='已删除'))errors.push('删除状态不一致');
  for(const f of ['inTime','outTime','deletedAt'])if(x[f]&&!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(x[f]))errors.push(columns[f]+' 时间格式无效');
  return errors;
 }
 function normalizeImport(text){const result={items:[],errors:[],warnings:[],counts:{total:0,stock:0,outbound:0,deleted:0}};let rows;try{rows=parseCsv(text)}catch(e){result.errors.push(e.message);return result}
  if(!rows.length){result.errors.push('CSV 为空');return result}const header=rows.shift().map(x=>x.trim());if(new Set(header).size!==header.length)result.errors.push('CSV 表头重复');for(const name of ['快递单号','客户名称','入库日期','托盘号','状态'])if(!header.includes(name))result.errors.push('缺少列：'+name);if(result.errors.length)return result;
  const seen=new Set();rows.forEach((row,index)=>{if(row.every(x=>!x.trim()))return;const line=index+2;if(row.length!==header.length){result.errors.push('第 '+line+' 行列数不一致');return}const item={};for(const [key,name]of Object.entries(columns)){const col=header.indexOf(name);item[key]=col<0?'':row[col].trim()}item.deleted=item.status==='已删除';
   const errors=validateItem(item);const identity=JSON.stringify([item.express,item.customer,item.date]);if(!item.deleted&&item.status==='在库'){if(seen.has(identity))errors.push('在库单号、客户和日期重复');seen.add(identity)}for(const e of errors)result.errors.push('第 '+line+' 行：'+e);
   if(item.deleted&&!item.deletedAt)result.warnings.push('第 '+line+' 行缺少删除时间，将保留为空');if(!item.inTime)result.warnings.push('第 '+line+' 行缺少实际入库时间，将保留为空');if(item.status==='已出库'&&!item.outTime)result.warnings.push('第 '+line+' 行缺少出库时间，将保留为空');
   result.items.push(item);result.counts.total++;if(item.deleted)result.counts.deleted++;else if(item.status==='已出库')result.counts.outbound++;else result.counts.stock++;
  });if(!result.items.length)result.errors.push('没有可导入的数据行');return result;
 }
 const api={parseCsv,normalizeImport,validateItem,validDate};if(typeof module!=='undefined')module.exports=api;else root.WarehouseCsv=api;
})(globalThis);
