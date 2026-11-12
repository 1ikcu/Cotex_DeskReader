const {_electron:electron,expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const {version} = require('../package.json');
const exe = process.argv[2];
if (!exe) throw new Error('Pass the packaged Cotex executable path');
const data = path.join(root,'test-results','packaged-'+Date.now());
const original = path.resolve(root,'../original-data-backup');
fs.mkdirSync(data,{recursive:true});
const hasOriginal = fs.existsSync(path.join(original,'library.json'))&&fs.existsSync(path.join(original,'books'));
if(hasOriginal){
 fs.copyFileSync(path.join(original,'library.json'),path.join(data,'library.json'));
 fs.cpSync(path.join(original,'books'),path.join(data,'books'),{recursive:true});
}
const before = hasOriginal?JSON.parse(fs.readFileSync(path.join(data,'library.json'))):null;
(async()=>{
 const env={...process.env,COTEX_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const a=await electron.launch({executablePath:exe,env,timeout:45000});
 try {
  const p=await a.firstWindow();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.waitForSelector('.chapter');
  await expect(p).toHaveTitle('Cotex');
  await expect(p.locator('.brand')).toHaveText('Codex');
  const state=await p.evaluate(()=>window.desk.state());
  expect(state.books.length).toBeGreaterThan(0);
  expect(state.activeId).toBeTruthy();
  expect(state.settings.fontSize).toBe(14);
  if(before){
   expect(state.books.length).toBe(before.books.length);
   expect(state.activeId).toBe(before.activeId);
   const activeBefore=before.books.find(b=>b.id===before.activeId);
   await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-'+activeBefore.progress.chapter);
  }
  await p.getByTitle('关于 Cotex',{exact:true}).click();
  await expect(p.getByRole('dialog')).toContainText(version);
  expect(await p.locator('.app-logo').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await p.getByRole('button',{name:'知道了'}).click();
  const info=await a.evaluate(({app,BrowserWindow})=>({name:app.getName(),version:app.getVersion(),packaged:app.isPackaged,zoom:BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()}));
  expect(info).toEqual({name:'Cotex',version,packaged:true,zoom:1});
  expect(errors).toEqual([]);
  await p.screenshot({path:path.join(root,'test-results',`cotex-${version}-packaged.png`)});
  console.log('PASS: packaged binary, seeded library, icon and branding'+(before?', original library migration and reading position':'')+'. '+JSON.stringify(info));
 } finally {await a.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
