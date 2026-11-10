const test=require('node:test');
const assert=require('node:assert/strict');
const {Sources,SOURCE_LIST,isSourceURL}=require('../electron/sources.cjs');
const {parse17KCatalog,parseZonghengCatalog,parseWikiCatalog,wikiParagraphs}=require('../electron/extra-sources.cjs');
const json=data=>new Response(JSON.stringify(data));
const kCatalog='<a href="/chapter/123/11.html"><span class="ellipsis">第一章 起点</span></a><a href="//www.17k.com/chapter/123/12.html"><span class="ellipsis vip">第二章</span></a><a href="/chapter/123/11.html">重复</a><a href="https://other.test/chapter/123/13.html">外站</a>';
test('VIP detection reads actual locked chapters, deduplicates requests and caches results',async()=>{
 let calls=0;const s=new Sources(async()=>{calls++;return new Response(kCatalog);});
 const values=await Promise.all([s.bookAccess('17k','123'),s.bookAccess('17k','123')]);
 assert.deepEqual(values,[{hasVip:true},{hasVip:true}]);assert.equal(calls,1);
 assert.deepEqual(await s.bookAccess('17k','123'),{hasVip:true});assert.equal(calls,1);
 assert.deepEqual(await s.bookAccess('gutenberg','123'),{hasVip:false});assert.equal(calls,1);
 const free=new Sources(async()=>new Response('<li><a href="/chapter/12/1.html">公开章</a></li>'));
 assert.deepEqual(await free.bookAccess('zongheng','12'),{hasVip:false});
 const failed=new Sources(async()=>new Response('<p>验证页面</p>'));
 await assert.rejects(failed.bookAccess('zongheng','12'),/无法确认/);
 assert.equal(failed.accessCache.size,0);
});
test('VIP lookups cap concurrency and free slots even after failed requests',async()=>{
 let active=0,max=0,calls=0;const s=new Sources(async url=>{
  const id=url.match(/list\/(\d+)/)[1];active++;max=Math.max(max,active);calls++;
  await new Promise(r=>setTimeout(r,10));active--;if(id==='1')throw Error('offline');
  return new Response('<a href="/chapter/'+id+'/11.html"><span class="ellipsis vip">付费章</span></a>');
 });
 const result=await Promise.allSettled(Array.from({length:8},(_,i)=>s.bookAccess('17k',String(i+1))));
 assert.equal(max,3);assert.equal(calls,8);assert.equal(result.filter(r=>r.status==='fulfilled').length,7);assert.equal(s.accessActive,0);
});
test('17K and Zongheng catalogues retain order, identify VIP, and exclude foreign links',()=>{
 const k=parse17KCatalog(kCatalog,'123');assert.equal(k.length,2);assert.equal(k[0].title,'第一章 起点');assert.equal(k[1].locked,true);
 const z=parseZonghengCatalog('<ul><li><a href="https://book.zongheng.com/chapter/123/11.html">第一章</a></li><li class="vip"><a href="https://read.zongheng.com/chapter/123/12.html">第二章</a></li></ul>','123');
 assert.equal(z.length,2);assert.equal(z[0].url,'https://read.zongheng.com/chapter/123/11.html');assert.equal(z[1].locked,true);
});
test('Wiki chapters keep poems and narrative while stripping navigation and licenses',()=>{
 const html='<div class="mw-parser-output"><div id="headerContainer">作者导航</div><table class="ws-header"><tr><td>上一章</td></tr></table><dl><dd>第一行诗</dd><dd>第二行诗</dd></dl><p>正文第一段。</p><p>正文第二段。</p><div class="ws-noexport">许可提示</div></div>';
 const ps=wikiParagraphs(html);assert.deepEqual(ps,['第一行诗','第二行诗','正文第一段。','正文第二段。']);
 const list=parseWikiCatalog('<div class="mw-parser-output"><a href="/wiki/测试/第一回">第一回</a><a href="/wiki/测试/第一回">重复</a><a class="new" href="/wiki/测试/第二回">未创建</a><a href="/wiki/他书/第三回">他书</a></div>','测试');
 assert.equal(list.length,1);assert.equal(list[0].title,'第一回');
});
test('Default Gutenberg browsing fetches the Chinese catalogue and its next page',async()=>{
 const calls=[];const s=new Sources(async url=>{calls.push(new URL(url));return json({count:444,next:calls.length===1?'next':null,results:[{id:100+calls.length,title:'测试名著',authors:[],languages:['zh'],formats:{'text/plain':'https://www.gutenberg.org/test.txt'}}]});});
 const first=await s.search('gutenberg','');const second=await s.search('gutenberg','',2);
 assert.equal(first.items.length,1);assert.equal(first.total,444);assert.equal(first.hasMore,true);assert.equal(second.items[0].remoteId,'102');
 assert.equal(calls[0].searchParams.get('languages'),'zh');assert.equal(calls[1].searchParams.get('page'),'2');
});
test('Cross-source search preserves successful results and does not repeat exhausted providers',async()=>{
 let sfRequests=0;
 const s=new Sources(async url=>{
  const u=new URL(url);
  if(u.hostname==='gutendex.com')return json({results:[{id:u.searchParams.get('page'),title:'书籍',formats:{'text/plain':'url'}}],next:u.searchParams.get('page')==='1'?'next':null});
  if(u.hostname==='s.sfacg.com'){sfRequests++;return new Response('<li><a id="LinkInfo" href="https://book.sfacg.com/Novel/1/">轻小说</a></li>');}
  if(u.hostname==='search.17k.com')throw new Error('network unavailable');
  if(u.hostname==='search.zongheng.com')return json({code:0,data:{datas:{list:[],totalPage:0}}});
  if(u.hostname==='zh.wikisource.org')return json({query:{search:[]}});
  throw new Error('Unexpected URL');
 });
 const a=await s.search('all','测试词');assert.equal(a.items.length,2);assert.equal(a.items[0].remoteId,a.items[1].remoteId);assert.notEqual(a.items[0].sourceId,a.items[1].sourceId);assert.match(a.notice,/17K/);assert.equal(a.hasMore,true);
 const b=await s.search('all','测试词',2);assert.equal(b.items.length,1);assert.equal(b.hasMore,false);assert.equal(sfRequests,1);
});
test('Refresh relocates cached text, bookmarks, collapsed chapters and reading position by URL',async()=>{
 const s=new Sources(async()=>new Response(kCatalog));
 const book={source:{id:'17k',remoteId:'123'},chapters:[{url:'https://www.17k.com/chapter/123/12.html',paragraphs:['已缓存']},{url:'https://www.17k.com/chapter/123/11.html',paragraphs:null}],progress:{chapter:0,paragraph:7},bookmarks:[{chapter:0,paragraph:3}],collapsed:[0]};
 const updated=await s.refresh(book);assert.deepEqual(updated.progress,{chapter:1,paragraph:7});assert.deepEqual(updated.chapters[1].paragraphs,['已缓存']);assert.deepEqual(updated.bookmarks,[{chapter:1,paragraph:3}]);assert.deepEqual(updated.collapsed,[1]);
});
test('VIP chapters never initiate a network request and cached chapters remain readable offline',async()=>{
 const s=new Sources(async()=>{throw new Error('Should not fetch');});
 const book={source:{id:'17k'},chapters:[{locked:true,paragraphs:null},{paragraphs:['离线正文']}]};
 await assert.rejects(s.chapter(book,0),/VIP/);assert.deepEqual((await s.chapter(book,1)).paragraphs,['离线正文']);
});
test('17K narrative excludes ads and author sidebar without losing story paragraphs',async()=>{
 const s=new Sources(async()=>new Response('<div class="readAreaBox"><div class="p"><p>第一段正文。</p><p>第二段正文。</p><p class="copy">版权页脚</p><div class="author-say">作者互动</div><div id="banner_content">广告</div></div></div>'));
 const c=await s.chapter({source:{id:'17k'},chapters:[{url:'https://www.17k.com/chapter/123/11.html'}]},0);
 assert.deepEqual(c.paragraphs,['第一段正文。','第二段正文。']);
});
test('Only supported HTTPS sites and real Wiki content titles are accepted',async()=>{
 assert.equal(SOURCE_LIST.length,5);assert.equal(isSourceURL('https://www.17k.com/book/1.html'),true);
 for(const u of ['https://www.17k.com.evil.test/','file:///C:/test','https://user:pass@www.17k.com/','https://www.17k.com:1234/'])assert.equal(isSourceURL(u),false);
 const s=new Sources(async()=>{throw new Error('Should not fetch');});await assert.rejects(s.add('wikisource','Author:someone'),/无效/);await assert.rejects(s.add('17k','../test'),/无效/);
});
test('When the catalogue service is offline, hundreds of saved titles remain browsable with pagination',async()=>{
 const s=new Sources(async()=>new Response('Unavailable',{status:503}));const first=await s.search('gutenberg','');const second=await s.search('gutenberg','',2);
 assert.ok(first.total>=443);assert.equal(first.items.length,32);assert.equal(second.items.length,32);assert.equal(first.hasMore,true);assert.match(first.notice,/本地保存/);assert.ok(second.items.every(b=>!first.items.some(a=>a.remoteId===b.remoteId)));
});
