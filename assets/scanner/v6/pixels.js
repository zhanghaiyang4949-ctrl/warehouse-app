(function(root){
 'use strict';
 function coverROI(vw,vh,cw,ch,inset=.12){
  if(![vw,vh,cw,ch].every(x=>Number.isFinite(x)&&x>0))throw Error('无有效视频尺寸');
  const scale=Math.max(cw/vw,ch/vh),ox=(cw-vw*scale)/2,oy=(ch-vh*scale)/2;
  const x=Math.max(0,Math.floor((cw*inset-ox)/scale)),y=Math.max(0,Math.floor((ch*inset-oy)/scale));
  return {x,y,width:Math.min(vw-x,Math.ceil(cw*(1-2*inset)/scale)),height:Math.min(vh-y,Math.ceil(ch*(1-2*inset)/scale))};
 }
 function contrast(data){
  const histogram=new Uint32Array(256),gray=new Uint8Array(data.length/4);for(let i=0;i<gray.length;i++){const j=i*4;gray[i]=(data[j]*77+data[j+1]*150+data[j+2]*29)>>8;histogram[gray[i]]++;}
  let low=0,high=255,sum=0;for(;low<255;low++){sum+=histogram[low];if(sum>=gray.length*.02)break;}sum=0;for(;high>0;high--){sum+=histogram[high];if(sum>=gray.length*.02)break;}
  const output=new Uint8ClampedArray(data.length);for(let i=0;i<gray.length;i++){const value=high-low>=12?(gray[i]-low)*255/(high-low):gray[i],j=i*4;output[j]=output[j+1]=output[j+2]=value;output[j+3]=255;}return output;
 }
 function unique(rows){const found=new Map();for(const row of rows||[]){if(row&&typeof row.text==='string'&&row.text.trim()&&!row.error&&row.isValid!==false&&!found.has(row.text))found.set(row.text,row);}return [...found.values()];}
 function stripeBox(data,width,height){
  let left=width,right=0,top=height,bottom=0,hits=0,dxTotal=0,dyTotal=0;
  const gray=i=>(data[i]*77+data[i+1]*150+data[i+2]*29)>>8;
  for(let y=3;y<height-3;y+=6)for(let x=3;x<width-3;x+=6){const i=(y*width+x)*4,dx=Math.abs(gray(i-8)-gray(i+8)),dy=Math.abs(gray(i-width*8)-gray(i+width*8));if(dx>40&&dx>dy*2){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);hits++;dxTotal+=dx;dyTotal+=dy;}}
  if(hits<30||right-left<30||bottom-top<15||dxTotal/(dyTotal+1)<3)return null;
  return {x:left,y:top,width:right-left,height:bottom-top};
 }
 function nextZoom(capabilities,settings,box,width,height,failures,elapsed){
  const c=capabilities.zoom,z=settings.zoom;if(!c||!Number.isFinite(z)||!box||failures<8||elapsed<2500)return null;
  const cx=(box.x+box.width/2)/width,cy=(box.y+box.height/2)/height;if(cx<.3||cx>.7||cy<.3||cy>.7||box.width/width>=.32||box.height/height>=.65)return null;
  const step=c.step||.1,next=Math.min(c.max,2.5,Math.round((z+.2)/step)*step);return next>z+.05?next:null;
 }
 const api={coverROI,contrast,unique,stripeBox,nextZoom};if(typeof module==='object'&&module.exports)module.exports=api;else root.WarehouseV6Pixels=api;
})(typeof self==='undefined'?globalThis:self);
