import React,{useState,useEffect,useRef} from 'react';

export function VipBadge({sourceId,remoteId,known}){
 const [hasVip,setHasVip]=useState(known),anchor=useRef(null);
 useEffect(()=>{
  let alive=true,pending=false,attempted=false;
  setHasVip(known);
  if(typeof known==='boolean'||!['sfacg','17k','zongheng'].includes(sourceId))return;
  const observer=new IntersectionObserver(entries=>{
   if(!entries.some(e=>e.isIntersecting)){attempted=false;return;}
   if(pending||attempted)return;pending=true;attempted=true;
   window.desk.bookAccess(sourceId,remoteId).then(data=>{if(alive)setHasVip(data.hasVip);observer.disconnect();}).catch(()=>{}).finally(()=>{pending=false;});
  },{root:anchor.current.closest('.library-scroll'),rootMargin:'80px'});
  observer.observe(anchor.current.parentElement);
  return ()=>{alive=false;observer.disconnect();};
 },[sourceId,remoteId,known]);
 return <span ref={anchor} className={hasVip?'vip-badge':'vip-anchor'} title={hasVip?'包含原站 VIP 章节':undefined} aria-label={hasVip?'包含 VIP 章节':undefined}>{hasVip?'VIP':''}</span>;
}
