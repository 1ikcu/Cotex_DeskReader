const cheerio = require('cheerio');
const {htmlText, paragraphs, finalizeBook} = require('./core.cjs');
const EXTRA_SOURCES = [
 {id:'17k',name:'17K小说网',description:'玄幻、仙侠、都市、言情等原创小说 · 公开章节按需缓存，VIP 章节在原站阅读',url:'https://www.17k.com/',refreshable:true},
 {id:'zongheng',name:'纵横中文网',description:'原创网文 · 搜索书名或作者，公开章节按需缓存，VIP 章节在原站阅读',url:'https://www.zongheng.com/',refreshable:true},
 {id:'wikisource',name:'维基文库',description:'中文经典文学 · 分页浏览明清小说，也可搜索更多作品；公开正文按需缓存',url:'https://zh.wikisource.org/',refreshable:true}
];
const SOURCE_HOSTS = new Set(['gutendex.com','www.gutenberg.org','gutenberg.org','book.sfacg.com','s.sfacg.com','www.17k.com','search.17k.com','www.zongheng.com','book.zongheng.com','read.zongheng.com','search.zongheng.com','zh.wikisource.org']);
function isSourceURL(value) {
 try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&SOURCE_HOSTS.has(u.hostname);} catch {return false;}
}
const clean = value => htmlText(String(value||'')).replace(/\s+/g,' ').trim();
const unique = items => [...new Map(items.map(x=>[x.sourceId+':'+x.remoteId,x])).values()];
const wikiURL = title => 'https://zh.wikisource.org/wiki/'+encodeURIComponent(title).replace(/%2F/g,'/');
function validWikiTitle(title) {return typeof title==='string'&&title.trim().length>0&&title.length<=200&&!/[\x00-\x1f<>|{}\[\]#:\\]/.test(title);}
function wikiTitleFromURL(href) {
 try {const u=new URL(href,'https://zh.wikisource.org');if(u.hostname!=='zh.wikisource.org'||!u.pathname.startsWith('/wiki/'))return '';return decodeURIComponent(u.pathname.slice(6)).replace(/_/g,' ');} catch {return '';}
}
async function wiki(s,params) {
 const res=await s.request('https://zh.wikisource.org/w/api.php?'+new URLSearchParams({format:'json',formatversion:'2',...params}),'json');
 if(res.error)throw new Error(res.error.code==='missingtitle'?'维基文库中尚无此作品，请搜索其他版本。':'维基文库暂时未返回内容，请稍后重试。');
 return res;
}
async function wikiPage(s,title) {
 const res=await wiki(s,{action:'parse',page:title,redirects:'1',prop:'text|displaytitle'});
 if(!res.parse?.text)throw new Error('维基文库未返回正文。');return res.parse;
}
async function searchExtra(s,id,q,page) {
 if(id==='17k') {
  const html=await s.request('https://search.17k.com/search.xhtml?c.st=0&c.q='+encodeURIComponent(q)+'&page='+page);
  const $=cheerio.load(html);const items=[];
  $('dl dt a[href*="/book/"]').each((_,el)=>{
   const a=$(el);const remoteId=a.attr('href')?.match(/\/book\/(\d+)\.html/)?.[1];if(!remoteId)return;
   const row=a.closest('dl');items.push({sourceId:id,remoteId,title:clean(a.text()),author:clean(row.find('dd .bq .ls a').first().text()),description:clean(row.find('dd li p a[href*="/list/"]').first().text()).slice(0,180),url:'https://www.17k.com/book/'+remoteId+'.html'});
  });
  if(!items.length&&/验证|访问频繁|安全检查|Access Denied|Forbidden/i.test($('title').text()))throw new Error('原站暂时需要验证，请稍后重试或打开原站。');
  return {items:unique(items),hasMore:$('a').toArray().some(a=>$(a).text().trim()==='下一页'&&/page=/.test($(a).attr('href')||''))};
 }
 if(id==='zongheng') {
  if(!q&&page>1)return {items:[],hasMore:false};
  const res=await s.request('https://search.zongheng.com/search/book?keyword='+encodeURIComponent(q)+'&pageNo='+page+'&pageNum=20&isFromHuayu=0','json');
  if(res.code!==0||!res.data)throw new Error('纵横搜索暂时不可用，请稍后重试。');
  const data=res.data.datas;const list=data?.list||(!q?res.data.recDataList:[])||[];
  return {items:list.filter(b=>b.bookId).map(b=>({sourceId:id,remoteId:String(b.bookId),title:clean(b.name||b.bookName),author:clean(b.authorName),description:clean(b.description||b.bookIntro||b.intro||'公开章节可在应用内阅读').slice(0,180),url:'https://www.zongheng.com/detail/'+b.bookId})),hasMore:!!data&&page<data.totalPage};
 }
 if(id==='wikisource') {
  if(q) {
   const res=await wiki(s,{action:'query',list:'search',srsearch:q,srnamespace:'0',srlimit:'30',sroffset:String((page-1)*30)});
   if(!res.query?.search)throw new Error('维基文库搜索暂时不可用。');
   return {items:unique(res.query.search.map(b=>({sourceId:id,remoteId:b.title.split('/')[0],title:b.title.split('/')[0],author:'',description:clean(b.snippet).slice(0,180),url:wikiURL(b.title.split('/')[0])})).filter(b=>validWikiTitle(b.remoteId))),hasMore:!!res.continue};
  }
  if(!s.wikiCatalog||Date.now()-s.wikiCatalog.at>3600000) {
   const lists=await Promise.all(['明朝小說','清朝小說'].map(async category=>{
    const found=[];let continuation='';
    do {
     const res=await wiki(s,{action:'query',list:'categorymembers',cmtitle:'Category:'+category,cmtype:'page',cmlimit:'500',...(continuation?{cmcontinue:continuation}:{})});
     if(!res.query?.categorymembers)throw new Error('维基文库目录暂时不可用。');
     found.push(...res.query.categorymembers);continuation=res.continue?.cmcontinue||'';
    } while(continuation&&found.length<5000);
    return found;
   }));
   const items=unique(lists.flat().filter(b=>b.ns===0&&validWikiTitle(b.title)&&!b.title.includes('/')&&!/消歧[義义]/.test(b.title)).map(b=>({sourceId:id,remoteId:b.title,title:b.title,author:'',description:'明清小说 · 维基文库公开文本',url:wikiURL(b.title)}))).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
   s.wikiCatalog={at:Date.now(),items};
  }
  const items=s.wikiCatalog.items;return {items:items.slice((page-1)*30,page*30),hasMore:page*30<items.length,total:items.length};
 }
 throw new Error('未找到该书源。');
}
function parse17KCatalog(html,remoteId) {
 const $=cheerio.load(html);const seen=new Set();const chapters=[];
 $('a[href*="/chapter/"]').each((_,el)=>{
  const a=$(el);const m=(a.attr('href')||'').match(new RegExp('^(?:https?:)?(?://www\\.17k\\.com)?/chapter/'+remoteId+'/(\\d+)\\.html$'));if(!m||seen.has(m[1]))return;seen.add(m[1]);
  chapters.push({title:clean(a.find('.ellipsis').text()||a.text()),url:'https://www.17k.com/chapter/'+remoteId+'/'+m[1]+'.html',locked:a.find('.vip').length>0||a.hasClass('vip'),paragraphs:null});
 });return chapters;
}
function parseZonghengCatalog(html,remoteId) {
 const $=cheerio.load(html);const seen=new Set();const chapters=[];
 $('a[href*="/chapter/"]').each((_,el)=>{
  const a=$(el);const m=(a.attr('href')||'').match(new RegExp('^(?:https?:)?(?://(?:book|read)\\.zongheng\\.com)?/chapter/'+remoteId+'/(\\d+)\\.html$'));if(!m||seen.has(m[1]))return;seen.add(m[1]);
  chapters.push({title:clean(a.text()),url:'https://read.zongheng.com/chapter/'+remoteId+'/'+m[1]+'.html',locked:a.closest('li').hasClass('vip')||a.hasClass('vip'),paragraphs:null});
 });return chapters;
}
function parseWikiCatalog(html,title) {
 const $=cheerio.load(html);const seen=new Set();const chapters=[];
 $('.mw-parser-output a').each((_,el)=>{
  const a=$(el);const child=wikiTitleFromURL(a.attr('href')||'');
  if(!child.startsWith(title+'/')||!validWikiTitle(child)||a.hasClass('new')||a.closest('.ws-header,.ws-footer,.navbox').length||seen.has(child))return;seen.add(child);
  chapters.push({title:clean(a.text())||child.slice(title.length+1),url:wikiURL(child),locked:false,paragraphs:null});
 });return chapters;
}
function wikiParagraphs(html) {
 const $=cheerio.load(html);const body=$('.mw-parser-output').first();
 body.find('script,style,iframe,#headerContainer,.ws-header,.ws-footer,.ws-noexport,.noprint,.navbox,.licenseContainer,.licensetpl,.mw-editsection,.catlinks,#toc,.sistersitebox,.printfooter,.wst-license-box').remove();
 body.find('dd,dt').append('\n');return paragraphs(htmlText(body.html()||''));
}
async function extraCatalog(s,id,remoteId) {
 if(id==='17k')return parse17KCatalog(await s.request('https://www.17k.com/list/'+remoteId+'.html'),remoteId);
 if(id==='zongheng')return parseZonghengCatalog(await s.request('https://book.zongheng.com/showchapter/'+remoteId+'.html'),remoteId);
 if(id==='wikisource') {
  const page=await wikiPage(s,remoteId);const list=parseWikiCatalog(page.text,page.title);if(list.length)return list;
  const ps=wikiParagraphs(page.text);if(ps.join('').length<80)throw new Error('此页面没有可读正文，请搜索具体作品或版本。');
  return [{title:page.title,url:wikiURL(page.title),locked:false,paragraphs:ps}];
 }
 throw new Error('未找到该书源。');
}
async function addExtra(s,id,remoteId) {
 if(id==='wikisource'?!validWikiTitle(remoteId):!/^\d{1,15}$/.test(remoteId))throw new Error('无效书籍编号。');
 let url,title,author,chapters;
 if(id==='17k') {
  url='https://www.17k.com/book/'+remoteId+'.html';
  const [html,list]=await Promise.all([s.request(url),extraCatalog(s,id,remoteId)]);chapters=list;
  const $=cheerio.load(html);const match=($('meta[property="og:title"]').attr('content')||'').match(/^《(.+?)》(.+?)著-/);
  title=match?.[1]||clean($('h1').first().text());author=match?.[2]||'';
 } else if(id==='zongheng') {
  url='https://www.zongheng.com/detail/'+remoteId;
  const [html,list]=await Promise.all([s.request(url),extraCatalog(s,id,remoteId)]);chapters=list;
  const $=cheerio.load(html);title=$('meta[name="og:novel:book_name"],meta[property="og:novel:book_name"]').attr('content');author=$('meta[name="og:novel:author"],meta[property="og:novel:author"]').attr('content')||'';
 } else if(id==='wikisource') {
  const page=await wikiPage(s,remoteId);remoteId=page.title;title=page.title;url=wikiURL(title);
  const $=cheerio.load(page.text);author=$('a[href^="/wiki/Author:"]').first().text().trim();chapters=parseWikiCatalog(page.text,title);
  if(!chapters.length) {const ps=wikiParagraphs(page.text);if(ps.join('').length<80)throw new Error('此页面没有可读正文，请搜索具体作品或版本。');chapters=[{title,url,locked:false,paragraphs:ps}];}
 }
 if(!title)throw new Error('无法识别该书，请在原站检查链接。');
 if(!chapters?.length)throw new Error('原站没有返回章节目录，请稍后重试。');
 return finalizeBook({title:clean(title),author:clean(author),chapters,format:'在线'},id+':'+remoteId,{id,name:EXTRA_SOURCES.find(s=>s.id===id).name,remoteId,url});
}
async function chapterExtra(s,id,c) {
 let ps;
 if(id==='wikisource') {
  const title=wikiTitleFromURL(c.url);if(!validWikiTitle(title))throw new Error('无效章节地址。');
  const page=await wikiPage(s,title);ps=wikiParagraphs(page.text);
 } else {
  const html=await s.request(c.url);const $=cheerio.load(html);const body=$(id==='17k'?'.readAreaBox > .p':'.reader-content .content');
  body.find('script,style,iframe,.copy,.author-say,.qrcode,.chapter_text_ad,[id^="banner"],.ads,.advertisement').remove();
  ps=paragraphs(htmlText(body.html()||''));
 }
 const text=ps.join('');
 if(text.length<150&&/请先登录|登录后.{0,8}(阅读|查看)|购买.{0,6}章节|验证码|访问过于频繁/.test(text))throw new Error('原站要求登录或验证，请在原站阅读该章节。');
 if(!ps.length)throw new Error('原站未返回正文，请稍后重试或打开原站。');
 return {...c,paragraphs:ps};
}
module.exports={EXTRA_SOURCES,isSourceURL,unique,searchExtra,addExtra,chapterExtra,extraCatalog,parse17KCatalog,parseZonghengCatalog,parseWikiCatalog,wikiParagraphs};
