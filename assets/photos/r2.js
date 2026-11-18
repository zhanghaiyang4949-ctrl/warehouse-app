(function(root){
 'use strict';
 const key='warehousePhotoProviderV1';let checked=null;
 function inventoryScope(){const c=getGitHubConfigV44();return JSON.stringify([c.owner,c.repo,c.branch]);}
 function config(){let value={};try{value=JSON.parse(localStorage.getItem(key)||'{}');}catch(_){}return value.scope===inventoryScope()?value:{provider:'github'};}
 async function call(action,args={}){if(!root.WarehouseQueryAccessTransport?.call)throw Error('请先配置查询服务并登录管理连接');return root.WarehouseQueryAccessTransport.call(action,args);}
 async function connect(){checked=null;const info=await call('adminR2Info');if(!info.enabled||!info.bucket)throw Error('R2尚未配置，请在服务端配置私有存储桶');checked={bucket:info.bucket,scope:inventoryScope()};return info;}
 function select(provider){if(!['github','r2'].includes(provider))throw Error('照片存储方式无效');if(provider==='r2'&&(!checked||checked.scope!==inventoryScope()))throw Error('请先检查R2连接');localStorage.setItem(key,JSON.stringify({provider,scope:inventoryScope(),...(provider==='r2'?{bucket:checked.bucket}:{})}));}
 function draftStorage(paths){const c=config();if(c.provider!=='r2')return null;if(!c.bucket)throw Error('R2存储桶未配置');return {provider:'r2',bucket:c.bucket,...paths};}
 function identity(record,variant){return JSON.stringify([record.storage?.provider,record.storage?.bucket,record.storage?.[variant],variant==='full'?record.hash:record.thumbHash]);}
 function complete(photo,variant){return photo.record.storage?.provider==='r2'&&photo.uploaded?.[variant]===identity(photo.record,variant);}
 function cancelled(signal){if(signal?.aborted)throw Object.assign(Error('已暂停照片上传，本机照片已保留'),{cancelled:true});}
 async function transfer(url,options,signal){cancelled(signal);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});try{return await fetch(url,{...options,signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});}catch(error){cancelled(signal);throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
 async function uploadFile(photo,variant,signal){if(complete(photo,variant))return;const record=photo.record;if(record.storage?.provider!=='r2'||!record.storage.bucket)throw Error('R2照片存储信息无效');if(!photo[variant])throw Error('本机缺少待上传的照片');
  for(let attempt=0;attempt<2;attempt++){cancelled(signal);const ticket=await call('adminR2Upload',{record}),file=ticket.files?.[variant];cancelled(signal);if(!file)throw Error('R2上传许可无效');if(!file.exists){if(!file.url)throw Error('R2上传地址缺失');const result=await transfer(file.url,{method:'PUT',headers:file.headers||{},body:photo[variant]},signal);if(result.status===403&&attempt===0)continue;if(!result.ok&&result.status!==412)throw Object.assign(Error('R2照片上传失败（'+result.status+'）'),{status:result.status});}
   const verified=await call('adminR2Verify',{record,variant});cancelled(signal);if(verified.verified!==true)throw Error('R2照片内容校验失败');photo.uploaded={...photo.uploaded,[variant]:identity(record,variant)};await root.WarehousePhotoStore.cache.put(photo);return;
  }throw Error('R2上传许可已过期，请重试');
 }
 async function read(record,variant){const ticket=await call('adminR2Read',{record,variant});if(!ticket.url)throw Error('R2照片读取许可无效');const response=await transfer(ticket.url,{});if(!response.ok)throw Error('照片尚未上传或当前账号无读取权限');return new Blob([await response.arrayBuffer()],{type:'image/jpeg'});}
 root.WarehousePhotoR2={config,connect,select,draftStorage,complete,uploadFile,read};
})(typeof window!=='undefined'?window:globalThis);
