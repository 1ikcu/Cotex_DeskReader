const path = require('node:path');
const crypto = require('node:crypto');
const iconv = require('iconv-lite');
const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');
const simplify = OpenCC.Converter({from:'tw',to:'cn'});
const traditional = OpenCC.Converter({from:'cn',to:'tw'});
const MAX_BYTES = 60 * 1024 * 1024;
const aliases = ['核对项目资料','整理需求文档','分类细则最终版','检查原表','组件库','学习机测试','课件修改','评估准则迭代','日报汇总','更新接口文档','整理会议纪要','检查交付清单'];
const chapterPattern = /^(?:第\s*[零〇○一二三四五六七八九十百千万两\d０-９]{1,12}\s*[章节回卷部篇集](?:[\s:：.．、·-][^\n]{0,85}|[^\s，,。！？!?．：:]{0,30})|chapter\s+(?:\d+|[ivxlcdm]+)(?:[\s:：.-].{0,70})?|(?:序章|楔子|引子|序言|前言|后记|尾声|终章|番外)(?:[\s:：一二三四五六七八九十\d].{0,50})?)$/i;
function uid(text) {return crypto.createHash('sha256').update(text).digest('hex').slice(0,24);}
function safeText(v,limit=500) {return typeof v==='string'?v.slice(0,limit):'';}
function decodeText(bytes) {
  const b=Buffer.from(bytes);
  if(b.subarray(0,2).equals(Buffer.from([255,254]))) return iconv.decode(b,'utf16-le');
  if(b.subarray(0,2).equals(Buffer.from([254,255]))) return iconv.decode(b,'utf16-be');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{return iconv.decode(b,'gb18030');}
}
function cleanText(text) {return String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();}
function stripGutenberg(text) {
  let t=cleanText(text);
  const start=t.match(/\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  if(start)t=t.slice(start.index+start[0].length);
  const end=t.search(/\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if(end>=0)t=t.slice(0,end);
  return t.replace(/^Language:\s*[^\n]*\n/i,'').trim();
}
function paragraphs(text,wrapped=false) {
  const t=cleanText(text);
  const groups=wrapped?t.split(/\n\s*\n+|\n(?=[ \t\u3000]{2,})/):t.split(/\n+/);
  return groups.map(s=>wrapped?s.replace(/([\u3400-\u9fff，。！？；：、」』”’])\n\s*/g,'$1').replace(/\n/g,' ').trim():s.trim()).filter(Boolean);
}
function splitLongParagraphs(p,max=1600) {
  const result=[];
  for(const x of p) {if(x.length<=max){result.push(x);continue;} let start=0;while(start<x.length){let end=Math.min(start+max,x.length);if(end<x.length){const cut=Math.max(x.lastIndexOf('。',end),x.lastIndexOf('！',end),x.lastIndexOf('. ',end));if(cut>start+max/2)end=cut+1;}result.push(x.slice(start,end));start=end;}}
  return result;
}
function parseTXT(bytes,filename,options={}) {
  if(bytes.length>MAX_BYTES)throw new Error('单个文件最多支持 60 MB。');
  const raw=decodeText(bytes);
  if(/<html[\s>]/i.test(raw.slice(0,1000))) throw new Error('返回的是网页，未找到小说文本。');
  let text=options.gutenberg?stripGutenberg(raw):cleanText(raw);
  text=text.replace(/([^\n])(第[零〇○一二三四五六七八九十百千万两\d０-９]{1,12}[章回节][ \t\u00a0\u3000]{2,}[^\n]{1,55})(?=\n|$)/g,'$1\n\n$2');
  if(!text)throw new Error('文件为空，无法导入。');
  const lines=text.split('\n');
  let chapters=[], current=null,pre=[];
  const flush=()=>{if(current){
    if(/^第[零〇○一二三四五六七八九十百千万两\d０-９]+[章节回]$/.test(current.title)){
      const first=current.lines.findIndex(s=>s.trim());
      const extra=first>=0?current.lines[first].trim():'';
      if(extra.length>=8&&extra.length<=38&&/[\s　]/.test(extra)&&!/[。！？!?：:]/.test(extra)){current.title+='　'+extra;current.lines.splice(first,1);}
    }
    const ps=splitLongParagraphs(paragraphs(current.lines.join('\n'),options.wrapped));
    if(ps.length){const prior=chapters.at(-1);if(prior&&prior.title.replace(/\s/g,'')===current.title.replace(/\s/g,''))prior.paragraphs.push(...ps);else chapters.push({title:current.title,paragraphs:ps});}
  }};
  for(const line of lines){
    let title=line.trim();
    if(chapterPattern.test(title)&&!/^第[零〇○一二三四五六七八九十百千万两\d０-９]+[章节回卷部篇集][中了里上内的]/.test(title)){
      let inline='';const pivot=title.search(/[\s　]+(?:話說|话说)/);if(pivot>0){inline=title.slice(pivot).trim();title=title.slice(0,pivot).trim();}
      flush();current={title,lines:inline?[inline]:[]};
    }else if(current)current.lines.push(line);else pre.push(line);
  }flush();
  if(chapters.length){
    const intro=paragraphs(pre.join('\n'),options.wrapped);
    if(intro.join('').length>50)chapters.unshift({title:'前言',paragraphs:splitLongParagraphs(intro)});
  }else{
    const ps=splitLongParagraphs(paragraphs(text,options.wrapped));
    let chunk=[],len=0;
    for(const p of ps){chunk.push(p);len+=p.length;if(len>=6000){chapters.push({title:'第'+(chapters.length+1)+'节',paragraphs:chunk});chunk=[];len=0;}}
    if(chunk.length)chapters.push({title:chapters.length?'第'+(chapters.length+1)+'节':'正文',paragraphs:chunk});
  }
  return {title:path.basename(filename).replace(/\.(txt|text)$/i,''),author:'',chapters,format:'TXT'};
}
const array=x=>x===undefined?[]:Array.isArray(x)?x:[x];
function htmlText(html) {
  const $=cheerio.load(html);
  $('script,style,iframe,object,svg,nav').remove();
  $('br').replaceWith('\n');
  $('p,div,h1,h2,h3,h4,li,blockquote,section').append('\n');
  return cleanText($.root().text()).replace(/[ \t]+\n/g,'\n');
}
async function parseEPUB(bytes,filename) {
  if(bytes.length>MAX_BYTES)throw new Error('单个文件最多支持 60 MB。');
  const zip=await JSZip.loadAsync(bytes);
  const files=Object.values(zip.files);if(files.length>20000)throw new Error('EPUB 内文件数量过多。');
  let total=0;for(const f of files){total+=f._data?.uncompressedSize||0;if(total>150*1024*1024)throw new Error('EPUB 解压内容过大。');}
  if(zip.file('META-INF/encryption.xml'))throw new Error('暂不支持包含加密资源的 EPUB，请导入无 DRM 的 EPUB 或 TXT。');
  const xml=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,processEntities:false});
  const container=zip.file('META-INF/container.xml');if(!container)throw new Error('不是有效的 EPUB 文件。');
  const c=xml.parse(await container.async('string'));
  const opfPath=array(c.container?.rootfiles?.rootfile)[0]?.['@_full-path'];
  const opf=zip.file(opfPath||'');if(!opf)throw new Error('EPUB 缺少书籍目录。');
  const data=xml.parse(await opf.async('string')).package;
  const textVal=v=>typeof v==='object'?v?.['#text']:v;
  const title=textVal(array(data.metadata?.title)[0])||path.basename(filename,'.epub');
  const author=textVal(array(data.metadata?.creator)[0])||'';
  const manifest=new Map(array(data.manifest?.item).map(i=>[i['@_id'],i]));
  const base=path.posix.dirname(opfPath);let chapters=[];
  for(const ref of array(data.spine?.itemref)){
    if(ref['@_linear']==='no')continue;
    const item=manifest.get(ref['@_idref']);if(!item)continue;
    const rel=path.posix.normalize(path.posix.join(base,decodeURIComponent(item['@_href'].split('#')[0])));
    if(rel.startsWith('../')||rel.startsWith('/'))continue;
    const file=zip.file(rel);if(!file)continue;
    const html=await file.async('string');const $=cheerio.load(html);
    const heading=$('h1,h2,h3').first().text().trim();
    const content=htmlText($('body').html()||html);
    let ps=splitLongParagraphs(paragraphs(content));
    if(heading&&ps[0]===heading)ps=ps.slice(1);
    if(ps.length&&ps.join('').length>10)chapters.push({title:heading||$('title').text().trim()||'第'+(chapters.length+1)+'节',paragraphs:ps});
  }
  if(!chapters.length)throw new Error('EPUB 没有可读取的文字正文。');
  return {title:safeText(title),author:safeText(author),chapters,format:'EPUB'};
}
function finalizeBook(parsed,identity,source={id:'local',name:'本地导入'}) {
  const id=uid(identity);
  return {...parsed,id,source,alias:aliases[parseInt(id.slice(0,6),16)%aliases.length],createdAt:Date.now(),updatedAt:Date.now(),progress:{chapter:0,paragraph:0},bookmarks:[],collapsed:[],chapters:parsed.chapters.map((c,i)=>({...c,id:String(i)}))};
}
function cnNumber(s){
  s=s.replace(/○/g,'〇').replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10));
  if(/^\d+$/.test(s))return +s;
  const digit={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if([...s].every(c=>c in digit))return Number([...s].map(c=>digit[c]).join(''));
  const units={'十':10,'百':100,'千':1000,'万':10000};let n=0,section=0,d=0;
  for(const c of s){if(c in digit)d=digit[c];else if(c in units){if(c==='万'){section=(section+d)*10000;n+=section;section=0;}else section+=(d||1)*units[c];d=0;}else return NaN;}return n+section+d;
}
function chapterMatches(chapters,query) {
  const q=simplify(query.trim().toLowerCase());if(!q)return [];
  const m=q.match(/^(?:第)?([零〇○一二三四五六七八九十百千万两\d０-９]+)(?:[章节回卷部篇集])?$/);
  const n=m?cnNumber(m[1]):NaN;
  const ranked=chapters.map((c,i)=>{
    const t=simplify(c.title.toLowerCase());
    const num=t.match(/^第\s*([零〇○一二三四五六七八九十百千万两\d０-９]+)\s*[章节回卷部篇集]/);
    const score=Number.isFinite(n)&&num&&cnNumber(num[1])===n?0:t.includes(q)?1:Number.isFinite(n)&&i===n-1?2:9;
    return {index:i,title:c.title,score};
  }).filter(x=>x.score<9).sort((a,b)=>a.score-b.score||a.index-b.index);
  if(ranked.some(x=>x.score===0))return ranked.filter(x=>x.score===0).slice(0,100);
  return ranked.slice(0,100);
}
module.exports={parseTXT,parseEPUB,finalizeBook,decodeText,stripGutenberg,htmlText,paragraphs,chapterMatches,simplify,traditional,safeText,uid,MAX_BYTES,aliases};
