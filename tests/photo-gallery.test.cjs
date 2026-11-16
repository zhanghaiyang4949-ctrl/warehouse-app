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
