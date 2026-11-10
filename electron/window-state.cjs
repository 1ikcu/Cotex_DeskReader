const fs = require('node:fs');

// Electron's window bounds and display work areas are in device-independent pixels.
function fitBounds(saved, displays, primary) {
 const valid = saved && ['x','y','width','height'].every(k=>Number.isFinite(saved[k])) && saved.width>0 && saved.height>0;
 const wanted = valid ? saved : {width:1340,height:760};
 const overlap = area => valid ? Math.max(0,Math.min(saved.x+saved.width,area.x+area.width)-Math.max(saved.x,area.x))*Math.max(0,Math.min(saved.y+saved.height,area.y+area.height)-Math.max(saved.y,area.y)) : 0;
 const matching = displays.map(d=>({area:d.workArea,overlap:overlap(d.workArea)})).sort((a,b)=>b.overlap-a.overlap)[0];
 const area = matching?.overlap>0 ? matching.area : primary.workArea;
 const width = Math.round(Math.min(area.width,Math.max(720,wanted.width)));
 const height = Math.round(Math.min(area.height,Math.max(580,wanted.height)));
 const x = valid && matching?.overlap>0 ? saved.x : area.x+(area.width-width)/2;
 const y = valid && matching?.overlap>0 ? saved.y : area.y+(area.height-height)/2;
 return {x:Math.round(Math.max(area.x,Math.min(x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(y,area.y+area.height-height))),width,height,maximized:!!valid&&saved.maximized===true};
}
function readWindowState(file,screen) {
 let saved;try {saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 return fitBounds(saved,screen.getAllDisplays(),screen.getPrimaryDisplay());
}
function rememberWindow(win,file) {
 let timer,normal=win.getNormalBounds(),maximized=false;
 const save=()=>{
  clearTimeout(timer);if(win.isDestroyed())return;
  if(!win.isMinimized()&&!win.isFullScreen()) {maximized=win.isMaximized();if(!maximized)normal=win.getNormalBounds();}
  const tmp=file+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({...normal,maximized}));fs.renameSync(tmp,file);}catch(e){console.warn('Window size could not be saved:',e.code||e.message);}
 };
 for(const event of ['resize','move','maximize','unmaximize','leave-full-screen'])win.on(event,()=>{clearTimeout(timer);timer=setTimeout(save,200);});
 win.on('close',save);win.on('closed',()=>clearTimeout(timer));return save;
}
module.exports={fitBounds,readWindowState,rememberWindow};

