/* V6 camera adapter. Original V5 engine remains unmodified for rollback. */
(function(root){'use strict';
const legacyScanner=root.V5Scanner;root.LegacyV5Scanner=legacyScanner;
let decodeAbort=null,frameNumber=0,confirmedText='',confirmationCount=0,lastAutoZoom=0,autoZoom=true,lastZoomBox=null;
let layer=null,options=null,session=0,loadPromise=null,previousFocus=null,oldOverflow='';
const $=id=>layer.querySelector('[data-v5="'+id+'"]');
let video=null,reader=null,stream=null,track=null;
let running=false,paused=false,busy=false,torchOn=false;
let audioCtx=null,loopId=0,processing=false;
let lastDecodeTime=0,lastQualityTime=0,preferredAngle=0,decodeFailures=0,angleIndex=0;
let decodeWidth=1280,averageDecodeMs=0,duplicateCount=0,invalidCount=0,lastSuccessTime=0,qualityBadCount=0;
const records=[],lastSeen=new Map(),batchSeen=new Set(),DUP_MS=3000,angles=[0,90,180,270];
const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const rotated=document.createElement('canvas'),rctx=rotated.getContext('2d',{willReadFrequently:true});
function status(text){if(layer)$('status').textContent=text}
function buttons(){if(!layer)return;$('start').disabled=running||busy;$('pause').disabled=!running||paused||busy;$('resume').disabled=!running||!paused||busy;$('stop').disabled=!running&&!busy}
function updateStats(){if(layer)$('count').textContent=records.length}
function validateBarcode(text,format){return !!text&&!!text.trim()&&(format!=='EAN_13'||validEAN13(text))}
function isDuplicate(text){const now=Date.now();return options.batch&&batchSeen.has(text)||now-(lastSeen.get(text)||0)<DUP_MS}
function success(result,angle){
 if(!options||!isCurrent()){closeScanner();return}
 const text=result.getText(),format=root.ZXing.BarcodeFormat[result.getBarcodeFormat()]||String(result.getBarcodeFormat()),now=Date.now();
 if(!validateBarcode(text,format)){status('无效条码，请重新扫描');return}
 if(isDuplicate(text)){status('重复单号，请移开条码');return}
 lastSeen.set(text,now);for(const [key,time] of lastSeen)if(now-time>DUP_MS)lastSeen.delete(key);
 let outcome;
 try{outcome=options.onResult?.({text,format,timestamp:now})}catch(e){status('填入失败：'+e.message);pauseScanner();return}
 if(outcome?.accepted===false){status(outcome.message||'未追加');return}
 batchSeen.add(text);records.push({text,format,timestamp:now});preferredAngle=angle;decodeFailures=0;lastSuccessTime=now;
 $('last').textContent=text;$('format').textContent=format;updateStats();beep('success');if(navigator.vibrate)navigator.vibrate(80);
 if(options.mode==='single'){closeScanner();return}
 status((outcome?.message||'识别成功')+' · 继续扫描');
}
function ensureLibrary(){
 if(root.ZXing)return Promise.resolve();if(loadPromise)return loadPromise;
 loadPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='assets/scanner/vendor/zxing-0.21.3.min.js';s.onload=()=>root.ZXing?resolve():reject(Error('扫码引擎不可用'));s.onerror=()=>{s.remove();reject(Error('扫码组件加载失败，请检查连接后重试'))};document.head.append(s)}).catch(e=>{loadPromise=null;throw e});return loadPromise;
}
function release(s){if(s)s.getTracks().forEach(t=>t.stop())}
function stopScanner(){
 session++;loopId++;decodeAbort?.abort();decodeAbort=null;release(stream);stream=null;track=null;if(video){video.pause();video.srcObject=null}
 running=false;paused=false;busy=false;torchOn=false;reader?.reset();reader=null;processing=false;
 if(layer){$('info').textContent='';$('quality').textContent='';$('torch').textContent='手电筒';refresh();status('已停止，点击重试可重新开启摄像头');buttons()}
}
function closeScanner(){legacyScanner?.closeScanner();stopScanner();if(layer){layer.remove();layer=null;options=null;document.body.style.overflow=oldOverflow;previousFocus?.focus?.();video=null}}
function isCurrent(){return !!layer&&layer.isConnected!==false&&!!options&&(!options.isCurrent||options.isCurrent())}
async function startScanner(){
 if(!layer||running||busy)return;const token=++session;busy=true;buttons();status('正在启动高清后置摄像头…');
 try{
  if(!root.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('请使用 Safari 打开 HTTPS 网站，并允许相机权限');
  // Unlock audio inside the user's start gesture; audio failure must not block camera.
  try{if(!audioCtx)audioCtx=new (root.AudioContext||root.webkitAudioContext)();audioCtx.resume().catch(()=>{})}catch(e){}
  await ensureLibrary();if(token!==session||!layer)return;
  const hints=new Map();hints.set(root.ZXing.DecodeHintType.POSSIBLE_FORMATS,[root.ZXing.BarcodeFormat.CODE_128,root.ZXing.BarcodeFormat.CODE_39,root.ZXing.BarcodeFormat.EAN_13,root.ZXing.BarcodeFormat.QR_CODE]);hints.set(root.ZXing.DecodeHintType.TRY_HARDER,true);
  reader=new root.ZXing.MultiFormatReader();reader.setHints(hints);
  const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30}}});
  if(token!==session||!layer||!isCurrent()){release(acquired);return}
  stream=acquired;track=stream.getVideoTracks()[0];video.srcObject=stream;await video.play();if(token!==session||!layer)return;
  running=true;paused=false;await optimize();if(token!==session||!layer)return;
  status('V6 扫描中 · 框内高清优先，自动全画面兜底');scanLoop(++loopId);
 }catch(e){if(token===session&&layer){release(stream);stream=null;track=null;video.srcObject=null;running=false;status('启动失败：'+(e.message||e));options?.onError?.(e)}}
 finally{if(token===session){busy=false;buttons()}}
}
function pauseScanner(){if(!running||paused)return;paused=true;++loopId;decodeAbort?.abort();decodeAbort=null;processing=false;status('已暂停');buttons()}
function resumeScanner(){if(!running||!paused)return;paused=false;status('继续扫描中');scanLoop(++loopId);buttons()}
function openScanner(config={}){
 closeScanner();root.WarehouseV6Photos?.close();frameNumber=0;confirmedText='';confirmationCount=0;lastAutoZoom=performance.now();lastZoomBox=null;autoZoom=true;options={mode:'single',...config};previousFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 lastSeen.clear();batchSeen.clear();records.length=0;preferredAngle=0;decodeFailures=0;decodeWidth=1280;averageDecodeMs=0;lastDecodeTime=0;lastQualityTime=0;qualityBadCount=0;
 layer=document.createElement('div');layer.className='v5-scanner-layer';
 layer.innerHTML='<section class="v5-scanner-dialog" role="dialog" aria-modal="true" aria-label="V6 高清扫码"><header><strong data-v5="title"></strong><button type="button" data-v5="close">关闭</button></header><div class="v5-camera"><video data-v5="video" autoplay muted playsinline></video><div class="v5-guide"></div><span>全画面识别 · 可横放、竖放或倒放</span></div><div class="v5-status" data-v5="status" role="status">正在准备摄像头…</div><div class="v5-result"><strong data-v5="last">等待扫描</strong><small data-v5="format"></small><span>本次成功 <b data-v5="count">0</b> 次</span></div><div class="v5-controls"><button type="button" data-v5="legacy">切回 V5</button><button type="button" data-v5="start">重试</button><button type="button" data-v5="pause">暂停</button><button type="button" data-v5="resume">继续</button><button type="button" data-v5="stop">停止</button></div><div class="v5-controls v5-options"><button type="button" data-v5="auto" class="hidden">智能倍率：开</button><button type="button" data-v5="z1" class="hidden">1×</button><button type="button" data-v5="z15" class="hidden">1.5×</button><button type="button" data-v5="z2" class="hidden">2×</button><button type="button" data-v5="torch" class="hidden">手电筒</button></div><small data-v5="quality"></small><small data-v5="info"></small></section>';
 document.body.append(layer);video=$('video');$('title').textContent='V6 · '+(config.title||'高清扫码');
 $('legacy').onclick=()=>{const config=options;closeScanner();legacyScanner.openScanner(config);};$('close').onclick=closeScanner;$('start').onclick=startScanner;$('pause').onclick=pauseScanner;$('resume').onclick=resumeScanner;$('stop').onclick=stopScanner;
 $('auto').onclick=()=>{autoZoom=!autoZoom;$('auto').textContent='智能倍率：'+(autoZoom?'开':'关');};$('z1').onclick=()=>zoom(1);$('z15').onclick=()=>zoom(1.5);$('z2').onclick=()=>zoom(2);
 $('torch').onclick=async()=>{const token=session;const ok=await advanced({torch:!torchOn});if(!layer||token!==session)return;if(ok){torchOn=!torchOn;$('torch').textContent=torchOn?'关闭手电筒':'手电筒'}else{status('当前设备不支持手电筒');$('torch').classList.add('hidden')}};
 buttons();$('close').focus?.();
 if(config.autoStart!==false)return startScanner();
}
const api={openScanner,startScanner,pauseScanner,resumeScanner,stopScanner,closeScanner,isOpen:()=>!!layer||!!legacyScanner?.isOpen(),isCurrent:()=>layer?isCurrent():!!legacyScanner?.isCurrent()};root.V6Scanner=api;if(new URLSearchParams(root.location.search).get('scanner')!=='v5')root.V5Scanner=api;
function beep(type="success"){
 try{
  if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended")audioCtx.resume();

  const o=audioCtx.createOscillator();
  const g=audioCtx.createGain();

  o.type="sine";
  o.frequency.value=type==="success"?950:type==="duplicate"?450:280;

  g.gain.setValueAtTime(.12,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);

  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime+.12);
 }catch(e){}
}

