'use strict';
const crypto = require('node:crypto');
const hash = text => crypto.createHash('sha256').update(String(text)).digest('hex');
const fail = (message, code='ACCESS_DENIED', status=403) => Object.assign(Error(message), {code,status});
function equal(a,b) { return crypto.timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b))); }
function createService({repo,source,adminSecret,now=Date.now}) {
 if(!adminSecret||adminSecret.length<32)throw Error('请配置至少32位的查询管理密钥');
 const sessionKey=crypto.createHmac('sha256',adminSecret).update('warehouse-query-session-v1').digest();
 async function audit(tx,action,row,actor) {
  const at=new Date(now()).toISOString(),id=String(now()).padStart(13,'0')+'-'+crypto.randomUUID();
  await tx.put('audit',id,{id,at,action,actor,targetId:row.id,name:row.name,status:row.status});
 }
 async function rate(key,limit,period=60000) {
  const id=hash(key+':'+Math.floor(now()/period));
  await repo.transaction(async tx=>{
   const row=await tx.get('rates',id)||{count:0};
   if(row.count>=limit)throw fail('操作过于频繁，请稍后再试','RATE_LIMIT',429);
   await tx.put('rates',id,{count:row.count+1,expiresAt:new Date(now()+period*2)});
  });
 }
 function credentials(args) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(args.deviceId||'')||!/^[a-f0-9]{64}$/i.test(args.deviceSecret||''))throw fail('设备凭据无效，请重新打开查询页面');
  return {id:args.deviceId,proof:hash(args.deviceSecret)};
 }
 function publicDevice(row) {
  return {id:row.id,name:row.name,label:row.label,status:row.status,requestedAt:row.requestedAt,reviewedAt:row.reviewedAt||null,lastLoginAt:row.lastLoginAt||null};
 }
 function sign(row) {
  const body=Buffer.from(JSON.stringify({id:row.id,v:row.version,exp:now()+8*3600000})).toString('base64url');
  return body+'.'+crypto.createHmac('sha256',sessionKey).update(body).digest('base64url');
 }
 async function authorize(token) {
  const [body,signature,...extra]=String(token||'').split('.');
  if(!body||!signature||extra.length||!equal(signature,crypto.createHmac('sha256',sessionKey).update(body).digest('base64url')))throw fail('请重新登录');
  let claims;try{claims=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw fail('请重新登录');}
  if(!Number.isFinite(claims.exp)||claims.exp<=now())throw fail('登录已过期，请重新输入密码');
  const row=await repo.get('devices',claims.id);
  if(!row||row.status!=='approved'||row.version!==claims.v)throw fail('该设备尚未审核或授权已撤销');
  return row;
 }
 async function dispatch(action,args={},context={}) {
  const ip=hash(context.ip||'unavailable');
  if(action.startsWith('admin')) {
   await rate('admin:'+ip,60);
   if(!equal(context.adminKey||'',adminSecret))throw fail('管理密钥不正确');
   if(action==='adminInfo')return source.info();
   if(action==='adminList') {
    const page=await repo.list('devices',String(args.cursor||''),51);
    return {devices:page.slice(0,50).map(publicDevice),pendingTotal:await repo.countPending(),nextCursor:page.length>50?page[49].id:''};
   }
   if(action==='adminLogs') {
    const page=await repo.list('audit',String(args.cursor||''),51,'desc');
    return {logs:page.slice(0,50),nextCursor:page.length>50?page[49].id:''};
   }
   if(action==='adminReview') {
    if(!['approved','rejected','revoked'].includes(args.status))throw fail('审核操作无效','BAD_REQUEST',400);
    return repo.transaction(async tx=>{
     const row=await tx.get('devices',String(args.id));if(!row)throw fail('申请不存在','NOT_FOUND',404);
     if(args.status==='approved'&&!['pending','revoked','rejected'].includes(row.status))return publicDevice(row);
     const next={...row,status:args.status,version:(row.version||0)+1,reviewedAt:new Date(now()).toISOString()};
     await tx.put('devices',row.id,next);await audit(tx,'device_'+args.status,next,'管理端管理员');return publicDevice(next);
    });
   }
   throw fail('未知管理操作','BAD_REQUEST',400);
  }
  if(action==='login') {
   const {id,proof}=credentials(args);await rate('login-ip:'+ip,20);await rate('login-device:'+id,8);
   const name=String(args.name||'').trim().normalize('NFKC');
   if(!name||name.length>40)throw fail('请输入40字以内的人员姓名','BAD_REQUEST',400);
   if(typeof args.password!=='string'||args.password.length>200)throw fail('查询密码不正确');
   const snapshot=await source.load();
   if(!snapshot.passwordHash||!equal(hash(args.password.trim()),snapshot.passwordHash))throw fail('查询密码不正确');
   const row=await repo.transaction(async tx=>{
    const old=await tx.get('devices',id);
    if(old&&(!equal(old.proof,proof)||old.name!==name))throw fail('姓名与此设备原绑定信息不一致');
    const next=old||{id,proof,name,label:String(args.label||'').slice(0,100),status:'pending',version:1,requestedAt:new Date(now()).toISOString()};
    if(next.status==='approved')next.lastLoginAt=new Date(now()).toISOString();
    if(!old||next.status==='approved'){
     await tx.put('devices',id,next);
     await audit(tx,old?'login':'request',next,next.name);
    }
    return next;
   });
   return {status:row.status,name:row.name,...(row.status==='approved'?{token:sign(row),expiresAt:now()+8*3600000}:{})};
  }
  if(action==='status') {
   const {id,proof}=credentials(args);await rate('poll:'+id,25);
   const row=await repo.get('devices',id);if(!row||!equal(row.proof,proof))throw fail('申请不存在或设备凭据已失效');
   return {status:row.status,name:row.name};
  }
  const row=await authorize(context.token);
  await rate('read:'+row.id,120);
  if(action==='data') {
   const snapshot=await source.load(),offset=Number(args.offset||0);
   if(!Number.isSafeInteger(offset)||offset<0)throw fail('分页参数无效','BAD_REQUEST',400);
   if(args.revision&&args.revision!==snapshot.revision)throw fail('查询数据正在更新，请重试','REVISION_CHANGED',409);
   const active=snapshot.items.filter(x=>!x.deleted&&(!x.status||x.status==='在库'));
   const photos=(snapshot.photoAttachments||[]).filter(p=>!p.deleted);
   const items=active.slice(offset,offset+300).map(x=>({
    id:String(x.id),express:String(x.express||''),last4:String(x.last4||String(x.express||'').slice(-4)),customer:String(x.customer||''),date:String(x.date||''),pallet:String(x.pallet||''),
    photos:photos.filter(p=>p.targetType==='item'&&String(p.targetId)===String(x.id)||p.targetType==='pallet'&&String(p.targetId)===String(x.pallet)).map(p=>({id:p.id,note:String(p.note||''),type:p.targetType}))
   }));
   return {items,revision:snapshot.revision,updatedAt:snapshot.updatedAt,features:snapshot.features||{},nextOffset:offset+items.length<active.length?offset+items.length:null};
  }
  if(action==='photo') {
   if(!['full','thumbnail'].includes(args.variant))throw fail('图片类型无效','BAD_REQUEST',400);
   const snapshot=await source.load();
   const photo=(snapshot.photoAttachments||[]).find(p=>p.id===args.id&&!p.deleted);
   const visible=photo&&snapshot.items.some(x=>!x.deleted&&(!x.status||x.status==='在库')&&(photo.targetType==='item'&&String(photo.targetId)===String(x.id)||photo.targetType==='pallet'&&String(photo.targetId)===String(x.pallet)));
   if(!visible)throw fail('图片不可用','NOT_FOUND',404);
   return {content:await source.photo(photo,args.variant),mime:'image/jpeg'};
  }
  throw fail('未知查询操作','BAD_REQUEST',400);
 }
 return {dispatch};
}
module.exports={createService,hash};
