(function(root) {
 'use strict';
 let active=null;
 // Returns a page step; native scrolling and pinch zoom remain untouched.
 function swipeDirection(start,end,options={}) {
  if(!start||!end||options.multitouch||Number(options.scale||1)>1)return 0;
  const dx=end.x-start.x,dy=end.y-start.y;
  return Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?1:-1):0;
 }
 function open({records,index=0,loadImage,extraClass='',label='照片大图',onClose}={}) {
  if(!Array.isArray(records)||!records.length)throw new Error('没有可查看的照片');
  if(typeof loadImage!=='function')throw new TypeError('loadImage is required');
  if(active)active.close();
  const rows=records.slice(),doc=root.document,previousOverflow=doc.body.style.overflow,previousFocus=doc.activeElement;
  const layer=doc.createElement('div');layer.className='warehouse-photo-gallery '+extraClass;
  layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',label);layer.tabIndex=-1;
  function element(tag,className,text) {const el=doc.createElement(tag);el.className=className;if(text)el.textContent=text;return el;}
  function button(className,text,title){const el=element('button',className,text);el.type='button';el.setAttribute('aria-label',title);return el;}
  const closeButton=button('warehouse-photo-gallery-close','关闭','关闭照片');
  const image=element('img','warehouse-photo-gallery-image');
  const controls=element('div','warehouse-photo-gallery-controls');
  const prev=button('warehouse-photo-gallery-prev','‹','上一张'),next=button('warehouse-photo-gallery-next','›','下一张');
  const counter=element('span','warehouse-photo-gallery-counter');counter.setAttribute('aria-live','polite');
  const status=element('p','warehouse-photo-gallery-status');status.setAttribute('role','status');
  const note=element('p','warehouse-photo-gallery-note');
  controls.append(prev,counter,next);layer.append(closeButton,image,controls,status,note);
  let current=0,generation=0,closed=false,start=null,multitouch=false;
  const listeners=[];
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));}
  function close(){
   if(closed)return;closed=true;generation++;listeners.forEach(remove=>remove());layer.remove();doc.body.style.overflow=previousOverflow;
   if(active===handle)active=null;
   if(previousFocus&&previousFocus.isConnected&&previousFocus.focus)previousFocus.focus();
   if(typeof onClose==='function')onClose();
  }
  async function select(value){
   if(closed)return;
   current=Math.max(0,Math.min(rows.length-1,Number.isFinite(value)?Math.trunc(value):0));
   const token=++generation,record=rows[current];
   image.hidden=true;image.removeAttribute('src');image.alt=record.note||label;
   counter.textContent=(current+1)+' / '+rows.length;note.textContent=record.note||'';
   prev.disabled=current===0;next.disabled=current===rows.length-1;
   status.textContent='正在加载大图…';layer.setAttribute('aria-busy','true');
   try {
    const url=await loadImage(record);
    if(closed||token!==generation)return;
    if(!url)throw new Error('照片暂不可用');
    image.onload=()=>{if(!closed&&token===generation){status.textContent='';layer.setAttribute('aria-busy','false');}};
    image.onerror=()=>{if(!closed&&token===generation){image.hidden=true;status.textContent='照片暂不可用，请重新打开或切换照片';layer.setAttribute('aria-busy','false');}};
    image.src=url;image.hidden=false;
   } catch(error){if(!closed&&token===generation){status.textContent=error&&error.message||'照片暂不可用';layer.setAttribute('aria-busy','false');}}
  }
  const handle={close,select,get index(){return current;},element:layer};active=handle;
  listen(closeButton,'click',close);listen(prev,'click',()=>select(current-1));listen(next,'click',()=>select(current+1));
  listen(doc,'keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();close();}
   else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(current+(event.key==='ArrowLeft'?-1:1));}
   else if(event.key==='Tab'){
    const focusable=[closeButton,prev,next].filter(el=>!el.disabled),first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(doc.activeElement===first||doc.activeElement===layer)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
   }
  });
  listen(layer,'touchstart',event=>{
   if(event.touches.length!==1){multitouch=true;return;}
   multitouch=Number(root.visualViewport?.scale||1)>1;const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  listen(layer,'touchmove',event=>{if(event.touches.length>1||Number(root.visualViewport?.scale||1)>1)multitouch=true;},{passive:true});
  listen(layer,'touchend',event=>{
   if(event.touches.length){multitouch=true;return;}
   const touch=event.changedTouches[0],direction=touch?swipeDirection(start,{x:touch.clientX,y:touch.clientY},{multitouch,scale:root.visualViewport?.scale}):0;
   start=null;if(direction)select(current+direction);
  },{passive:true});
  listen(layer,'touchcancel',()=>{start=null;multitouch=true;},{passive:true});
  doc.body.style.overflow='hidden';doc.body.append(layer);closeButton.focus();select(index);return handle;
 }
 const api={open,close(){if(active)active.close();},swipeDirection};
 root.WarehousePhotoGallery=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