function validEAN13(value){
 if(!/^\d{13}$/.test(value))return false;
 let sum=0;
 for(let i=0;i<12;i++){
  sum+=Number(value[i])*(i%2?3:1);
 }
 return (10-sum%10)%10===Number(value[12]);
}

function caps(){
 try{return track?.getCapabilities?.()||{}}catch(e){return {}}
}

function settings(){
 try{return track?.getSettings?.()||{}}catch(e){return {}}
}

function refresh(){
 if(!layer)return;
 const s=settings(),c=caps();

 $("info").textContent=
 "分辨率："+(s.width||"?")+"×"+(s.height||"?")+
 " · 变焦："+(s.zoom||1)+"×"+
 " · 对焦："+(s.focusMode||"自动/未知")+
 " · 解码宽度："+decodeWidth;

 ["z1","z15","z2","torch","auto"].forEach(id=>$(id).classList.add("hidden"));

 if(!running)return;

 if(c.torch===true)$("torch").classList.remove("hidden");

 if(c.zoom){
  [["z1",1],["z15",1.5],["z2",2]].forEach(([id,v])=>{
   if(v>=c.zoom.min&&v<=c.zoom.max){
    $(id).classList.remove("hidden");
   }
  });
 }
}

async function advanced(data){
 const token=session,activeTrack=track;
 if(!track)return false;
 try{
  await activeTrack.applyConstraints({advanced:[data]});
  if(token!==session||!layer)return false;
  refresh();
  return true;
 }catch(e){
  return false;
 }
}

