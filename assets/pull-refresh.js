/* Custom manager pull-to-refresh. Distances are CSS pixels, not native browser thresholds. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.WarehousePullRefresh = api;
    const start = () => {
      // Manager-only marker; the query app must never install this behavior.
      if (root.document.getElementById('inExpress') && !api.controller) {
        api.controller = api.install({ window: root, document: root.document });
      }
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const BLOCKED = 'input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="dialog"],.modalMask,.v5-scanner-layer,.warehouse-photo-viewer,.warehouse-photo-editor';
  function createController(options) {
    const doc = options.document, win = options.window;
    const threshold = options.threshold || 240;
    let gesture = null, destroyed = false;
    const atTop = () => (doc.scrollingElement || doc.documentElement).scrollTop <= 0 && !(win.scrollY > 0);
    function excluded(target) {
      if (!target || target.closest?.(BLOCKED)) return true;
      for (let node = target; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
        const style = win.getComputedStyle(node);
        if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return true;
      }
      return false;
    }
    const paint = distance => options.onProgress?.(distance, threshold);
    function cancel() { gesture = null; paint(0); }
    function start(event) {
      cancel();
      if (destroyed || event.touches.length !== 1 || !atTop() || excluded(event.target) || options.canStart?.(event) === false) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, id: touch.identifier, distance: 0, active: false };
    }
    function move(event) {
      if (!gesture) return;
      if (event.touches.length !== 1 || !atTop() || options.canStart?.(event) === false) return cancel();
      const touch = event.touches[0];
      if (touch.identifier !== gesture.id) return cancel();
      const dx = Math.abs(touch.clientX - gesture.x), dy = touch.clientY - gesture.y;
      if (!gesture.active) {
        if (dy < -4 || (dx > 6 && dx >= Math.abs(dy))) return cancel();
        if (dy <= 6 || dy <= dx * 1.25) return;
        gesture.active = true;
      }
      // A noncancelable move means the browser already owns scrolling. Never refresh then.
      if (!event.cancelable) return cancel();
      event.preventDefault();
      gesture.distance = Math.max(0, dy);
      paint(gesture.distance);
    }
    function end(event) {
      if (!gesture) return;
      if (event.touches?.length) return cancel();
      const refresh = gesture.active && gesture.distance >= threshold && atTop() && options.canStart?.(event) !== false;
      cancel();
      if (refresh) options.onRefresh();
    }
    const listeners = [['touchstart', start, { passive: true }], ['touchmove', move, { passive: false }], ['touchend', end, { passive: true }], ['touchcancel', cancel, { passive: true }]];
    listeners.forEach(([type, handler, config]) => doc.addEventListener(type, handler, config));
    win.addEventListener('blur', cancel);
    const visibility = () => { if (doc.hidden) cancel(); };
    doc.addEventListener('visibilitychange', visibility);
    return { cancel, destroy() {
      destroyed = true; cancel();
      listeners.forEach(([type, handler, config]) => doc.removeEventListener(type, handler, config));
      win.removeEventListener('blur', cancel); doc.removeEventListener('visibilitychange', visibility);
    } };
  }
  function install(options) {
    const doc = options.document, win = options.window;
    const indicator = doc.createElement('div');
    indicator.className = 'warehouse-pull-refresh';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.hidden = true;
    doc.body.appendChild(indicator);
    doc.documentElement.classList.add('warehouse-pull-refresh-enabled');
    const visibleDialog = () => Array.from(doc.querySelectorAll('.modalMask,[role="dialog"],.v5-scanner-layer,.warehouse-photo-viewer,.warehouse-photo-editor')).some(node => {
      const style = win.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    });
    let ready=false,notified=false;
    const controller = createController({ ...options,
      canStart: event => !visibleDialog() && options.canStart?.(event) !== false,
      onProgress(distance, threshold) {
        indicator.hidden = distance <= 0;
        const reached=distance>=threshold;indicator.className='warehouse-pull-refresh'+(reached?' is-ready':'');
        if(reached&&!ready&&!notified){notified=true;try{win.navigator?.vibrate?.(12);}catch{}}
        ready=reached;if(distance<=0)notified=false;
        const text = distance >= threshold ? '松开刷新' : '继续下拉刷新';
        if (indicator.textContent !== text) indicator.textContent = text;
        options.onProgress?.(distance, threshold);
      },
      onRefresh() {
        const unsaved = ['inExpress', 'inNoteV86', 'inboundNote'].some(id => String(doc.getElementById(id)?.value || '').trim());
        if (unsaved && !win.confirm('还有未保存的快递单号或入库备注，刷新会清空这些输入。确定刷新吗？')) return;
        if (options.onRefresh) options.onRefresh(); else win.location.reload();
      }
    });
    return { cancel: controller.cancel, destroy() {
      controller.destroy(); indicator.remove();
      doc.documentElement.classList.remove('warehouse-pull-refresh-enabled');
    } };
  }
  return { createController, install };
});
