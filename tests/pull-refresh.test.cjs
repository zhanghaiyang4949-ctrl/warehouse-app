const test = require('node:test');
const assert = require('node:assert/strict');
const { createController, install } = require('../assets/pull-refresh.js');
function fixture() {
  const handlers = new Map();
  const target = { closest: () => null, parentElement: null, scrollHeight: 10, clientHeight: 10 };
  const doc = { documentElement: { scrollTop: 0 }, body: {}, addEventListener(t, f, config) { handlers.set(t, { f, config }); }, removeEventListener(t) { handlers.delete(t); } };
  const win = { scrollY: 0, getComputedStyle: () => ({ overflowY: 'visible' }), addEventListener() {}, removeEventListener() {} };
  let refreshes = 0, allowed = true;
  const progress = [];
  const controller = createController({ document: doc, window: win, onRefresh: () => refreshes++, onProgress: d => progress.push(d), canStart: () => allowed });
  function send(type, x = 0, y = 0, extra = {}) {
    const event = { target, cancelable: true, touches: type === 'touchend' || type === 'touchcancel' ? [] : [{ identifier: 1, clientX: x, clientY: y }], prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    handlers.get(type)?.f(event); return event;
  }
  return { doc, win, target, handlers, controller, send, progress, get refreshes() { return refreshes; }, block() { allowed = false; } };
}
test('short downward gesture is intercepted but does not refresh', () => {
  const f = fixture(); f.send('touchstart'); assert.equal(f.send('touchmove', 0, 70).prevented, true); f.send('touchend'); assert.equal(f.refreshes, 0); assert.equal(f.progress.at(-1), 0);
  assert.equal(f.handlers.get('touchmove').config.passive, false);
});
test('240 CSS pixel deliberate pull refreshes once on release', () => {
  const f = fixture(); f.send('touchstart', 10, 25); f.send('touchmove', 12, 265); assert.equal(f.refreshes, 0); f.send('touchend'); f.send('touchend'); assert.equal(f.refreshes, 1);
});
test('horizontal swipe stays untouched even if later turned downward', () => {
  const f = fixture(); f.send('touchstart'); assert.equal(f.send('touchmove', 70, 8).prevented, false); f.send('touchmove', 70, 260); f.send('touchend'); assert.equal(f.refreshes, 0);
});
test('pinch cancels active pull', () => {
  const f = fixture(); f.send('touchstart'); f.send('touchmove', 0, 200); f.send('touchmove', 0, 210, { touches: [{}, {}] }); f.send('touchend'); assert.equal(f.refreshes, 0);
});
test('gesture starting below top cannot activate on reaching top', () => {
  const f = fixture(); f.doc.documentElement.scrollTop = 20; f.send('touchstart'); f.doc.documentElement.scrollTop = 0; assert.equal(f.send('touchmove', 0, 240).prevented, false); f.send('touchend'); assert.equal(f.refreshes, 0);
});
test('nested scrolling region and editable/dialog targets are excluded', () => {
  for (const kind of ['nested', 'editable']) {
    const f = fixture();
    if (kind === 'nested') { f.target.scrollHeight = 100; f.win.getComputedStyle = () => ({ overflowY: 'auto' }); }
    else f.target.closest = () => ({});
    f.send('touchstart'); assert.equal(f.send('touchmove', 0, 240).prevented, false); f.send('touchend'); assert.equal(f.refreshes, 0);
  }
});
test('cancel, browser-owned gesture, upward scroll and blocked context never refresh', () => {
  for (const action of ['cancel', 'noncancelable', 'upward', 'blocked']) {
    const f = fixture(); f.send('touchstart');
    if (action === 'upward') f.send('touchmove', 0, -10);
    f.send('touchmove', 0, 240, { cancelable: action !== 'noncancelable' });
    if (action === 'cancel') f.send('touchcancel');
    if (action === 'blocked') f.block();
    f.send('touchend'); assert.equal(f.refreshes, 0, action);
  }
});
test('destroy removes gesture listeners and cancels progress', () => {
  const f = fixture(); f.send('touchstart'); f.send('touchmove', 0, 240); f.controller.destroy(); assert.equal(f.handlers.has('touchmove'), false); assert.equal(f.refreshes, 0); assert.equal(f.progress.at(-1), 0);
});
test('install confirms only tracking/note drafts; cancel preserves inputs and default fields do not prompt', () => {
  for (const field of ['inExpress', 'inNoteV86', 'inboundNote', 'inPallet']) {
    const f = fixture(); f.controller.destroy();
    const fields = { [field]: { value: 'draft' } };
    let prompts = 0, reloads = 0;
    f.doc.getElementById = id => fields[id];
    f.doc.querySelectorAll = () => [];
    f.doc.documentElement.classList = { add() {}, remove() {} };
    f.doc.createElement = () => ({ setAttribute() {}, remove() {} });
    f.doc.body.appendChild = () => {};
    f.win.confirm = () => { prompts++; return false; };
    f.win.location = { reload() { reloads++; } };
    const installed = install({ document: f.doc, window: f.win });
    f.send('touchstart'); f.send('touchmove', 0, 240); f.send('touchend');
    assert.equal(prompts, field === 'inPallet' ? 0 : 1);
    assert.equal(reloads, field === 'inPallet' ? 1 : 0);
    assert.equal(fields[field].value, 'draft');
    installed.destroy();
  }
});

test('ready indicator is green; vibration occurs only once per gesture and unsupported devices still work',()=>{
 const f=fixture();f.controller.destroy();let pulses=0;const indicator={setAttribute(){},remove(){},className:''};f.doc.getElementById=()=>null;f.doc.querySelectorAll=()=>[];f.doc.documentElement.classList={add(){},remove(){}};f.doc.createElement=()=>indicator;f.doc.body.appendChild=()=>{};f.win.navigator={vibrate:ms=>{assert.equal(ms,12);pulses++;}};const installed=install({document:f.doc,window:f.win,onRefresh(){}});
 f.send('touchstart');f.send('touchmove',0,239);assert.ok(!indicator.className.includes('is-ready'));f.send('touchmove',0,240);assert.ok(indicator.className.includes('is-ready'));f.send('touchmove',0,200);f.send('touchmove',0,260);assert.equal(pulses,1);f.send('touchend');f.win.navigator={};f.send('touchstart');f.send('touchmove',0,260);assert.ok(indicator.className.includes('is-ready'));f.send('touchend');installed.destroy();
});
