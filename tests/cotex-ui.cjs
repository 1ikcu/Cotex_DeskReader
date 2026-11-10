const {_electron:electron,expect} = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
fs.mkdirSync(results,{recursive:true});
const data = path.join(results, 'cotex-ui-'+Date.now());
const errors = [];

async function launch() {
  const env = {...process.env,COTEX_DATA:data};
  delete env.ELECTRON_RUN_AS_NODE;
  const a = await electron.launch({args:[root],env});
  const p = await a.firstWindow();
  p.on('pageerror',e=>errors.push(e.message));
  await p.waitForSelector('.chapter .prose');
  return {a,p};
}

(async()=>{
  let {a,p} = await launch();
  try {
    await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1340,760));
    await expect(p).toHaveTitle('Cotex');
    await expect(p.locator('.brand')).toHaveText('Codex');
    await expect(p.locator('.sidebar-footer,.composer-caption')).toHaveCount(0);
    const metrics = await p.evaluate(()=>{
      const css = s=>getComputedStyle(document.querySelector(s));
      const bounds = s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,font:css('.chapter').fontSize,brand:css('.brand').fontSize,sidebar:bounds('.sidebar'),rail:bounds('.rail'),composer:bounds('.composer'),column:bounds('.reading-column'),bubble:css('.user-message>span').backgroundColor};
    });
    expect(metrics.font).toBe('14px');
    expect(metrics.brand).toBe('18px');
    expect(metrics.sidebar.width).toBe(238.5);
    expect(metrics.rail.width).toBe(50);
    expect(metrics.composer.width).toBe(736);
    expect(metrics.bubble).toBe('rgb(231, 242, 255)');
    expect(Math.abs(metrics.composer.x-metrics.column.x)).toBeLessThan(1);
    await p.getByRole('textbox',{name:'搜索章节',exact:true}).fill('第十六回');
    await p.getByRole('textbox',{name:'搜索章节',exact:true}).press('Enter');
    await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-15');
    await expect(p.getByRole('progressbar')).toHaveAttribute('aria-valuenow','15');
    await p.locator('.conversation').hover();
    await p.mouse.wheel(0,700);
    await expect.poll(async()=>+(await p.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(15);
    const scrollProgress = +(await p.getByRole('progressbar').getAttribute('aria-valuenow'));
    await p.locator('.reading-progress').click();
    await expect(p.locator('.toc-panel')).toBeVisible();
    await p.getByRole('button',{name:'关闭目录',exact:true}).click();
    await p.getByRole('button',{name:'收起正文 16',exact:true}).click();
    await expect(p.locator('.toast')).toHaveCount(0,{timeout:5000});
    await p.screenshot({path:path.join(results,'cotex-reference-size.png')});
    // Wider screens keep the same typography and column scale.
    await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1820,940));
    expect(await p.locator('.brand').evaluate(el=>getComputedStyle(el).fontSize)).toBe('18px');
    expect(await p.locator('.chapter').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('14px');
    expect((await p.locator('.composer').boundingBox()).width).toBe(736);
    for (const width of [800,720]) {
      await a.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,650),width);
      await expect(p.locator('.reading-progress')).toBeVisible();
      expect(await p.locator('.main').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
      expect(await p.locator('.composer').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
      await p.screenshot({path:path.join(results,'cotex-narrow-'+width+'.png')});
    }
    await p.getByRole('button',{name:'阅读设置',exact:true}).click();
    await p.getByLabel('外观',{exact:true}).selectOption('dark');
    await p.keyboard.press('Escape');
    await p.screenshot({path:path.join(results,'cotex-dark.png')});
    await p.getByRole('button',{name:'阅读设置',exact:true}).click();
    await p.getByLabel('外观',{exact:true}).selectOption('light');
    await p.keyboard.press('Escape');
    await a.close();
    ({a,p}=await launch());
    await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-15');
    const restored = +(await p.getByRole('progressbar').getAttribute('aria-valuenow'));
    expect(restored).toBeGreaterThanOrEqual(15);
    expect(errors).toEqual([]);
    fs.writeFileSync(path.join(results,'cotex-validation.json'),JSON.stringify({metrics,scrollProgress,restored,errors},null,2));
    console.log('PASS: reference dimensions, blue bubbles, circular progress, scrolling, chapter jump, restart, dark mode, 720/800/1820 widths.');
    console.log(JSON.stringify(metrics));
  } finally {await a.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
