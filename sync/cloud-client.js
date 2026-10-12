(function(root){
 'use strict';
 class CloudWarehouse{
  constructor({request,publish=()=>{}}){this.request=request;this.publish=publish;this.revision=null;this.snapshot=null;this.pending=null;this.loading=null;this.writing=false;this.cursor='';this.epoch='';this.localGeneration=0;this.snapshotGeneration=0;this.checking=null;this.maintenance=null}
  can(user,p){return user.role==='owner'||!!user.permissions?.[p]}
  async pages(action,field){let rows=[],cursor='';const seen=new Set();do{const page=await this.request(action,{cursor});rows.push(...page[field]);cursor=page.nextCursor||'';if(cursor&&seen.has(cursor))throw Error('云端分页异常');seen.add(cursor)}while(cursor);return rows}
  async refresh(){if(this.loading)return this.loading;this.loading=this.readStable();try{return await this.loading}finally{this.loading=null}}
  async readStable(){
   const {user}=await this.request('me');
   for(let attempt=0;attempt<3;attempt++){
    const generation=this.localGeneration,before=await this.request('syncRevision');if(before.maintenance){this.maintenance=before.maintenance;throw Error('仓库维护中，暂停读取和提交，请等待导入完成')}
    const items=await this.pages('inventory','items');
    const events=this.can(user,'search')?await this.pages('history','events'):this.can(user,'picking')?await this.pages('packingHistory','events'):[];
    const tasks=this.can(user,'picking')?await this.pages('packingList','tasks'):[];
    const after=await this.request('syncRevision');
    if(after.maintenance){this.maintenance=after.maintenance;throw Error('仓库维护中，暂停读取和提交，请等待导入完成')}if(before.revision!==after.revision||(before.epoch||'')!==(after.epoch||'')||generation!==this.localGeneration)continue;
    this.snapshotGeneration++;this.maintenance=null;this.epoch=after.epoch||'';this.cursor=after.cursor||String(after.revision||0).padStart(20,'0');this.snapshot={user,items,events,tasks,readAt:new Date().toISOString()};this.revision=after.revision;this.publish(this.snapshot);return this.snapshot;
   }
   throw Error('仓库正在连续更新，本次保留上次记录，稍后重试');
  }
  applyChanges(changes){if(!this.snapshot)return;this.localGeneration++;for(const table of ['items','tasks','events']){const rows=new Map(this.snapshot[table].map(x=>[x.id,x]));for(const c of changes||[]){if(c.table!==table)continue;const old=rows.get(c.id);if(c.deleted)rows.delete(c.id);else if(c.value&&(!old||(c.value.version||0)>=(old.version||0)))rows.set(c.id,c.value)}this.snapshot[table]=Array.from(rows.values())}this.snapshot.readAt=new Date().toISOString();this.publish(this.snapshot)}
  async check(){if(this.checking)return this.checking;this.checking=this.readChanges();try{return await this.checking}finally{this.checking=null}}
  async readChanges(){if(this.loading)await this.loading;const generation=this.snapshotGeneration,head=await this.request('syncRevision');if(generation!==this.snapshotGeneration)return this.snapshot;if(head.maintenance){this.maintenance=head.maintenance;throw Error('仓库维护中，暂停提交，请等待导入完成')}this.maintenance=null;if(!this.snapshot||(head.epoch||'')!==this.epoch)return this.refresh();const {user}=await this.request('me');if(generation!==this.snapshotGeneration)return this.snapshot;if(JSON.stringify(user)!==JSON.stringify(this.snapshot.user))return this.refresh();if(this.revision===head.revision)return this.snapshot;
   for(let page=0;page<1000;page++){const cursor=this.cursor,epoch=this.epoch,delta=await this.request('syncDelta',{cursor,epoch});if(generation!==this.snapshotGeneration||epoch!==this.epoch||cursor!==this.cursor)return this.snapshot;if(delta.maintenance){this.maintenance=delta.maintenance;throw Error('仓库维护中，请等待导入完成')}if(delta.resetRequired)return this.refresh();if((delta.epoch||'')!==epoch)return this.refresh();if(delta.hasMore&&delta.cursor===this.cursor)throw Error('增量同步游标未前进');this.applyChanges(delta.changes);this.cursor=delta.cursor;this.revision=delta.revision;if(!delta.hasMore)return this.snapshot;}throw Error('增量同步过长，请手动刷新');
  }
  async write(action,args){
   if(this.maintenance)throw Error('仓库维护中，暂停提交');
   if(this.pending)throw Error('上次操作结果未确认，请先重试原请求');
   const requestId=globalThis.crypto?.randomUUID?.()||('web-'+Date.now()+'-'+Math.random().toString(36).slice(2));
   this.pending={action,args:JSON.parse(JSON.stringify({...args,requestId,epoch:this.epoch}))};return this.retry();
  }
  async retry(){
   if(!this.pending)throw Error('没有等待确认的请求');if(this.writing)throw Error('正在提交，请稍候');
   this.writing=true;try{const requestEpoch=this.pending.args.epoch||'',result=await this.request(this.pending.action,this.pending.args);this.pending=null;if((result.epoch??requestEpoch)!==this.epoch)throw Object.assign(Error('仓库数据已整体替换，旧操作响应已失效，请核对新数据'),{code:'RESET_REQUIRED'});if(result.changes)this.applyChanges(result.changes);return result}
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
