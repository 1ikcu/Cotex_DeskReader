const {contextBridge,ipcRenderer,webUtils}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke(name,...args);
contextBridge.exposeInMainWorld('desk',{
 state:()=>call('state'),open:id=>call('open',id),import:()=>call('import'),
 drop:files=>call('import-paths',Array.from(files).map(f=>webUtils.getPathForFile(f))),
 patch:(id,p)=>call('patch',id,p),settings:p=>call('settings',p),remove:id=>call('remove',id),
 search:(source,q,page)=>call('search',source,q,page),add:(source,id)=>call('add',source,id),
 bookAccess:(source,id)=>call('book-access',source,id),
 chapter:(id,index)=>call('chapter',id,index),find:(id,q)=>call('find',id,q),refresh:id=>call('refresh',id),
 export:id=>call('export',id),backup:()=>call('backup'),restore:()=>call('restore'),
 external:url=>call('external',url),window:action=>call('window',action),menu:name=>call('menu',name),
 onAction:fn=>{const handler=(_,a)=>fn(a);ipcRenderer.on('action',handler);return ()=>ipcRenderer.removeListener('action',handler);}
});
