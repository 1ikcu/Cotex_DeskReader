const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');fs.mkdirSync(results,{recursive:true});
const env={...process.env,COTEX_DATA:path.join(results,'collapse-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
(async()=>{const a=await electron.launch({args:[root],env});try{
 const p=await a.firstWindow();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('.chapter .prose');
 for(const index of [0,1,99]){
  if(index===1)await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,650));
  if(index!==0){const input=p.getByRole('textbox',{name:'搜索章节',exact:true});await input.fill(String(index+1));await input.press('Enter');await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-'+index);}
  const section=p.locator('#chapter-'+index),footer=section.getByRole('button',{name:'收起本章',exact:true});
  await footer.scrollIntoViewIfNeeded();await p.waitForTimeout(800);
  const before=await p.evaluate(async()=>{const s=await window.desk.state();return s.books.find(b=>b.id===s.activeId).progress;});
  await footer.click();await expect(section).toHaveClass(/collapsed/);await p.waitForTimeout(250);
  const offset=await section.locator('.thought-line').evaluate(el=>el.getBoundingClientRect().top-document.querySelector('.conversation').getBoundingClientRect().top);
  expect(offset,'collapsed chapter '+index+' must remain near the top of the reader').toBeGreaterThanOrEqual(0);
  expect(offset).toBeLessThan(80);
  const after=await p.evaluate(async()=>{const s=await window.desk.state();return s.books.find(b=>b.id===s.activeId).progress;});
  expect(after,'collapse must preserve the saved reading position').toEqual(before);
  await section.getByRole('button',{name:'展开正文 '+(index+1),exact:true}).click();await expect(section).not.toHaveClass(/collapsed/);await p.waitForTimeout(250);
  expect(await section.locator('.thought-line').evaluate(el=>el.getBoundingClientRect().top-document.querySelector('.conversation').getBoundingClientRect().top)).toBeLessThan(80);
  await section.getByRole('button',{name:'收起正文 '+(index+1),exact:true}).click();await expect(section).toHaveClass(/collapsed/);
  await p.screenshot({path:path.join(results,'collapse-fixed-'+index+'.png')});
 }
 expect(errors).toEqual([]);console.log('PASS: chapter-end collapse, expansion and repeat collapse retain the chapter and saved position; middle/final chapters and 800px window.');
 }finally{await a.close();}})().catch(e=>{console.error(e);process.exitCode=1});
