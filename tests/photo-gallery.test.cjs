const test=require('node:test');
const assert=require('node:assert/strict');
const gallery=require('../assets/photo-gallery.js');

test('swipes require a deliberate horizontal gesture and preserve zoom',()=>{
 const start={x:100,y:100};
 assert.equal(gallery.swipeDirection(start,{x:40,y:110}),1);
 assert.equal(gallery.swipeDirection(start,{x:160,y:110}),-1);
 for(const end of [{x:70,y:100},{x:30,y:170}])assert.equal(gallery.swipeDirection(start,end),0);
 assert.equal(gallery.swipeDirection(start,{x:0,y:100},{multitouch:true}),0);
 assert.equal(gallery.swipeDirection(start,{x:0,y:100},{scale:1.2}),0);
});

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.events=new Map();this.isConnected=true;}
 setAttribute(key,value){this[key]=value;}
 removeAttribute(key){delete this[key];}
 append(...children){this.children.push(...children);}
 addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
 removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
 remove(){this.isConnected=false;}
 focus(){global.document.activeElement=this;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('late resolutions cannot replace selection or closed viewer; teardown restores overflow',async()=>{
 const doc=new Element('document');doc.body=new Element('body');doc.body.style.overflow='scroll';doc.createElement=tag=>new Element(tag);global.document=doc;
 const pending=[];let closes=0;
 const handle=gallery.open({records:[{id:'a',note:'first'},{id:'b',note:'second'}],loadImage:record=>new Promise((resolve,reject)=>pending.push({record,resolve,reject})),onClose:()=>closes++});
 const image=handle.element.children.find(el=>el.tagName==='img');
 handle.select(1);pending[1].resolve('blob:second');await tick();
 assert.equal(image.src,'blob:second');assert.equal(handle.index,1);
 pending[0].resolve('blob:first');await tick();assert.equal(image.src,'blob:second');
 handle.select(0);assert.equal(image.hidden,true);
 gallery.close();pending[2].resolve('blob:late');await tick();
 assert.equal(image.src,undefined);assert.equal(doc.body.style.overflow,'scroll');assert.equal(closes,1);
 assert.equal([...doc.events.values()].reduce((sum,set)=>sum+set.size,0),0);
 assert.equal([...handle.element.events.values()].reduce((sum,set)=>sum+set.size,0),0);
 handle.close();assert.equal(closes,1);delete global.document;
});

test('horizontal photo follows finger, insufficient swipe springs back, and successful swipe selects next',async()=>{
 const doc=new Element('document');doc.body=new Element('body');doc.createElement=tag=>new Element(tag);global.document=doc;const handle=gallery.open({records:[{id:'a'},{id:'b'}],loadImage:async row=>'blob:'+row.id});await tick();const layer=handle.element,image=layer.children.find(x=>x.tagName==='img');
 const dispatch=(type,x)=>{for(const fn of layer.events.get(type)||[])fn({target:image,touches:type==='touchend'?[]:[{clientX:x,clientY:100}],changedTouches:[{clientX:x,clientY:100}],cancelable:true,preventDefault(){}});};dispatch('touchstart',200);dispatch('touchmove',175);assert.ok(image.style.transform.includes('-25px'));dispatch('touchend',175);assert.equal(handle.index,0);assert.equal(image.style.transform,'');dispatch('touchstart',200);dispatch('touchmove',100);assert.ok(image.style.transform.includes('-100px'));dispatch('touchend',100);assert.equal(handle.index,1);handle.close();delete global.document;
});

test('outgoing frame stays offscreen until removed; incoming stays hidden until its own load event',async()=>{
 const doc=new Element('document');doc.body=new Element('body');doc.createElement=tag=>new Element(tag);global.document=doc;const handle=gallery.open({records:[{id:'a'},{id:'b'}],loadImage:async row=>'blob:'+row.id});await tick();const image=handle.element.children.find(x=>x.tagName==='img');assert.equal(image.hidden,true);image.onload();assert.equal(image.hidden,false);
 const captures=[];image.naturalWidth=100;image.getBoundingClientRect=()=>({left:10,top:20,width:100,height:100});image.cloneNode=()=>{const node=new Element('img');node.animate=(frames,options)=>{captures.push(options);return {cancel(){}};};return node;};await handle.select(1,1);assert.equal(captures[0].fill,'forwards');assert.equal(image.hidden,true);image.onload();assert.equal(image.hidden,false);handle.close();delete global.document;
});
