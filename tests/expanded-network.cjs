const {app,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Sources,SOURCE_LIST}=require('../electron/sources.cjs');
const root=path.resolve(__dirname,'../test-results');fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'network-expanded-'+Date.now()));
for(const stream of [process.stdout,process.stderr])stream?.on('error',e=>{if(e.code!=='EPIPE')throw e;});
app.whenReady().then(async()=>{
 const s=new Sources((url,init)=>net.fetch(url,init));const report={at:new Date().toISOString(),browsing:[],reading:[]};
 try {
  for(const source of SOURCE_LIST){const first=await s.search(source.id,'');assert.ok(first.items.length>0,source.id+' empty');const second=first.hasMore?await s.search(source.id,'',2):null;if(second)assert.ok(second.items.some(b=>!first.items.some(a=>a.remoteId===b.remoteId)),source.id+' repeated pagination');report.browsing.push({id:source.id,first:first.items.length,next:second?.items.length||0,total:first.total,notice:first.notice});console.log(JSON.stringify(report.browsing.at(-1)));}
  for(const [id,q,remoteId] of [['17k','九星霸体诀','1398783'],['zongheng','剑来','672340'],['wikisource','儒林外史','儒林外史'],['wikisource','聊斋','聊齋誌異']]){
   const result=await s.search(id,q);assert.ok(result.items.length>0,id+' search');const book=await s.add(id,remoteId);const index=book.chapters.findIndex(c=>!c.locked&&/^(第一章|第一回|第一卷)/.test(c.title));const c=await s.chapter(book,Math.max(0,index));const chars=c.paragraphs.join('').length;assert.ok(chars>500,id+' story too short: '+chars);book.chapters[Math.max(0,index)]=c;const updated=await s.refresh(book);assert.ok(updated.chapters.some(x=>x.paragraphs?.join('').length===chars),'refresh lost cache');report.reading.push({id,title:book.title,author:book.author,results:result.items.length,chapters:book.chapters.length,vip:book.chapters.filter(c=>c.locked).length,firstTitle:c.title,characters:chars});console.log(JSON.stringify(report.reading.at(-1)));
  }
  const combined=await s.search('all','修仙');report.combined={count:combined.items.length,providers:[...new Set(combined.items.map(x=>x.sourceId))],notice:combined.notice};assert.ok(combined.items.length>0);console.log(JSON.stringify(report.combined));
  fs.writeFileSync(path.join(root,'expanded-network.json'),JSON.stringify(report,null,2));app.exit(0);
 }catch(e){console.error(e);fs.writeFileSync(path.join(root,'expanded-network-failed.json'),JSON.stringify(report,null,2));app.exit(1);}
});
