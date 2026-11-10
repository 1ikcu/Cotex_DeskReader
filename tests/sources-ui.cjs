const {_electron:electron,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');fs.mkdirSync(results,{recursive:true});
(async()=>{
 const env={...process.env,COTEX_DATA:path.join(results,'sources-ui-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root],env,timeout:45000});
 try{
  const p=await app.firstWindow();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('.chapter .prose');
  await p.keyboard.press('Control+k');
  for(const name of ['全部书源','公版名著','菠萝包轻小说','17K小说网','纵横中文网','维基文库'])await expect(p.getByRole('button',{name,exact:true})).toBeVisible();
  await p.getByRole('button',{name:'17K小说网',exact:true}).click();await expect(p.locator('.library-book.online')).toHaveCount(20,{timeout:35000});
  await p.getByRole('button',{name:'加载更多',exact:true}).click();await expect(p.locator('.library-book.online')).toHaveCount(40,{timeout:35000});
  const input=p.getByRole('textbox',{name:'搜索书名或作者'});await input.fill('九星霸体诀');await input.press('Enter');
  const row=p.locator('.library-book.online').filter({has:p.getByText('九星霸体诀',{exact:true})});await expect(row).toBeVisible({timeout:35000});
  await expect(row.locator('.vip-badge')).toHaveText('VIP',{timeout:35000});
  await p.screenshot({path:path.join(results,'vip-search.png')});
  await row.getByRole('button',{name:'加入',exact:true}).click();await expect(p.getByRole('dialog')).toHaveCount(0,{timeout:40000});await expect(p.locator('.chapter .prose').first()).toBeVisible({timeout:35000});
  await p.getByRole('textbox',{name:'搜索章节',exact:true}).fill('第一章 丹帝记忆');await p.getByRole('textbox',{name:'搜索章节',exact:true}).press('Enter');await expect(p.locator('.chapter .prose').first()).toContainText('龙尘',{timeout:35000});
  await p.keyboard.press('Control+d');await expect(p.locator('.toast')).toContainText('书签');
  const chapterBefore=await p.locator('.chapter').first().getAttribute('id');
  await p.getByRole('button',{name:'更新目录',exact:true}).click();await expect(p.locator('.toast')).toContainText('目录已更新',{timeout:35000});
  await expect(p.locator('.chapter').first()).toHaveAttribute('id',chapterBefore);await expect(p.locator('.chapter .prose').first()).toContainText('龙尘');
  const state=await p.evaluate(async()=>{const d=await window.desk.state();const b=await window.desk.open(d.activeId);return {source:b.source.id,bookmarks:b.bookmarks.length,cached:b.chapters.filter(c=>c.paragraphs).length};});
  expect(state.source).toBe('17k');expect(state.bookmarks).toBe(1);expect(state.cached).toBeGreaterThan(0);
  await p.keyboard.press('Control+k');await p.getByRole('button',{name:'全部书源',exact:true}).click();await expect(p.locator('.loading-state')).toHaveCount(0,{timeout:45000});expect(await p.locator('.library-book.online').count()).toBeGreaterThan(50);
  await p.screenshot({path:path.join(results,'expanded-library.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,650));
  for(const name of ['全部书源','17K小说网','纵横中文网','维基文库'])await expect(p.getByRole('button',{name,exact:true})).toBeVisible();
  expect(await p.locator('.modal').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
  await p.screenshot({path:path.join(results,'expanded-library-narrow.png')});expect(errors).toEqual([]);
  console.log('PASS: all source tabs, live pagination/search/add/read/bookmark, aggregate discovery, 720px layout.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
