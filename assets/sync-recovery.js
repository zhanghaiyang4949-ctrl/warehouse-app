(function(root) {
 'use strict';
 function createRecovery({guard, key, notify = () => {}, recovered = () => {}, delayMs = 1200, schedule = true, hasPendingWork = async () => false}) {
  const originalConfirm = guard.confirm.bind(guard);
  let job = null;
  let busy = false;
  let timer;
  let backoff = 30000;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function transient(error) {return !error.cancelled&&(error.transient||error instanceof TypeError||error.status>=500||/超时|未确认|network|fetch/i.test(error.message||''));}
  function stop() { clearTimeout(timer); job = null; backoff = 30000; }
  function queue() {
   if (!schedule || !job) return;
   clearTimeout(timer);
   timer = setTimeout(() => { retry().catch(() => {}); }, backoff);
   backoff = Math.min(backoff * 2, 300000);
  }
  async function pendingSha() {
   const state = await guard.changes();
   return state.base?.pending?.uploadSha;
  }
  async function retry() {
   if (!job || busy) return;
   busy = true;
   const active = job;
   try {
    if (key() !== active.plan.key) throw Error('仓库设置已变化，请重新预览同步');
    notify('正在核对上次上传结果…');
    const state = await guard.inspect();
    if (active.uploadSha && state.remote?.sha === active.uploadSha && state.base?.sha === active.uploadSha) {
     stop(); recovered(state.base.db); return state.base.db;
    }
    if (await guard.hashLocal() !== active.plan.localHash) throw Error('本机已有新改动，请重新预览同步');
    if (state.remote?.sha !== active.plan.remote.sha) throw Error('其他设备已更新备份，请重新预览合并');
    const result = await originalConfirm(active.plan, active.choices);
    stop(); recovered(result); return result;
   } catch (error) {
    const sha = await pendingSha().catch(() => null);
    if (sha || transient(error)&&await hasPendingWork(active.plan)) {
     active.uploadSha = sha;
     notify('网络未能完成上传，本机数据已暂存；连接恢复后会重试'); queue();
    } else {
     stop(); notify(error.message);
    }
    throw error;
   } finally { busy = false; }
  }
  async function confirm(plan, choices = {}) {
   if (busy) throw Error('正在恢复上传，请稍候');
   clearTimeout(timer);
   job = {plan, choices};
   busy = true;
   try {
    const result = await originalConfirm(plan, choices);
    stop(); return result;
   } catch (error) {
    const sha = await pendingSha().catch(() => null);
    if (!sha && !(transient(error)&&await hasPendingWork(plan))) { stop(); throw error; }
    job.uploadSha = sha;
    notify('连接中断，正在核对并重试…');
   } finally { busy = false; }
   await sleep(delayMs);
   return retry();
  }
  return {confirm, retry, hasPending: () => !!job};
 }
 if (typeof module !== 'undefined' && module.exports) { module.exports = {createRecovery}; return; }
 const guard = root.warehouseGitHubGuard20261023;
 function key() { const c = getGitHubConfigV44(); return 'warehouseGitHubGuard20261023:' + JSON.stringify([c.owner,c.repo,c.branch,c.path]); }
 const recovery = createRecovery({guard, key, hasPendingWork:plan=>root.WarehousePhotos?.hasPending(plan)||false,
  notify: message => { const el = document.getElementById('githubVersionStatus20261023'); if (el) el.textContent = message; },
  recovered: () => {
   const close = document.querySelector('.offline-review-layer [data-close]:not(:disabled)');
   close?.click(); refresh(); updateStorageStatusV44(); toast('连接已恢复，上次备份已确认成功');
  }
 });
 guard.confirm = recovery.confirm;
 root.WarehouseUploadRecovery = recovery;
 window.addEventListener('online', () => recovery.retry().catch(() => {}));
 document.addEventListener('visibilitychange', () => { if (!document.hidden) recovery.retry().catch(() => {}); });
})(typeof window !== 'undefined' ? window : globalThis);
