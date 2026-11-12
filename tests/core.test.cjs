const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const iconv=require('iconv-lite');const JSZip=require('jszip');
const {parseTXT,parseEPUB,finalizeBook,chapterMatches,simplify,htmlText}=require('../electron/core.cjs');
const {Store}=require('../electron/store.cjs');
const {Sources}=require('../electron/sources.cjs');
const fixture='第一章 初见\n天地之间，一盏灯亮了。\n窗外的雨终于停了。\n\n第二章 远行\n她收好行囊，沿着山路出发。\n\n第十二章 归来\n许多年以后，灯光依旧。\n';
test('UTF-8 / GB18030 / UTF-16 retain full chapter text',()=>{
 for(const encoding of ['utf8','gb18030','utf16-le','utf16-be']){
  const buf=encoding.startsWith('utf16')?iconv.encode('\uFEFF'+fixture,encoding):iconv.encode(fixture,encoding);
  const b=parseTXT(buf,'测试.txt');assert.equal(b.chapters.length,3);assert.equal(b.chapters[0].paragraphs[0],'天地之间，一盏灯亮了。');assert.match(b.chapters[2].paragraphs[0],/灯光依旧/);
 }
});
test('numeric / Chinese / title chapter search ranks actual chapter number above position',()=>{
 const {chapters}=parseTXT(Buffer.from(fixture),'测试.txt');
 assert.equal(chapterMatches(chapters,'12')[0].index,2);assert.equal(chapterMatches(chapters,'第十二章')[0].index,2);assert.equal(chapterMatches(chapters,'归来')[0].index,2);assert.equal(chapterMatches(chapters,'初见')[0].index,0);assert.deepEqual(chapterMatches(chapters,'无此章节'),[]);
});
test('no headings: auto segments without dropping any content',()=>{
 const text='春天来了。'.repeat(4000);const b=parseTXT(Buffer.from(text),'长文.txt');assert.ok(b.chapters.length>1);assert.equal(b.chapters.flatMap(c=>c.paragraphs).join(''),text);assert.throws(()=>parseTXT(Buffer.from(''),'empty.txt'));
});
test('public domain bundled books parse with complete chapters',()=>{
 const expected={journey:100,redchamber:120,threekingdoms:120,watermargin:70};
 for(const [name,min] of Object.entries(expected)){const b=parseTXT(fs.readFileSync(path.join(__dirname,'../assets/'+name+'.txt')),name+'.txt',{gutenberg:true,wrapped:true});assert.ok(b.chapters.length>=min, name+' chapters '+b.chapters.length);assert.ok(b.chapters[0].paragraphs.length);assert.ok(!b.chapters.at(-1).paragraphs.join('').includes('END OF THE PROJECT GUTENBERG'));}
});
test('EPUB spine order, metadata, HTML stripping and entities',async()=>{
 const zip=new JSZip();zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>');
 zip.file('OEBPS/book.opf','<package><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">测试 EPUB</dc:title><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">测试作者</dc:creator></metadata><manifest><item id="b" href="b.xhtml"/><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
 zip.file('OEBPS/a.xhtml','<html><body><h1>第一章 开始</h1><p>这是一段可读的正文&amp;符号。</p><script>alert(1)</script></body></html>');
 zip.file('OEBPS/b.xhtml','<html><body><h1>第二章 后来</h1><p>这是第二章的完整内容，不可丢失。</p></body></html>');
 const buf=await zip.generateAsync({type:'nodebuffer'});const b=await parseEPUB(buf,'test.epub');
 assert.equal(b.title,'测试 EPUB');assert.equal(b.author,'测试作者');assert.equal(b.chapters.length,2);assert.equal(b.chapters[0].title,'第一章 开始');assert.match(b.chapters[0].paragraphs.join(''),/&符号/);assert.doesNotMatch(b.chapters[0].paragraphs.join(''),/alert/);
});
test('HTML remains plain text and scripts are never preserved',()=>{assert.equal(htmlText('<p>hello</p><script>bad()</script><p>&lt;ok&gt;</p>'),'hello\n<ok>');assert.equal(simplify('紅樓夢'),'红楼梦');});
test('progress/bookmarks/collapse survive restart without rewriting large book',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'deskreader-test-'));const s=new Store(root);const b=finalizeBook(parseTXT(Buffer.from(fixture),'测试.txt'),'fixture');
 s.add(b);const stat=fs.statSync(s.file(b.id));s.patch(b.id,{progress:{chapter:2,paragraph:0},bookmarks:[{chapter:1,paragraph:0}],collapsed:[0],alias:'日报汇总'});
 const next=new Store(root);const loaded=next.get(b.id);assert.equal(loaded.progress.chapter,2);assert.equal(loaded.bookmarks[0].chapter,1);assert.deepEqual(loaded.collapsed,[0]);assert.equal(loaded.alias,'日报汇总');assert.equal(fs.statSync(s.file(b.id)).mtimeMs,stat.mtimeMs);
 assert.equal(next.add(b).progress.chapter,2);assert.equal(next.db.books.length,1);
 next.remove(b.id);assert.equal(next.db.books.length,0);assert.ok(fs.readdirSync(path.join(root,'trash')).length);
});
test('source failures are surfaced instead of returning fake results',async()=>{
 const s=new Sources(async()=>new Response('bad',{status:503}));await assert.rejects(s.search('sfacg','test'),/503/);await assert.rejects(s.add('sfacg','not-id'),/无效/);await assert.rejects(s.request('file:///C:/test'),/不支持/);
});
test('SF catalogue distinguishes free and VIP, de-duplicates exact URLs',()=>{
 const s=new Sources(fetch);const list=s.parseSFCatalog('<div class="catalog-list"><a href="/Novel/123/1/2/" title="第一章">第一章</a><a href="/Novel/123/1/2/">重复</a><a href="/vip/c/3/" title="第二章">VIP</a><a href="javascript:alert(1)">bad</a></div>','123');
 assert.equal(list.length,2);assert.equal(list[0].locked,false);assert.equal(list[1].locked,true);
});
