const cheerio=require('cheerio');
const {parseTXT,finalizeBook,traditional,simplify,htmlText,paragraphs,decodeText}=require('./core.cjs');
const {EXTRA_SOURCES,isSourceURL,unique,searchExtra,addExtra,chapterExtra,extraCatalog}=require('./extra-sources.cjs');
const OFFLINE_CLASSICS=require('../assets/gutenberg-catalog.json').books.map(b=>({...b,sourceId:'gutenberg',description:'中文 · 公版全文',url:'https://www.gutenberg.org/ebooks/'+b.remoteId}));
const SOURCE_LIST=[
 {id:'gutenberg',name:'公版名著',description:'Project Gutenberg · 分页浏览中文藏书，也可搜索世界文学；加入后可离线阅读',url:'https://www.gutenberg.org/'},
 {id:'sfacg',name:'菠萝包轻小说',description:'轻小说与原创网文 · 浏览全站书库或搜索书名、作者，公开章节按需缓存',url:'https://book.sfacg.com/',refreshable:true},
 ...EXTRA_SOURCES
];
const CLASSICS=[
 {remoteId:'23962',title:'西游记',author:'吴承恩',keywords:'西游 西游记 西遊記'},
 {remoteId:'24264',title:'红楼梦',author:'曹雪芹',keywords:'红楼 石头记 紅樓夢'},
 {remoteId:'23950',title:'三国演义',author:'罗贯中',keywords:'三国 三国演义 三國志演義'},
 {remoteId:'23863',title:'水浒传（七十回本）',author:'施耐庵',keywords:'水浒 水滸傳'},
 {remoteId:'23910',title:'封神演义',author:'许仲琳',keywords:'封神 封神演義'},
 {remoteId:'25271',title:'朝花夕拾',author:'鲁迅',keywords:'朝花夕拾 鲁迅 魯迅'},
 {remoteId:'11',title:"Alice's Adventures in Wonderland",author:'Lewis Carroll',keywords:'爱丽丝 Alice'},
 {remoteId:'1342',title:'Pride and Prejudice',author:'Jane Austen',keywords:'傲慢与偏见 Pride'}
].map(x=>({...x,sourceId:'gutenberg',description:'公版全文 · 下载后离线阅读',url:'https://www.gutenberg.org/ebooks/'+x.remoteId}));
function withCatalog(book,list){
 const old=new Map(book.chapters.map(c=>[c.url,c]));const progressUrl=book.chapters[book.progress.chapter]?.url;
 const marks=book.bookmarks.map(b=>({...b,url:book.chapters[b.chapter]?.url}));const collapsedURLs=new Set(book.collapsed.map(i=>book.chapters[i]?.url));
 const chapters=list.map((c,i)=>({...c,paragraphs:old.get(c.url)?.paragraphs||c.paragraphs||null,id:String(i)}));
 const position=chapters.findIndex(c=>c.url===progressUrl);const progress={...book.progress,chapter:Math.max(0,position),paragraph:position<0?0:book.progress.paragraph};
 if(progress.finished)progress.finished=position===chapters.length-1;
 return {...book,chapters,progress,bookmarks:marks.map(({url,...b})=>({...b,chapter:chapters.findIndex(c=>c.url===url)})).filter(b=>b.chapter>=0),collapsed:chapters.flatMap((c,i)=>collapsedURLs.has(c.url)?[i]:[])};
}
class Sources{
 constructor(fetcher){this.fetcher=fetcher;this.searchCache=new Map();this.accessCache=new Map();this.accessPending=new Map();this.accessQueue=[];this.accessActive=0;}
 async bookAccess(sourceId,remoteId){
  if(sourceId==='gutenberg'||sourceId==='wikisource')return {hasVip:false};
  if(!['sfacg','17k','zongheng'].includes(sourceId)||!/^\d{1,15}$/.test(String(remoteId)))throw new Error('无效书籍编号。');
  const key=sourceId+':'+remoteId,cached=this.accessCache.get(key);
  if(cached&&Date.now()-cached.at<600000)return cached.data;
  if(this.accessPending.has(key))return this.accessPending.get(key);
  const task=(async()=>{
   if(this.accessActive>=3)await new Promise(resolve=>this.accessQueue.push(resolve));
   else this.accessActive++;
   try{
    const chapters=sourceId==='sfacg'?this.parseSFCatalog(await this.request('https://book.sfacg.com/Novel/'+remoteId+'/MainIndex/'),remoteId):await extraCatalog(this,sourceId,remoteId);
    if(!chapters.length)throw new Error('无法确认章节付费状态。');
    const data={hasVip:chapters.some(c=>c.locked)};
    if(this.accessCache.size>=500)this.accessCache.delete(this.accessCache.keys().next().value);
    this.accessCache.set(key,{at:Date.now(),data});return data;
   }finally{const next=this.accessQueue.shift();if(next)next();else this.accessActive--;}
  })();
  this.accessPending.set(key,task);
  try{return await task;}finally{this.accessPending.delete(key);}
 }
 async request(url,type='text',limit=15*1024*1024){
  const u=new URL(url);
  if(!isSourceURL(u.toString()))throw new Error('不支持的书源地址。');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  try{
   const r=await this.fetcher(u.toString(),{signal:controller.signal,credentials:'omit',headers:{'User-Agent':'Mozilla/5.0 Cotex/1.2','Accept':type==='json'?'application/json':'text/html,text/plain,*/*'}});
   if(r.url&&!isSourceURL(r.url))throw new Error('原站跳转到了其他地址，请在原站查看。');
   if(!r.ok)throw new Error('书源暂时不可用（HTTP '+r.status+'），请稍后重试。');
   if(+r.headers.get('content-length')>limit)throw new Error('书源返回的文件过大。');
   const chunks=[];let size=0;const reader=r.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('书源返回的文件过大。');}chunks.push(Buffer.from(value));}
   const data=Buffer.concat(chunks);
   if(controller.signal.aborted)throw new Error('连接书源超时，请稍后重试。');
   const declared=+r.headers.get('content-length');
   if(declared&&!r.headers.get('content-encoding')&&declared!==size)throw new Error('正文传输不完整，请重试；现有缓存已保留。');
   if(type==='buffer')return data;
   const text=decodeText(data);return type==='json'?JSON.parse(text):text;
  }catch(e){if(e.name==='AbortError')throw new Error('连接书源超时。已缓存章节仍可阅读，请稍后重试。');throw e;}finally{clearTimeout(timer);}
 }
 async search(sourceId,query,page=1){
  const q=String(query||'').trim().slice(0,120);page=Math.max(1,Math.min(1000,Math.trunc(+page)||1));
  const key=sourceId+':'+q+':'+page;const cached=this.searchCache.get(key);if(cached&&Date.now()-cached.at<300000)return cached.data;
  let data;
  if(sourceId==='all'){
   const results=await Promise.allSettled(SOURCE_LIST.map(s=>{
    const previous=this.searchCache.get(s.id+':'+q+':'+(page-1));
    if(page>1&&previous&&Date.now()-previous.at<300000&&!previous.data.hasMore){const data={items:[],hasMore:false};this.searchCache.set(s.id+':'+q+':'+page,{at:Date.now(),data});return data;}
    return this.search(s.id,q,page);
   }));
   const good=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
   if(!good.length)throw new Error('所有书源暂时连接失败，请检查网络后重试。');
   const items=[];for(let i=0;i<Math.max(0,...good.map(r=>r.items.length));i++)for(const r of good)if(r.items[i])items.push(r.items[i]);
   const warnings=results.flatMap((r,i)=>r.status==='rejected'?[SOURCE_LIST[i].name+'暂时连接失败，可切换到该书源重试']:r.value.notice?[SOURCE_LIST[i].name+'：'+r.value.notice]:[]);
   return {items:unique(items),hasMore:good.some(r=>r.hasMore),notice:warnings.join('；')};
  }
  if(sourceId==='gutenberg'){
   const featured=CLASSICS.filter(b=>!q||simplify((b.title+' '+b.author+' '+b.keywords).toLowerCase()).includes(simplify(q.toLowerCase())));
   {
    try{
     const url='https://gutendex.com/books/?'+(q?'search='+encodeURIComponent(traditional(q)):'languages=zh')+'&page='+page;
     const res=await this.request(url,'json');
     if(!Array.isArray(res.results))throw new Error('名著目录暂时不可用。');
     const found=(res.results||[]).filter(b=>Object.keys(b.formats||{}).some(k=>k.startsWith('text/plain'))).map(b=>({sourceId,remoteId:String(b.id),title:simplify(b.title),author:(b.authors||[]).map(a=>a.name).join('、'),description:(b.languages||[]).includes('zh')?'中文 · 公版全文':'原文语言 '+(b.languages||[]).join(', ')+' · 公版全文',url:'https://www.gutenberg.org/ebooks/'+b.id}));
     data={items:unique([...(q&&page===1?featured:[]),...found]),hasMore:!!res.next,total:res.count};
    }catch(e){
     const matches=unique([...featured,...OFFLINE_CLASSICS.filter(b=>!q||simplify((b.title+' '+b.author).toLowerCase()).includes(simplify(q.toLowerCase())))]);
     if(matches.length)data={items:matches.slice((page-1)*32,page*32),hasMore:page*32<matches.length,total:matches.length,notice:'在线目录暂时不可用，显示本地保存的名著书目；未下载的正文仍需要联网。'};else throw e;
    }
   }
  }else if(sourceId==='sfacg'){
   const html=await this.request(q?'https://s.sfacg.com/?Key='+encodeURIComponent(q)+'&S=1&PageIndex='+page:'https://book.sfacg.com/List/default.aspx?PageIndex='+page);
   const $=cheerio.load(html);let items=[];
   $(q?'a[id*="LinkInfo"]':'ul.Comic_Pic_List strong a').each((_,el)=>{
    const a=$(el);const url=a.attr('href');const m=url?.match(/(?:book\.sfacg\.com)?\/Novel\/(\d+)/i);if(!m)return;
    const row=q?a.closest('li'):a.closest('ul.Comic_Pic_List');const li=row.text().trim();const author=q?(li.match(/综合信息[：:]\s*([^/\n]+)/)?.[1]?.trim()||''):row.find('a[href^="/Club/"]').first().text().trim();
    items.push({sourceId,remoteId:m[1],title:a.text().trim(),author,description:li.replace(a.text().trim(),'').replace(/综合信息[：:][^\n]*\n?/,'').trim().slice(0,180),url:'https://book.sfacg.com/Novel/'+m[1]+'/'});
   });
   if(!items.length&&/验证|访问频繁/.test($('title').text()))throw new Error('原站暂时需要验证，请稍后重试或打开原站。');
   data={items,hasMore:items.length>=20};
  }else if(EXTRA_SOURCES.some(s=>s.id===sourceId))data=await searchExtra(this,sourceId,q,page);
  else throw new Error('未找到该书源。');
  data.items=unique(data.items);
  if(!data.notice){if(this.searchCache.size>=200)this.searchCache.delete(this.searchCache.keys().next().value);this.searchCache.set(key,{at:Date.now(),data});}return data;
 }
 async add(sourceId,remoteId){
  remoteId=String(remoteId);
  if(EXTRA_SOURCES.some(s=>s.id===sourceId))return addExtra(this,sourceId,remoteId);
  if(!/^\d{1,15}$/.test(String(remoteId)))throw new Error('无效书籍编号。');
  if(sourceId==='gutenberg'){
   let meta=CLASSICS.find(x=>x.remoteId===remoteId)||OFFLINE_CLASSICS.find(x=>x.remoteId===remoteId);
   if(!meta){const r=await this.request('https://gutendex.com/books/'+remoteId,'json');meta={title:simplify(r.title),author:(r.authors||[]).map(a=>a.name).join('、')};}
   const buffer=await this.request('https://www.gutenberg.org/cache/epub/'+remoteId+'/pg'+remoteId+'.txt','buffer');
   const parsed=parseTXT(buffer,meta.title+'.txt',{gutenberg:true,wrapped:true});
   parsed.author=meta.author;
   return finalizeBook(parsed,'gutenberg:'+remoteId,{id:sourceId,name:'Project Gutenberg',remoteId,url:'https://www.gutenberg.org/ebooks/'+remoteId});
  }
  if(sourceId==='sfacg'){
   const url='https://book.sfacg.com/Novel/'+remoteId+'/';
   const [html,catalog]=await Promise.all([this.request(url),this.request(url+'MainIndex/')]);
   const $=cheerio.load(html);const t=$('h1.title .text').clone();t.children().remove();
   const title=t.text().trim()||$('meta[name="keywords"]').attr('content')?.split(',')[0];
   if(!title)throw new Error('无法识别该书，请在原站检查链接。');
   const chapters=this.parseSFCatalog(catalog,remoteId);
   if(!chapters.length)throw new Error('原站没有返回章节目录，请稍后重试。');
   return finalizeBook({title,author:$('.author-name').first().text().trim(),chapters,format:'在线'},'sfacg:'+remoteId,{id:sourceId,name:'菠萝包轻小说',remoteId,url});
  }throw new Error('未找到该书源。');
 }
 parseSFCatalog(html,remoteId){
  const $=cheerio.load(html);const seen=new Set();const chapters=[];
  $('.catalog-list a').each((_,el)=>{
   const a=$(el);const href=a.attr('href')||'';
   if(!new RegExp('^/Novel/'+remoteId+'/\\d+/\\d+/?$','i').test(href)&&!/^\/vip\/c\/\d+\/?$/i.test(href))return;
   if(seen.has(href))return;seen.add(href);
   chapters.push({title:a.attr('title')||a.text().replace(/VIP/g,'').trim(),url:new URL(href,'https://book.sfacg.com').toString(),locked:/^\/vip\//i.test(href),paragraphs:null});
  });return chapters;
 }
 async chapter(book,index){
  const c=book.chapters[index];if(!c)throw new Error('章节不存在。');
  if(c.paragraphs)return c;
  if(c.locked)throw new Error('这是原站 VIP 章节，请到原站阅读，或导入你已有的本地小说。');
  if(EXTRA_SOURCES.some(s=>s.id===book.source.id))return chapterExtra(this,book.source.id,c);
  if(book.source.id!=='sfacg')throw new Error('未缓存此章节。');
  const html=await this.request(c.url);const $=cheerio.load(html);
  const body=$('#ChapterBody');body.find('script,style,a,iframe').remove();
  const ps=paragraphs(htmlText(body.html()||''));
  if(ps.join('').length<150&&/请先登录|登录后.{0,8}(阅读|查看)|购买.{0,6}章节|验证码|访问过于频繁/.test(ps.join('')))throw new Error('原站要求登录或验证，请在原站阅读该章节。');
  if(!ps.length){if(/章节内容当前不可用/.test(html))throw new Error('该章节在原站已不可用，可选择其他章节或打开原站。');throw new Error('原站未返回正文，请稍后重试。');}
  return {...c,paragraphs:ps};
 }
 async refresh(book){
  if(!SOURCE_LIST.find(s=>s.id===book.source.id)?.refreshable)return book;
  const list=book.source.id==='sfacg'?this.parseSFCatalog(await this.request('https://book.sfacg.com/Novel/'+book.source.remoteId+'/MainIndex/'),book.source.remoteId):await extraCatalog(this,book.source.id,book.source.remoteId);
  if(!list.length)throw new Error('目录更新失败，已保留现有目录。');
  return withCatalog(book,list);
 }
}
module.exports={Sources,SOURCE_LIST,CLASSICS,isSourceURL,withCatalog};
