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
  let current=0,generation=0,closed=false,start=null,multitouch=false,drag=0;
  let ghost=null,ghostTimer=null;const animations=[];
  const reduced=()=>!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const width=()=>image.getBoundingClientRect?.().width||root.innerWidth||320;
  function clearGhost(){if(ghostTimer)clearTimeout(ghostTimer);ghostTimer=null;if(ghost)ghost.remove();ghost=null;}
  function animate(el,frames,hold=false){if(reduced()||!el.animate)return;const animation=el.animate(frames,{duration:240,easing:'cubic-bezier(.2,.75,.25,1)',fill:hold?'forwards':'none'});animations.push(animation);animation.onfinish=()=>{const i=animations.indexOf(animation);if(i>=0)animations.splice(i,1);};}
  function stopMotion(){animations.splice(0).forEach(animation=>animation.cancel());clearGhost();}
  function resetDrag(){if(drag)animate(image,[{transform:'translate3d('+drag+'px,0,0)'},{transform:'translate3d(0,0,0)'}]);drag=0;image.style.transform='';}
  function outgoing(direction){clearGhost();if(!direction||reduced()||!image.cloneNode||!image.naturalWidth||image.hidden)return;const rect=image.getBoundingClientRect();ghost=image.cloneNode(false);ghost.className='warehouse-photo-gallery-outgoing';ghost.setAttribute('aria-hidden','true');Object.assign(ghost.style,{position:'fixed',transform:'none',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',maxHeight:'none',maxWidth:'none',margin:'0',pointerEvents:'none'});layer.append(ghost);animate(ghost,[{transform:'translate3d(0,0,0)'},{transform:'translate3d('+(-direction*(root.innerWidth||width()))+'px,0,0)'}],true);ghostTimer=setTimeout(clearGhost,260);}
  const listeners=[];
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));}
  function close(){
   if(closed)return;closed=true;generation++;clearGhost();animations.forEach(animation=>animation.cancel());listeners.forEach(remove=>remove());layer.remove();doc.body.style.overflow=previousOverflow;
   if(active===handle)active=null;
   if(previousFocus&&previousFocus.isConnected&&previousFocus.focus)previousFocus.focus();
   if(typeof onClose==='function')onClose();
  }
  async function select(value,direction=0){
   if(closed)return;
   stopMotion();outgoing(direction);image.style.transform='';drag=0;
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
    image.onload=()=>{if(!closed&&token===generation){status.textContent='';layer.setAttribute('aria-busy','false');if(direction)animate(image,[{transform:'translate3d('+(direction*(root.innerWidth||width()))+'px,0,0)'},{transform:'translate3d(0,0,0)'}]);image.hidden=false;}};
    image.onerror=()=>{if(!closed&&token===generation){image.hidden=true;status.textContent='照片暂不可用，请重新打开或切换照片';layer.setAttribute('aria-busy','false');}};
    image.src=url;
   } catch(error){if(!closed&&token===generation){status.textContent=error&&error.message||'照片暂不可用';layer.setAttribute('aria-busy','false');}}
  }
  function navigate(direction){const target=current+direction;if(target<0||target>=rows.length){resetDrag();return;}return select(target,direction);}
  const handle={close,select,get index(){return current;},element:layer};active=handle;
  listen(closeButton,'click',close);listen(prev,'click',()=>navigate(-1));listen(next,'click',()=>navigate(1));
  listen(doc,'keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();close();}
   else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigate(event.key==='ArrowLeft'?-1:1);}
   else if(event.key==='Tab'){
    const focusable=[closeButton,prev,next].filter(el=>!el.disabled),first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(doc.activeElement===first||doc.activeElement===layer)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
   }
  });
  listen(layer,'touchstart',event=>{
   stopMotion();
   if(event.touches.length!==1){multitouch=true;start=null;resetDrag();return;}
   if(event.target?.closest?.('button')){start=null;return;}
   multitouch=Number(root.visualViewport?.scale||1)>1;const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  listen(layer,'touchmove',event=>{
   if(event.touches.length>1||Number(root.visualViewport?.scale||1)>1){multitouch=true;resetDrag();return;}
   if(!start||multitouch)return;const touch=event.touches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;
   if(Math.abs(dx)<=Math.abs(dy)*1.5)return;
   if(event.cancelable)event.preventDefault();drag=((dx>0&&current===0)||(dx<0&&current===rows.length-1))?dx*.22:dx;
   image.style.transform='translate3d('+drag+'px,0,0)';
  },{passive:false});
  listen(layer,'touchend',event=>{
   if(event.touches.length){multitouch=true;return;}
   const touch=event.changedTouches[0],direction=touch?swipeDirection(start,{x:touch.clientX,y:touch.clientY},{multitouch,scale:root.visualViewport?.scale}):0;
   start=null;if(direction)navigate(direction);else resetDrag();
  },{passive:true});
  listen(layer,'touchcancel',()=>{start=null;multitouch=true;resetDrag();},{passive:true});
  doc.body.style.overflow='hidden';doc.body.append(layer);closeButton.focus();select(index);return handle;
 }
 const api={open,close(){if(active)active.close();},swipeDirection};
 root.WarehousePhotoGallery=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
