const {app,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(__dirname,'../test-results/net-debug-'+Date.now()));
app.whenReady().then(async()=>{
 try{
  for(const [name,url] of [['sf','https://book.sfacg.com/Novel/375446/520558/4483426/'],['fengshen','https://www.gutenberg.org/cache/epub/23910/pg23910.txt']]){
   const r=await net.fetch(url,{headers:{'User-Agent':'Mozilla/5.0 DeskReader/1.0'}});const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync(path.join(__dirname,'../test-results/'+name+'-net.txt'),b);
   const $=require('cheerio').load(b.toString('utf8'));console.log(name,r.status,Object.fromEntries(r.headers),b.length,$('#ChapterBody').text().slice(0,40));
  }
 }catch(e){console.error(e);}app.exit(0);
});
