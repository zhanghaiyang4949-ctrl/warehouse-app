'use strict';
const cloud=require('wx-server-sdk');
const {createService}=require('./service');
const {createSource}=require('./github');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
let service;
function createRepo(db) {
 const collection=name=>'query_access_v1_'+name;
 function adapter(source) {return {
  async get(table,id){try{const r=await source.collection(collection(table)).doc(id).get();return (Array.isArray(r.data)?r.data[0]:r.data)||null;}catch(e){if(/DOCUMENT_NOT_EXIST|document.*not.*exist/i.test(e.errMsg||e.message))return null;throw e;}},
  async put(table,id,value){const {_id,...data}=value;await source.collection(collection(table)).doc(id).set({data});}
 };}
 return {...adapter(db),transaction:async fn=>{const r=await db.runTransaction(tx=>fn(adapter(tx)));return r&&Object.hasOwn(r,'result')?r.result:r;},
  async countPending(){return (await db.collection(collection('devices')).where({status:'pending'}).count()).total;},
  async list(table,cursor,limit,order='asc'){let q=db.collection(collection(table));if(cursor)q=q.where({_id:db.command[order==='desc'?'lt':'gt'](cursor)});const r=await q.orderBy('_id',order).limit(limit).get();return r.data.map(({_id,...row})=>({...row,id:_id}));}
 };
}
exports.main=async(event={})=>{
 const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 const origins=(process.env.QUERY_ALLOWED_ORIGINS||'https://zhanghaiyang4949-ctrl.github.io').split(',').map(x=>x.trim());
 const origin=headers.origin,allowed=origins.includes(origin);
 const out={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type,Authorization,X-Query-Admin','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
 const respond=(statusCode,body)=>({statusCode,headers:out,body:JSON.stringify(body),isBase64Encoded:false});
 if(!allowed)return respond(403,{ok:false,code:'ORIGIN_DENIED',message:'请求来源未配置'});
 if(event.httpMethod==='OPTIONS')return respond(204,{});
 if(event.httpMethod!=='POST')return respond(405,{ok:false,code:'METHOD_NOT_ALLOWED',message:'仅支持POST'});
 try {
  const body=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body;
  if(typeof body!=='string'||Buffer.byteLength(body)>16384)return respond(400,{ok:false,code:'BAD_REQUEST',message:'请求格式无效'});
  const {action,args={}}=JSON.parse(body);if(typeof action!=='string'||action.length>40||!args||typeof args!=='object'||Array.isArray(args))return respond(400,{ok:false,code:'BAD_REQUEST',message:'请求参数无效'});
  if(!service)service=createService({repo:createRepo(cloud.database()),source:createSource(process.env),adminSecret:process.env.QUERY_ADMIN_SECRET});
  const data=await service.dispatch(action,args,{adminKey:headers['x-query-admin'],token:String(headers.authorization||'').replace(/^Bearer /,''),ip:event.requestContext?.sourceIp||event.requestContext?.identity?.sourceIp});
  return respond(200,{ok:true,data});
 }catch(e){return respond(e.status||503,{ok:false,code:e.code||'SERVICE_UNAVAILABLE',message:e.status?e.message:'查询服务暂不可用，请联系管理员检查配置'});}
};
