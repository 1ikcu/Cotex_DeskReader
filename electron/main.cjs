const {app,BrowserWindow,ipcMain,dialog,Menu,net,shell,session,screen}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parseTXT,parseEPUB,finalizeBook,chapterMatches,MAX_BYTES,uid}=require('./core.cjs');
const {Store}=require('./store.cjs');
const {Sources,SOURCE_LIST,isSourceURL,withCatalog}=require('./sources.cjs');
const {readWindowState,rememberWindow}=require('./window-state.cjs');
let win,store,sources,closeAllowed=false;
app.setName('Cotex');
const dev=process.env.COTEX_DEV_URL||process.env.DESKREADER_DEV_URL;
const testData=process.env.COTEX_DATA||process.env.DESKREADER_DATA;
if(testData)app.setPath('userData',path.resolve(testData));
else app.setPath('userData',path.join(app.getPath('appData'),'DeskReader'));
app.setAppUserModelId('local.deskreader.app');
const only=app.requestSingleInstanceLock();
if(!only)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
const contentFile=path.join(__dirname,'../dist/index.html');
const send=a=>win?.webContents.send('action',a);
function handler(name,fn){ipcMain.handle(name,async(e,...args)=>{
 const url=e.senderFrame?.url||'';
 if(e.sender!==win?.webContents||e.senderFrame!==e.sender.mainFrame||!(url===pathToFileURL(contentFile).href||(dev&&url.startsWith(dev))))throw new Error('非法请求');
 return fn(...args);
});}
async function imports(paths){
 const results=[],errors=[];
 for(const file of paths.slice(0,20)){try{
  if(typeof file!=='string'||!/\.(txt|epub)$/i.test(file))throw new Error('请选择 TXT 或 EPUB 文件。');
  const stat=await fs.promises.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw new Error('文件超过 60 MB。');
  const bytes=await fs.promises.readFile(file);const p=/\.epub$/i.test(file)?await parseEPUB(bytes,path.basename(file)):parseTXT(bytes,path.basename(file));
  results.push(store.add(finalizeBook(p,'local:'+uid(bytes))));
 }catch(e){errors.push(path.basename(file)+'：'+e.message);}}
 return {books:results,errors};
}
async function chooseImport(){const r=await dialog.showOpenDialog(win,{title:'导入本地小说',properties:['openFile','multiSelections'],filters:[{name:'小说文件',extensions:['txt','epub']}]});return r.canceled?{books:[],errors:[]}:imports(r.filePaths);}
function register(){
 handler('state',()=>({...store.state(),sources:SOURCE_LIST}));
 handler('open',id=>{const b=store.get(id);store.db.activeId=id;store.write();return b;});
 handler('import',chooseImport);
 handler('import-paths',files=>imports(Array.isArray(files)?files:[]));
 handler('patch',(id,p)=>store.patch(id,p||{}));
 handler('settings',p=>store.settings(p||{}));
 handler('remove',id=>{store.remove(id);return store.state();});
 handler('search',(id,q,page)=>sources.search(id,q,page));
 handler('book-access',(id,remoteId)=>sources.bookAccess(id,remoteId));
 handler('add',async(id,remoteId)=>{const known=store.db.books.find(b=>b.source.id===id&&b.source.remoteId===remoteId);return known?store.get(known.id):store.add(await sources.add(id,remoteId));});
 handler('chapter',async(id,index)=>{
  if(!Number.isInteger(index))throw new Error('无效章节');
  const b=store.get(id);const c=await sources.chapter(b,index);
  if(!b.chapters[index].paragraphs){const latest=store.get(id);const target=latest.chapters.findIndex(x=>x.url===c.url);if(target>=0){latest.chapters[target]=c;store.save(latest);}}return c;
 });
 handler('find',(id,q)=>chapterMatches(store.get(id).chapters,String(q||'').slice(0,120)));
 handler('refresh',async id=>{const original=store.get(id);const updated=await sources.refresh(original);const latest=store.get(id);return store.save(original.updatedAt===latest.updatedAt?updated:withCatalog(latest,updated.chapters));});
 handler('external',url=>{const u=new URL(url);if(!isSourceURL(u.toString())&&!(u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port))throw new Error('不支持的链接');return shell.openExternal(u.toString());});
 handler('export',async id=>{const b=store.get(id);const r=await dialog.showSaveDialog(win,{defaultPath:b.title.replace(/[\\/:*?"<>|]/g,'_')+'.txt',filters:[{name:'TXT 文本',extensions:['txt']}]});if(r.canceled)return false;let t=b.title+'\n'+b.author+'\n来源：'+(b.source.url||'本地导入')+'\n\n';for(const c of b.chapters)if(c.paragraphs)t+=c.title+'\n\n'+c.paragraphs.join('\n\n')+'\n\n';await fs.promises.writeFile(r.filePath,t,'utf8');return true;});
 handler('backup',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Cotex-backup.json',filters:[{name:'书库备份',extensions:['json']}]});if(r.canceled)return false;await fs.promises.writeFile(r.filePath,JSON.stringify({format:'DeskReaderBackup',version:1,settings:store.db.settings,books:store.db.books.map(b=>store.get(b.id))}),'utf8');return true;});
 handler('restore',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'书库备份',extensions:['json']}]});if(r.canceled)return null;const f=r.filePaths[0];if((await fs.promises.stat(f)).size>300*1024*1024)throw new Error('备份文件过大');const d=JSON.parse(await fs.promises.readFile(f,'utf8'));if(d.format!=='DeskReaderBackup'||d.version!==1||!Array.isArray(d.books))throw new Error('不是有效的 Cotex / DeskReader 备份');for(const b of d.books){if(!/^[a-f0-9]{24}$/.test(b.id)||!Array.isArray(b.chapters)||!b.chapters.length||typeof b.title!=='string'||!b.progress||!Array.isArray(b.bookmarks)||!Array.isArray(b.collapsed))throw new Error('备份内容不完整');for(const c of b.chapters)if(typeof c.title!=='string'||(c.paragraphs!==null&&(!Array.isArray(c.paragraphs)||c.paragraphs.some(p=>typeof p!=='string'))))throw new Error('备份章节格式有误');}for(const b of d.books)store.add(b);store.settings(d.settings||{});return store.state();});
 handler('window',a=>{if(a==='minimize')win.minimize();if(a==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(a==='close'){closeAllowed=true;win.close();}});
 handler('menu',name=>{
  const definitions={
   file:[{label:'新聊天',accelerator:'CmdOrCtrl+O',click:()=>send('import')},{label:'搜索',accelerator:'CmdOrCtrl+K',click:()=>send('search')},{type:'separator'},{label:'导出当前文本',click:()=>send('export')},{label:'备份书库',click:()=>send('backup')},{label:'恢复书库',click:()=>send('restore')},{type:'separator'},{label:'退出',role:'quit'}],
   edit:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}],
   view:[{label:'侧边栏',click:()=>send('sidebar')},{label:'章节目录',click:()=>send('toc')},{label:'全部收起',click:()=>send('collapse')},{label:'工作摘要（阅读区按空格）',click:()=>send('boss')},{type:'separator'},{label:'设置',click:()=>send('settings')},{role:'togglefullscreen',label:'全屏'}],
   help:[{label:'使用说明',click:()=>send('help')},{label:'关于 Cotex',click:()=>send('about')}]
  };if(definitions[name])Menu.buildFromTemplate(definitions[name]).popup({window:win});
 });
}
app.whenReady().then(()=>{
 store=new Store(app.getPath('userData'));sources=new Sources((url,init)=>net.fetch(url,init));
 if(!store.db.seeded){
  const seeds=[['watermargin','23863','水浒传（七十回本）','施耐庵','检查原表'],['threekingdoms','23950','三国演义','罗贯中','分类细则最终版'],['redchamber','24264','红楼梦','曹雪芹','整理需求文档'],['journey','23962','西游记','吴承恩','核对项目资料']];
  for(const [name,id,title,author,alias] of seeds){const file=path.join(__dirname,'../assets/'+name+'.txt');if(fs.existsSync(file)){const b=finalizeBook({...parseTXT(fs.readFileSync(file),title+'.txt',{gutenberg:true,wrapped:true}),author},'gutenberg:'+id,{id:'gutenberg',name:'Project Gutenberg',remoteId:id,url:'https://www.gutenberg.org/ebooks/'+id});b.alias=alias;store.add(b);}}
  store.db.seeded=true;store.write();
 }
 Menu.setApplicationMenu(null);
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 const stateFile=path.join(app.getPath('userData'),'window-state.json');
 const {maximized,...bounds}=readWindowState(stateFile,screen);
 win=new BrowserWindow({...bounds,minWidth:Math.min(720,bounds.width),minHeight:Math.min(580,bounds.height),frame:false,backgroundColor:'#f8f0f6',title:'Cotex',icon:path.join(__dirname,'../assets/icon.png'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
 rememberWindow(win,stateFile);
 win.webContents.setZoomFactor(1);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 register();
 win.on('close',event=>{if(!closeAllowed&&!win.webContents.isDestroyed()){event.preventDefault();send('prepare-close');}});
 win.once('ready-to-show',()=>{if(maximized)win.maximize();win.show();});
 if(dev)win.loadURL(dev);else win.loadFile(contentFile);
}).catch(e=>{dialog.showErrorBox('Cotex 启动失败',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