async function zoom(v){
 const token=session;
 if(!await advanced({zoom:v})&&layer&&token===session){
  status("Safari 不支持当前变焦倍率");
 }
}

async function optimize(){
 const token=session;
 const c=caps();

 if(Array.isArray(c.focusMode)&&c.focusMode.includes("continuous")){
  await advanced({focusMode:"continuous"});
 }

 if(token!==session||!layer)return;
 if(c.zoom&&c.zoom.min<=2&&c.zoom.max>=2){
  await advanced({zoom:2});
 }

 refresh();
}

function makeRotated(source,angle){
 const w=source.width,h=source.height;

 if(angle===90||angle===270){
  rotated.width=h;
  rotated.height=w;
 }else{
  rotated.width=w;
  rotated.height=h;
 }

 rctx.setTransform(1,0,0,1,0,0);
 rctx.clearRect(0,0,rotated.width,rotated.height);
 rctx.translate(rotated.width/2,rotated.height/2);
 rctx.rotate(angle*Math.PI/180);
 rctx.drawImage(source,-w/2,-h/2);
 rctx.setTransform(1,0,0,1,0,0);

 return rotated;
}

function decodeCanvas(source){
 const luminance=new ZXing.HTMLCanvasElementLuminanceSource(source);
 const bitmap=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
 return reader.decodeWithState(bitmap);
}

function getScanAngles(){
 if(decodeFailures<5){
  return [preferredAngle];
 }

 const others=angles.filter(a=>a!==preferredAngle);
 const alternate=others[Math.floor(decodeFailures/5)%others.length];

 return [preferredAngle,alternate];
}

function updatePerformance(ms){
 averageDecodeMs=averageDecodeMs
  ?averageDecodeMs*.85+ms*.15
  :ms;

 let next=decodeWidth;

 if(averageDecodeMs>200&&decodeWidth>960){
  next=960;
 }else if(averageDecodeMs<70&&decodeWidth<1600){
  next=Math.min(1600,decodeWidth+160);
 }

 if(next!==decodeWidth){
  decodeWidth=next;
  refresh();
 }
}

