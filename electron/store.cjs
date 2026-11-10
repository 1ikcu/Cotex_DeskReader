const fs=require('node:fs');
const path=require('node:path');
const {safeText}=require('./core.cjs');
const defaults={fontSize:14,lineHeight:1.7,width:736,hints:true,hintFrequency:5,theme:'light',simplified:true,group:'工作空间'};
class Store{
  constructor(root){this.root=root;this.booksPath=path.join(root,'books');fs.mkdirSync(this.booksPath,{recursive:true});this.db=this.read(path.join(root,'library.json'))||{version:1,books:[],settings:defaults,activeId:null};this.db.settings={...defaults,...this.db.settings};
    if((this.db.appearanceVersion||0)<2){
      for(const [key,oldValue] of Object.entries({fontSize:17,lineHeight:1.95,width:850})){
        if(this.db.settings[key]===oldValue)this.db.settings[key]=defaults[key];
      }
      this.db.appearanceVersion=2;
    }
    this.write();}
  read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{try{return JSON.parse(fs.readFileSync(file+'.bak','utf8'));}catch{return null;}}}
  atomic(file,value){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),'utf8');if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak');fs.renameSync(tmp,file);}
  write(){this.atomic(path.join(this.root,'library.json'),this.db);}
  file(id){if(!/^[a-f0-9]{24}$/.test(id))throw new Error('无效书籍编号');return path.join(this.booksPath,id+'.json');}
  get(id){const book=this.read(this.file(id));if(!book)throw new Error('书籍数据暂时无法读取，请重新导入。');const meta=this.read(this.file(id)+'.state');return meta?{...book,...meta}:book;}
  summary(b){return {id:b.id,title:b.title,author:b.author,alias:b.alias,source:b.source,format:b.format,createdAt:b.createdAt,updatedAt:b.updatedAt,progress:b.progress,chapterCount:b.chapters.length,hasVip:b.chapters.some(c=>c.locked),bookmarks:b.bookmarks.length};}
  add(book){const existing=this.db.books.find(b=>b.id===book.id);if(existing)return this.get(existing.id);this.atomic(this.file(book.id),book);this.db.books.unshift(this.summary(book));this.db.activeId=book.id;this.write();return book;}
  meta(book){const {alias,progress,bookmarks,collapsed,updatedAt}=book;return {alias,progress,bookmarks,collapsed,updatedAt};}
  save(book){book.updatedAt=Date.now();this.atomic(this.file(book.id),book);this.atomic(this.file(book.id)+'.state',this.meta(book));this.db.books=this.db.books.map(b=>b.id===book.id?this.summary(book):b);this.write();return book;}
  patch(id,patch){const b=this.get(id);if(patch.alias!==undefined)b.alias=safeText(patch.alias,100).trim()||b.alias;if(patch.progress){const c=Math.max(0,Math.min(b.chapters.length-1,Math.floor(patch.progress.chapter)||0));b.progress={chapter:c,paragraph:Math.max(0,Math.min(100000,Math.floor(patch.progress.paragraph)||0)),finished:patch.progress.finished===true&&c===b.chapters.length-1};}if(Array.isArray(patch.bookmarks))b.bookmarks=patch.bookmarks.filter(x=>Number.isInteger(x.chapter)&&x.chapter>=0&&x.chapter<b.chapters.length).slice(0,500).map(x=>({chapter:x.chapter,paragraph:Math.max(0,Math.floor(x.paragraph)||0),createdAt:Number(x.createdAt)||Date.now()}));if(Array.isArray(patch.collapsed))b.collapsed=[...new Set(patch.collapsed.filter(n=>Number.isInteger(n)&&n>=0&&n<b.chapters.length))];b.updatedAt=Date.now();this.atomic(this.file(id)+'.state',this.meta(b));this.db.books=this.db.books.map(x=>x.id===id?this.summary(b):x);this.write();return this.summary(b);}
  settings(p){const next={...this.db.settings};if(p.fontSize!==undefined)next.fontSize=Math.max(14,Math.min(24,+p.fontSize||14));if(p.lineHeight!==undefined)next.lineHeight=Math.max(1.5,Math.min(2.5,+p.lineHeight||1.7));if(p.width!==undefined)next.width=Math.max(620,Math.min(1080,+p.width||736));if(p.theme!==undefined)next.theme=['light','dark','paper'].includes(p.theme)?p.theme:'light';for(const k of ['hints','simplified'])if(p[k]!==undefined)next[k]=!!p[k];if(p.hintFrequency!==undefined)next.hintFrequency=Math.max(3,Math.min(12,+p.hintFrequency||5));if(p.group!==undefined)next.group=safeText(p.group,40).trim()||'工作空间';this.db.settings=next;this.write();return next;}
  remove(id){this.get(id);const trash=path.join(this.root,'trash');fs.mkdirSync(trash,{recursive:true});fs.renameSync(this.file(id),path.join(trash,id+'-'+Date.now()+'.json'));this.db.books=this.db.books.filter(b=>b.id!==id);if(this.db.activeId===id)this.db.activeId=this.db.books[0]?.id||null;this.write();}
  state(){return {...this.db,version:1};}
}
module.exports={Store,defaults};
