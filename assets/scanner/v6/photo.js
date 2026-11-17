(function(root){
'use strict';
let active=null;
function current(session){return active===session&&!session.controller.signal.aborted&&(!session.options.isCurrent||session.options.isCurrent())}
function close(){const s=active;if(!s)return;active=null;s.controller.abort();if(s.cancelImage)s.cancelImage();if(s.url){root.URL.revokeObjectURL(s.url);s.url=null}s.layer.remove();if(s.focus&&s.focus.isConnected)s.focus.focus()}
function isCurrent(){return !!active&&current(active)}
function open(options={}){
 close();root.V5Scanner?.closeScanner();
 const d=root.document,layer=d.createElement('div');layer.className='v5-scanner-layer v6-photo-layer';
 layer.innerHTML='<section class="v5-scanner-dialog v6-photo-dialog" role="dialog" aria-modal="true" aria-labelledby="v6-photo-title"><header><strong id="v6-photo-title"></strong><button type="button" data-photo="close">关闭</button></header><p>选择照片或拍照，在本机识别条码。</p><label class="v6-photo-picker">选择照片<input type="file" accept="image/*" data-photo="file"></label><p class="v5-status" role="status" aria-live="polite" data-photo="status">请选择一张条码清晰的照片</p><div class="v6-photo-results" data-photo="results"></div></section>';
 const s={layer,options,controller:new root.AbortController(),focus:d.activeElement,revision:0,url:null,cancelImage:null};active=s;
 const q=name=>layer.querySelector('[data-photo="'+name+'"]');layer.querySelector('#v6-photo-title').textContent=options.title||'照片识别';
 q('close').onclick=close;
 q('file').onchange=async event=>{
  if(!current(s)){if(active===s)close();return}
  const file=event.target.files&&event.target.files[0];if(!file)return;event.target.value='';if(file.size>30*1024*1024){q('status').textContent='照片超过30MB，请先裁切条码区域';return;}
  if(s.cancelImage)s.cancelImage();if(s.url){root.URL.revokeObjectURL(s.url);s.url=null}
  if(s.decodeController)s.decodeController.abort();
  const decodeController=new root.AbortController();s.decodeController=decodeController;
  const abort=()=>decodeController.abort();s.controller.signal.addEventListener('abort',abort,{once:true});
  const revision=++s.revision;const valid=()=>current(s)&&revision===s.revision&&!decodeController.signal.aborted;
  q('results').replaceChildren();q('status').textContent='正在读取照片…';
  let url;
  try{
   url=root.URL.createObjectURL(file);s.url=url;
   const img=new root.Image();
   await new Promise((resolve,reject)=>{const cleanup=()=>{img.onload=null;img.onerror=null;s.cancelImage=null};s.cancelImage=()=>{cleanup();img.src='';reject(Object.assign(new Error('已取消'),{name:'AbortError'}))};img.onload=()=>{cleanup();resolve()};img.onerror=()=>{cleanup();reject(new Error('照片无法读取，请换一张照片'))};img.src=url});
   if(!valid())return;
   q('status').textContent='正在识别条码…';
   const raw=await root.WarehouseV6.decode(img,{signal:decodeController.signal,heavy:true});if(!valid())return;
   const results=[...new Map((raw||[]).filter(r=>r&&typeof r.text==='string'&&r.text.trim()).map(r=>[r.text,r])).values()];
   if(!results.length){q('status').textContent='未识别到条码，请选择更清晰、完整的照片';return}
   q('status').textContent=results.length>1?'识别到多个条码，请选择要填入的单号':'识别成功，请确认填入单号';
   for(const result of results){const button=d.createElement('button');button.type='button';button.textContent=result.text;button.onclick=()=>{if(!valid()){if(active===s)close();return}button.disabled=true;try{const response=options.onResult?.({...result,timestamp:Date.now()});if(response&&response.accepted===false){q('status').textContent=response.message||'未填入，请检查原输入';button.disabled=false}else close()}catch(error){q('status').textContent=error.message||'填入失败';button.disabled=false}};q('results').append(button)}
  }catch(error){if(valid()&&error.name!=='AbortError')q('status').textContent=error.message||'识别失败，请重新选择照片'}
  finally{s.controller.signal.removeEventListener('abort',abort);if(url&&s.url===url){root.URL.revokeObjectURL(url);s.url=null}if(active===s&&!current(s))close()}
 };
 layer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close()}if(event.key==='Tab'){const focusable=[...layer.querySelectorAll('button,input')].filter(n=>!n.disabled);const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&d.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&d.activeElement===last){event.preventDefault();first.focus()}}});
 d.body.append(layer);q('close').focus();return layer;
}
root.WarehouseV6Photos={open,close,isCurrent,isOpen:()=>!!active};
})(typeof window!=='undefined'?window:globalThis);