function estimateSharpness(source){
 const w=source.width,h=source.height;
 const data=ctx.getImageData(0,0,w,h).data;

 let sum=0,n=0;

 for(let y=6;y<h-6;y+=16){
  for(let x=6;x<w-10;x+=16){
   const i=(y*w+x)*4;
   const j=(y*w+x+5)*4;

   const a=data[i]*.299+data[i+1]*.587+data[i+2]*.114;
   const b=data[j]*.299+data[j+1]*.587+data[j+2]*.114;

   sum+=Math.abs(a-b);
   n++;
  }
 }

 return n?sum/n:0;
}

function checkQuality(){
 const score=estimateSharpness(canvas);

 if(score<5){
  qualityBadCount++;
 }else{
  qualityBadCount=0;
 }

 if(qualityBadCount>=3){
  $("quality").textContent="画面可能偏模糊，请稍微调整距离并保持稳定";
  $("quality").className="warning";
 }else if(score>=5){
  $("quality").textContent="画面清晰度参考：正常";
  $("quality").className="good";
 }
}

function scanLoop(token){
 if(token!==loopId||!running||paused)return;
 const schedule=callback=>video?.requestVideoFrameCallback?video.requestVideoFrameCallback(callback):requestAnimationFrame(callback);
 schedule(async()=>{
  if(token!==loopId||!running||paused)return;
  if(processing||video.readyState<2||!video.videoWidth){scanLoop(token);return;}
  const now=performance.now();if(now-lastDecodeTime<130){scanLoop(token);return;}lastDecodeTime=now;processing=true;
  const own=session,abort=new AbortController();decodeAbort=abort;
  try{
   const full=++frameNumber%4===0,box=video.parentElement.getBoundingClientRect();
   const roi=full?{x:0,y:0,width:video.videoWidth,height:video.videoHeight}:root.WarehouseV6Pixels.coverROI(video.videoWidth,video.videoHeight,box.width,box.height);
   const scale=Math.min(1,full?1600/roi.width:1920/roi.width);canvas.width=Math.max(1,Math.round(roi.width*scale));canvas.height=Math.max(1,Math.round(roi.height*scale));
   ctx.drawImage(video,roi.x,roi.y,roi.width,roi.height,0,0,canvas.width,canvas.height);
   const rows=await root.WarehouseV6.decode(canvas,{signal:abort.signal,heavy:decodeFailures>0&&frameNumber%4===0});
   if(own!==session||token!==loopId||!layer)return;if(!isCurrent()){closeScanner();return;}
   $('info').textContent='V6 '+(full?'全画面':'框内原像素')+' · '+canvas.width+'×'+canvas.height+' · '+Math.round(performance.now()-now)+'ms';
   if(rows.length===1){const r=rows[0];if(r.enhanced){confirmationCount=confirmedText===r.text?confirmationCount+1:1;confirmedText=r.text;if(confirmationCount<2){status('已发现候选条码，请保持稳定确认');return;}}
    const names={Code128:'CODE_128',Code39:'CODE_39',EAN13:'EAN_13',QRCode:'QR_CODE',ITF:'ITF'};const format=names[r.format]||r.format;success({getText:()=>r.text,getBarcodeFormat:()=>root.ZXing.BarcodeFormat[format]??format},0);
   }else{decodeFailures++;
    const candidate=rows.box,stable=candidate&&lastZoomBox&&Math.abs(candidate.x/canvas.width-lastZoomBox.x)<.07&&Math.abs(candidate.y/canvas.height-lastZoomBox.y)<.07;
    const next=autoZoom&&stable?root.WarehouseV6Pixels.nextZoom(caps(),settings(),candidate,canvas.width,canvas.height,decodeFailures,performance.now()-lastAutoZoom):null;
    lastZoomBox=candidate?{x:candidate.x/canvas.width,y:candidate.y/canvas.height}:null;
    if(next!==null&&next!==false){lastAutoZoom=performance.now();if(await advanced({zoom:next}))status('已调整设备倍率，请保持条码在框内');}
    if(rows.length>1)status('发现多个条码，请把需要的单号移到框内');}
  }catch(error){if(error.name!=='AbortError'&&own===session&&layer){decodeFailures++;status('识别暂未完成：'+error.message+'；可切回 V5');}}
  finally{if(own===session&&token===loopId){processing=false;if(decodeAbort===abort)decodeAbort=null;scanLoop(token);}}
 });
}
})(window);
