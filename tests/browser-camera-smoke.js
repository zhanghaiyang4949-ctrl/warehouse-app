(async()=>{
 const matrix=new ZXing.QRCodeWriter().encode('001-V5-SAFARI',ZXing.BarcodeFormat.QR_CODE,480,480,new Map());
 const barcode=document.createElement('canvas');barcode.width=480;barcode.height=480;const c=barcode.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,480,480);c.fillStyle='#000';for(let y=0;y<480;y++)for(let x=0;x<480;x++)if(matrix.get(x,y))c.fillRect(x,y,1,1);
 const originalMedia=navigator.mediaDevices.getUserMedia,originalDraw=CanvasRenderingContext2D.prototype.drawImage;let stopped=0,received=[];
 navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){stopped++}}],getVideoTracks:()=>[{getSettings:()=>({width:480,height:480}),getCapabilities:()=>({})}]});
 CanvasRenderingContext2D.prototype.drawImage=function(source,...args){return originalDraw.call(this,source instanceof HTMLVideoElement?barcode:source,...args)};
 try{
  showPage('in');
  for(let i=0;i<10;i++){
   V5Scanner.openScanner({mode:'single',isCurrent:()=>true,onResult:r=>received.push(r.text)});
   const video=document.querySelector('.v5-scanner-layer video');Object.defineProperties(video,{videoWidth:{get:()=>480},videoHeight:{get:()=>480},readyState:{get:()=>4},srcObject:{writable:true,value:null}});video.play=async()=>{};video.pause=()=>{};
   await V5Scanner.startScanner();
   const until=Date.now()+5000;while(V5Scanner.isOpen()&&Date.now()<until)await new Promise(r=>setTimeout(r,30));if(V5Scanner.isOpen())throw Error('decode timed out');
  }
  return {actualQRDecodes:received.length,resultsCorrect:received.every(x=>x==='001-V5-SAFARI'),tracksStopped:stopped,open:V5Scanner.isOpen()};
 }finally{V5Scanner.closeScanner();navigator.mediaDevices.getUserMedia=originalMedia;CanvasRenderingContext2D.prototype.drawImage=originalDraw}
})()

