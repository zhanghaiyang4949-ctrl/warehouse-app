'use strict';
const {hash}=require('./service');
function createSource(env,fetcher=fetch,now=Date.now) {
 const owner=env.QUERY_GITHUB_OWNER,repo=env.QUERY_GITHUB_REPO,branch=env.QUERY_GITHUB_BRANCH||'main',path=env.QUERY_GITHUB_PATH||'query-secure/query-data.json';
 const token=env.QUERY_GITHUB_TOKEN;
 if(!owner||!repo||!token)throw Error('请配置私有查询数据仓库及只读Token');
 const base='https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo);
 let checkedAt=0,cached=null,cachedAt=0,loading,checking;
 const versions=new Map();
 function timeoutError(){return Object.assign(Error('GitHub连接暂时不稳定，读取已重试，请稍后重新登录或查询'),{status:503,code:'SOURCE_TIMEOUT',transient:true});}
 async function request(url,raw=false,max=20*1024*1024,deadline=Date.now()+18000) {
  for(let attempt=0;attempt<2;attempt++){
   const remaining=deadline-Date.now();if(remaining<=0)throw timeoutError();
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(8000,remaining));
   try {
    const r=await fetcher(url,{signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'warehouse-query-service'},redirect:'error'});
    if(!r.ok){await r.body?.cancel?.();throw Object.assign(Error(r.status===404?'查询数据或图片尚未同步，请联系管理员':'GitHub读取暂不可用，请稍后重试'),{status:503,code:'SOURCE_UNAVAILABLE',transient:r.status>=500});}
    const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>max){controller.abort();throw Object.assign(Error('文件超过查询服务大小限制'),{status:503,code:'SOURCE_TOO_LARGE'});}chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
   }catch(error){
    const network=controller.signal.aborted||error.name==='AbortError'||error.name==='TimeoutError'||error instanceof TypeError;
    if(!network&&!error.transient)throw error;
    if(attempt===1||Date.now()+300>=deadline)throw network?timeoutError():error;
   }finally{clearTimeout(timer);}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
 }
 async function privateRepo(deadline) {
  if(checkedAt&&now()-checkedAt<300000)return;
  if(checking)return checking;
  checking=(async()=>{if(!JSON.parse((await request(base,false,20*1024*1024,deadline)).toString()).private)throw Object.assign(Error('查询数据必须放在私有GitHub仓库，已暂停读取'),{code:'PRIVATE_REPO_REQUIRED',status:503});checkedAt=now();})();
  try{return await checking;}finally{checking=null;}
 }
 function fileUrl(p){return base+'/contents/'+p.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(branch);}
 async function load({revision,deadline=Date.now()+18000}={}) {
  await privateRepo(deadline);
  for(const [key,value]of versions)if(value.expiresAt<=now())versions.delete(key);
  if(revision&&versions.has(revision))return versions.get(revision).snapshot;
  if(cached&&now()-cachedAt<5000)return cached;if(loading)return loading;
  loading=(async()=>{
   const bytes=await request(fileUrl(path),true,20*1024*1024,deadline),data=JSON.parse(bytes.toString());
   if(data.version!==3||!Array.isArray(data.items)||data.items.some(x=>x.id===undefined||x.id===null)||!/^[a-f0-9]{64}$/.test(data.passwordHash||'')||!Array.isArray(data.photoAttachments||[]))throw Error('查询快照格式无效，请在管理端重新同步');
   cached={...data,revision:hash(bytes)};cachedAt=now();versions.set(cached.revision,{snapshot:cached,expiresAt:now()+120000});
   if(versions.size>3)versions.delete(versions.keys().next().value);return cached;
  })();try{return await loading;}finally{loading=null;}
 }
 async function photo(record,variant,{deadline=Date.now()+18000}={}) {
  await privateRepo(deadline);const github=record.github,p=github?.[variant];
  if(!github||github.owner!==owner||github.repo!==repo||github.branch!==branch||!/^warehouse-images\/[0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}(?:-thumb)?\.jpg$/.test(p||''))throw Object.assign(Error('图片来源与私有仓库不一致'),{code:'PHOTO_SOURCE_INVALID',status:403});
  const bytes=await request(fileUrl(p),true,4*1024*1024,deadline);
  if(bytes[0]!==255||bytes[1]!==216)throw Error('图片不是有效JPEG文件');return bytes.toString('base64');
 }
 return {load,photo,info:async()=>{await privateRepo();return {owner,repo,branch,path};}};
}
module.exports={createSource};
