const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const html=fs.readFileSync('index.html','utf8'),original=cp.execFileSync('git',['show','40c9302b6139c008d5f1cc36743921ce5df81f53:index.html'],{encoding:'utf8',maxBuffer:2e6});
const scripts=s=>[...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(x=>! /\bsrc\s*=/.test(x[1])).map(x=>x[2].replace(/\r\n/g,'\n').replace(/[ \t]+(?=\r?$)/gm,''));
test('原业务脚本仅增加服务器读取状态通知，数据协议和同步逻辑不变',()=>{
 const publish="function publish(value){window.dispatchEvent(new CustomEvent('warehouse-remote-backup',{detail:{key:k,sha:value.sha,exportedAt:value.exportedAt||''}}));return value}";
 const restored=html.replace(publish,'').replaceAll('return publish(remoteCache)','return remoteCache').replace("return publish({sha:'',db:null,exportedAt:''})","return {sha:'',db:null,exportedAt:''}");
 assert.deepEqual(scripts(restored),scripts(original));
});
function fn(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);let at=source.indexOf('{',start),n=1,i=at+1;for(;n;i++){if(source[i]==='{')n++;if(source[i]==='}')n--}return source.slice(start,i)}
const demo=fs.readFileSync('docs/v5-demo-original.html','utf8'),engine=fs.readFileSync('assets/scanner/scanner.js','utf8');
for(const name of ['validEAN13','makeRotated','decodeCanvas','getScanAngles','updatePerformance','estimateSharpness','checkQuality','scanLoop'])test('沿用 V5 原算法 '+name,()=>assert.equal(fn(engine,name),fn(demo,name)));
test('只新增统一引擎，不依赖 BarcodeDetector 或远程 CDN',()=>{assert.equal((html.match(/src="assets\/scanner\/scanner.js"/g)||[]).length,1);assert.ok(!engine.includes('BarcodeDetector'));assert.ok(!engine.includes('https://'));assert.ok(fs.statSync('assets/scanner/vendor/zxing-0.21.3.min.js').size>300000)});
