(function(root){
 'use strict';
 class CloudWarehouse{
  constructor({request,publish=()=>{}}){this.request=request;this.publish=publish;this.revision=null;this.snapshot=null;this.pending=null;this.loading=null;this.writing=false}
  can(user,p){return user.role==='owner'||!!user.permissions?.[p]}
  async pages(action,field){let rows=[],cursor='';const seen=new Set();do{const page=await this.request(action,{cursor});rows.push(...page[field]);cursor=page.nextCursor||'';if(cursor&&seen.has(cursor))throw Error('云端分页异常');seen.add(cursor)}while(cursor);return rows}
  async refresh(){if(this.loading)return this.loading;this.loading=this.readStable();try{return await this.loading}finally{this.loading=null}}
  async readStable(){
   const {user}=await this.request('me');
   for(let attempt=0;attempt<3;attempt++){
    const before=await this.request('syncRevision');
    const items=await this.pages('inventory','items');
    const events=this.can(user,'search')?await this.pages('history','events'):this.can(user,'picking')?await this.pages('packingHistory','events'):[];
    const tasks=this.can(user,'picking')?await this.pages('packingList','tasks'):[];
    const after=await this.request('syncRevision');
    if(before.revision!==after.revision)continue;
    this.snapshot={user,items,events,tasks,readAt:new Date().toISOString()};this.revision=after.revision;this.publish(this.snapshot);return this.snapshot;
   }
   throw Error('仓库正在连续更新，本次保留上次记录，稍后重试');
  }
  async check(){const head=await this.request('syncRevision');if(this.revision!==head.revision)return this.refresh();return this.snapshot}
  async write(action,args){
   if(this.pending)throw Error('上次操作结果未确认，请先重试原请求');
   const requestId=globalThis.crypto?.randomUUID?.()||('web-'+Date.now()+'-'+Math.random().toString(36).slice(2));
   this.pending={action,args:JSON.parse(JSON.stringify({...args,requestId}))};return this.retry();
  }
  async retry(){
   if(!this.pending)throw Error('没有等待确认的请求');if(this.writing)throw Error('正在提交，请稍候');
   this.writing=true;try{const result=await this.request(this.pending.action,this.pending.args);this.pending=null;return result}
   catch(e){if(e.code&&!e.uncertain)this.pending=null;throw e}finally{this.writing=false}
  }
 }
 function recoverDraft(pending,result,draft,dirty){
  if(pending.action==='packingFinish'&&draft?.id===pending.args.id)return {draft:null,dirty:false};
  if(pending.action==='packingSave'&&draft?.id===pending.args.id)return {draft:{...draft,version:result.task.version},dirty};
  if(pending.action==='packingCreate'&&!draft)return {draft:{...result.task,lineStates:JSON.parse(JSON.stringify(result.task.lines||[]))},dirty:false};
  return {draft,dirty};
 }
 if(typeof module!=='undefined')module.exports={CloudWarehouse,recoverDraft};else {root.CloudWarehouse=CloudWarehouse;root.recoverDraft=recoverDraft}
})(globalThis);
