const {Sources}=require('../electron/sources.cjs');
(async()=>{
 const s=new Sources(fetch);const output={};
 const classics=await s.search('gutenberg','西游记');output.classicSearch=classics.items.length;
 const book=await s.add('gutenberg','23962');output.classicChapters=book.chapters.length;
 const novels=await s.search('sfacg','科幻');output.webnovelSearch=novels.items.length;
 if(!novels.items.length)throw new Error('No web novels');
 const novel=await s.add('sfacg',novels.items[0].remoteId);output.webnovelTitle=novel.title;output.webnovelChapters=novel.chapters.length;
 const i=novel.chapters.findIndex(c=>!c.locked);const chapter=await s.chapter(novel,i);output.chapterParagraphs=chapter.paragraphs.length;output.chapterCharacters=chapter.paragraphs.join('').length;
 console.log(JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
