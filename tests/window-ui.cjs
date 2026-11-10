const {_electron:electron,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),data=path.join(root,'test-results','window-'+Date.now());
async function launch(){const env={...process.env,COTEX_DATA:data};delete env.ELECTRON_RUN_AS_NODE;const a=await electron.launch({args:[root],env});const p=await a.firstWindow();await p.waitForSelector('.chapter');return {a,p};}
(async()=>{let {a,p}=await launch();try{
 const initial=await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());expect(initial.width).toBe(1340);expect(initial.height).toBe(760);
 await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({x:60,y:40,width:1120,height:710}));
 await expect.poll(()=>a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds())).toEqual({x:60,y:40,width:1120,height:710});
 await a.close();({a,p}=await launch());
 expect(await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds())).toEqual({x:60,y:40,width:1120,height:710});
 await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].maximize());
 await expect.poll(()=>a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
 await a.close();({a,p}=await launch());
 expect(await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
 await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].unmaximize());
 await expect.poll(()=>a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds())).toEqual({x:60,y:40,width:1120,height:710});
 console.log('PASS: initial 1340x760, saved size/position, maximized restart and restored normal bounds');
 }finally{await a.close().catch(()=>{});}})().catch(e=>{console.error(e);process.exitCode=1});
