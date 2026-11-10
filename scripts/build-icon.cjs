// Export generated artwork inside a native rounded-square Windows icon tile.
// The book artwork is preserved; the tile clips only the outer white corners.
const fs=require('node:fs'),path=require('node:path');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});
 process.exit(result.status??1);
}
const {app,BrowserWindow,nativeImage}=require('electron');
const assets=path.resolve(__dirname,'../assets');
app.setPath('userData',path.resolve(__dirname,'../test-results/icon-export'));
for(const stream of [process.stdout,process.stderr])stream?.on('error',e=>{if(e.code!=='EPIPE')throw e;});
app.whenReady().then(async()=>{
 const artwork=nativeImage.createFromPath(path.join(assets,'icon-artwork.png'));
 if(artwork.isEmpty())throw Error('Generated book artwork is missing');
 const win=new BrowserWindow({width:1024,height:1024,show:false,transparent:true,frame:false,webPreferences:{sandbox:true,contextIsolation:true}});
 await win.loadURL('data:text/html,<html><body></body></html>');
 const render=async dataURL=>{
  const source=new Image();source.src=dataURL;await source.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d');ctx.beginPath();ctx.roundRect(0,0,1024,1024,225);ctx.clip();
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);ctx.drawImage(source,0,0,1024,1024);
  return canvas.toDataURL('image/png');
 };
 const data=await win.webContents.executeJavaScript('('+render.toString()+')('+JSON.stringify(artwork.toDataURL())+')');
 const source=nativeImage.createFromDataURL(data);
 fs.writeFileSync(path.join(assets,'icon.png'),source.toPNG());
 const sizes=[16,20,24,32,40,48,64,96,128,256];
 const images=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG());
 const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 sizes.forEach((size,i)=>{const at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length;});
 fs.writeFileSync(path.join(assets,'icon.ico'),Buffer.concat([header,...images]));
 const previews=path.resolve(__dirname,'../test-results/icons');fs.mkdirSync(previews,{recursive:true});
 sizes.forEach((size,i)=>fs.writeFileSync(path.join(previews,size+'.png'),images[i]));
 win.destroy();console.log('Exported white book icon with transparent rounded corners: '+sizes.join(', ')+' px');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
