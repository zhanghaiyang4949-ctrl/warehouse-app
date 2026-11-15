const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {format}=require('../assets/tracking-display');
test('纯数字从右每四位分组，保留前导零及不足四位的前组',()=>{
 for(const [input,output]of [['888877775555','8888-7777-5555'],['12345','1-2345'],['1234567890','12-3456-7890'],['000012345678','0000-1234-5678'],['1234','1234'],['123','123'],['','']])assert.equal(format(input),output);
});
test('包含中文英文和符号的单号原样显示，不重复加分隔符',()=>{
 for(const input of ['车入suki261112','cherubsuki261112','AB1234567890','8888-7777-5555','TEMP-20261116-AB12','123 45678','123/45678'])assert.equal(format(input),input);
});
test('两个网页使用同一份显示规则，输入匹配与导出不通过显示格式化',()=>{
 assert.equal(fs.readFileSync('assets/tracking-display.js','utf8'),fs.readFileSync('../warehouse-query/assets/tracking-display.js','utf8'));
 const source=fs.readFileSync('index.html','utf8'),match=source.match(/function formatTrackingDisplayW96\(value\)\{([\s\S]*?)\n\}/);assert.ok(match);
 const inline=new Function('value',match[1]);for(const value of ['888877775555','000012345678','车入suki261112','AB1234567890','8888-7777-5555'])assert.equal(inline(value),format(value));
});
