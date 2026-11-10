const {app,net}=require('electron');
const {Sources}=require('../electron/sources.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(__dirname,'../test-results/access-network'));
for(const stream of [process.stdout,process.stderr])stream?.on('error',e=>{if(e.code!=='EPIPE')throw e;});
app.whenReady().then(async()=>{try{
 const s=new Sources((url,init)=>net.fetch(url,init));
 const checks=[['sfacg','375446'],['17k','1398783'],['zongheng','672340']];
 const result=await Promise.all(checks.map(async([source,id])=>({source,id,...await s.bookAccess(source,id)})));
 for(const r of result)assert.equal(r.hasVip,true,r.source);
 assert.deepEqual(await s.bookAccess('gutenberg','23962'),{hasVip:false});
 assert.deepEqual(await s.bookAccess('wikisource','西游记'),{hasVip:false});
 fs.writeFileSync(path.join(__dirname,'../test-results/vip-network.json'),JSON.stringify(result,null,2));
 console.log('PASS: actual VIP catalogues from all three web novel providers; public domain books untagged.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}});
