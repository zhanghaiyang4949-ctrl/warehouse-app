'use strict';
const crypto=require('node:crypto');
const MAX=4*1024*1024;
const error=(message,code='R2_UNAVAILABLE',status=503)=>Object.assign(Error(message),{code,status});
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest();
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function createR2(env,fetcher=fetch,now=Date.now){
 const fields=['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
 const values=fields.map(k=>env[k]||''),enabled=values.some(Boolean);
 const [account,bucket,access,secret]=values;
 function config(){if(!enabled)throw error('R2照片存储尚未配置','R2_DISABLED');if(!values.every(v=>typeof v==='string'&&v.trim()===v&&v)||! /^[a-f0-9]{32}$/.test(account)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)||!/^[a-f0-9]{32}$/i.test(access)||!/^[a-f0-9]{64}$/i.test(secret))throw error('R2服务端配置不完整或无效，请检查四项环境变量','R2_CONFIG_INVALID');}
 async function info(){if(!enabled)return {enabled:false,bucket:''};config();await request('HEAD',{key:''},{},async response=>{await response.body?.cancel?.();});return {enabled:true,bucket};}
 function validate(record,variant){
  config();const invalid=()=>{throw error('R2图片路径、哈希、大小或存储桶无效','R2_RECORD_INVALID',400);};
  if(!record||!['full','thumbnail'].includes(variant)||record.storage?.provider!=='r2'||record.storage.bucket!==bucket||!/^[a-f0-9]{64}$/.test(record.hash||'')||!/^[a-f0-9]{64}$/.test(record.thumbHash||''))invalid();
  const m=/^warehouse-images\/(\d{4})\/(\d{2})\/(\d{2})\/([a-f0-9]{2})\/([a-f0-9]{64})\.jpg$/.exec(record.storage.full||'');
  if(!m||m[5]!==record.hash||m[4]!==record.hash.slice(0,2)||record.storage.thumbnail!==record.storage.full.replace(/\.jpg$/,'-thumb.jpg'))invalid();
  const date=m[1]+'-'+m[2]+'-'+m[3],parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)invalid();
  for(const n of [record.bytes,record.thumbBytes])if(!Number.isSafeInteger(n)||n<4||n>MAX)invalid();
  return {key:record.storage[variant],hash:variant==='full'?record.hash:record.thumbHash,length:variant==='full'?record.bytes:record.thumbBytes};
 }
 function sign(method,key,headers={}){
  const host=account+'.r2.cloudflarestorage.com',path='/'+bucket+(key?'/'+key.split('/').map(encode).join('/'):'');
  const stamp=new Date(now()).toISOString().replace(/[:-]|\.\d{3}/g,''),day=stamp.slice(0,8),scope=day+'/auto/s3/aws4_request';
  const all={host,...headers},names=Object.keys(all).sort(),signed=names.join(';');
  const params={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':access+'/'+scope,'X-Amz-Date':stamp,'X-Amz-Expires':'120','X-Amz-SignedHeaders':signed};
  const query=Object.keys(params).sort().map(k=>encode(k)+'='+encode(params[k])).join('&');
  const canonical=[method,path,query,names.map(k=>k+':'+String(all[k]).trim()+'\n').join(''),signed,headers['x-amz-content-sha256']||'UNSIGNED-PAYLOAD'].join('\n');
  const keyDate=hmac('AWS4'+secret,day),keyRegion=hmac(keyDate,'auto'),keyService=hmac(keyRegion,'s3'),keySign=hmac(keyService,'aws4_request');
  const signature=hmac(keySign,'AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+digest(canonical)).toString('hex');
  return 'https://'+host+path+'?'+query+'&X-Amz-Signature='+signature;
 }
 async function request(method,file,{deadline=Date.now()+14000,missing=false}={},consume){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(14000,deadline-Date.now())));
  try{
   const response=await fetcher(sign(method,file.key),{method,redirect:'error',signal:controller.signal});
   if(missing&&response.status===404){await response.body?.cancel?.();return null;}
   if(!response.ok){await response.body?.cancel?.();throw error('R2照片读取或验证失败，请检查存储配置','R2_UNAVAILABLE');}
   return await consume(response,controller);
  }catch(e){if(e.code?.startsWith('R2_'))throw e;throw error('R2连接暂不可用，请稍后重试');}finally{clearTimeout(timer);}
 }
 async function checked(file,options={}){
  // HEAD/user metadata is not proof of payload integrity. Hash the bounded body too.
  return request('GET',file,options,async(response,controller)=>{
   const length=response.headers.get('content-length');if(length!==null&&Number(length)!==file.length){await response.body?.cancel?.();throw error('R2照片大小不匹配','R2_INTEGRITY_FAILED');}
   if(response.headers.get('content-type')?.split(';')[0].trim()!=='image/jpeg'){await response.body?.cancel?.();throw error('R2照片格式无效','R2_INTEGRITY_FAILED');}
   const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>MAX||total>file.length){controller.abort();throw error('R2照片超过大小限制','R2_INTEGRITY_FAILED');}chunks.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(chunks);if(total!==file.length||bytes[0]!==255||bytes[1]!==216||digest(bytes)!==file.hash)throw error('R2照片完整性验证失败','R2_INTEGRITY_FAILED');return bytes;
  });
 }
 async function head(file,options={}){
  return request('HEAD',file,options,async response=>{
   const valid=response.headers.get('content-length')===String(file.length)&&response.headers.get('content-type')?.split(';')[0].trim()==='image/jpeg'&&response.headers.get('x-amz-meta-sha256')===file.hash&&response.headers.get('x-amz-meta-bytes')===String(file.length);
   await response.body?.cancel?.();if(!valid)throw error('R2照片元数据验证失败','R2_INTEGRITY_FAILED');return true;
  });
 }
 async function upload(record){
  const variants=['full','thumbnail'],files={};const validated=variants.map(v=>validate(record,v));
  for(let i=0;i<variants.length;i++){
   const file=validated[i];const found=await head(file,{missing:true});
   if(found){await checked(file);files[variants[i]]={exists:true,url:null,headers:{}};continue;}
   // R2 lists SHA256 FULL_OBJECT checksums as unsupported. Bind the SigV4 payload
   // hash instead; conditional creation keeps a completed content-addressed key immutable.
   // https://developers.cloudflare.com/r2/api/s3/api/
   const headers={'content-type':'image/jpeg','x-amz-content-sha256':file.hash,'x-amz-meta-sha256':file.hash,'x-amz-meta-bytes':String(file.length),'if-none-match':'*'};
   // Fetch derives this forbidden header from the Blob. Signing it enforces the
   // declared size before R2 accepts the write; never ask browser code to set it.
   files[variants[i]]={exists:false,url:sign('PUT',file.key,{...headers,'content-length':String(file.length)}),headers};
  }
  return {files};
 }
 async function verify(record,variant){const file=validate(record,variant);await head(file);await checked(file);return {verified:true};}
 function read(record,variant){const file=validate(record,variant);return {url:sign('GET',file.key)};}
 async function photo(record,variant,options){return (await checked(validate(record,variant),options)).toString('base64');}
 return {info,upload,verify,read,photo};
}
module.exports={createR2};
