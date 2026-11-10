const {app,net}=require('electron');
for(const stream of [process.stdout,process.stderr])stream?.on('error',e=>{if(e.code!=='EPIPE')throw e;});
const {Sources}=require('../electron/sources.cjs');
app.setPath('userData',require('node:path').join(__dirname,'../test-results/network-'+Date.now()));
app.whenReady().then(async()=>{
 const sources=new Sources((u,i)=>net.fetch(u,i));const result={};
 try{
  const classic=await sources.search('gutenberg','封神');result.classicResults=classic.items.length;console.log('Classic search: '+classic.items.length);
  const c=await sources.add('gutenberg','23910');result.classicChapters=c.chapters.length;console.log('Classic full text: '+c.chapters.length+' chapters');
  const r=await sources.search('sfacg','没有人比我更懂修仙');result.webnovelResults=r.items.length;console.log('Web search: '+r.items.length);
  const n=await sources.add('sfacg',r.items.find(x=>x.remoteId==='375446').remoteId);result.webnovelTitle=n.title;result.catalogChapters=n.chapters.length;console.log('Catalog: '+n.chapters.length);
  const idx=n.chapters.findIndex(c=>!c.locked&&/^第一章/.test(c.title));const chapter=await sources.chapter(n,idx);result.chapterTitle=chapter.title;result.paragraphs=chapter.paragraphs.length;result.characters=chapter.paragraphs.join('').length;if(result.characters<500)throw new Error('Story text too short');
  console.log(JSON.stringify(result,null,2));require('node:fs').writeFileSync(require('node:path').join(__dirname,'../test-results/network.json'),JSON.stringify(result,null,2));app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
