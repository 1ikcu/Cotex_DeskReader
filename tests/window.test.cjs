const test=require('node:test'),assert=require('node:assert/strict');
const {fitBounds}=require('../electron/window-state.cjs');
const primary={workArea:{x:0,y:0,width:1600,height:900}};
test('window defaults match reference and existing positions survive',()=>{
 assert.deepEqual(fitBounds(null,[primary],primary),{x:130,y:70,width:1340,height:760,maximized:false});
 assert.deepEqual(fitBounds({x:40,y:60,width:1000,height:700,maximized:true},[primary],primary),{x:40,y:60,width:1000,height:700,maximized:true});
});
test('removed displays and invalid bounds recover onto an available screen',()=>{
 const off=fitBounds({x:-5000,y:-2000,width:2000,height:1000},[primary],primary);
 assert.deepEqual(off,{x:0,y:0,width:1600,height:900,maximized:false});
 assert.equal(fitBounds({x:0,y:0,width:NaN,height:700},[primary],primary).width,1340);
 const left={workArea:{x:-1280,y:0,width:1280,height:720}};
 assert.deepEqual(fitBounds({x:-1200,y:20,width:1000,height:650},[left,primary],primary),{x:-1200,y:20,width:1000,height:650,maximized:false});
});
