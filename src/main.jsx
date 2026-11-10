import React,{useState,useEffect,useLayoutEffect,useRef,useMemo,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import * as OpenCC from 'opencc-js';
import {ArrowLeft,ArrowRight,ArrowDown,ArrowUp,MoreHorizontal,ChevronDown,ChevronRight,Plus,ShieldAlert,AudioLines,X,Minus,Square,Check,Bookmark,Copy,RefreshCw,Download,Upload,Settings,List,FileText,Globe,ChevronsUp,ExternalLink,LoaderCircle,BookOpen,Trash2,Pencil,FolderOpen,Command,Wifi,CheckCheck,RotateCcw,Eye,MessageSquare,Zap,Files,Clock,AtSign,GitFork} from 'lucide-react';
import {PanelLeft,PanelRight,Home,LayoutGrid,Bell,Search,SquarePen,SlidersHorizontal,Mic,DotPet} from './ui-icons.jsx';
import {VipBadge} from './vip-badge.jsx';
import './style.css';
import cotexIcon from '../assets/icon.png';
import {version as appVersion} from '../package.json';
import {readingPercent} from './progress.mjs';
const api=window.desk;
const convert=OpenCC.Converter({from:'tw',to:'cn'});
const defaultSettings={fontSize:14,lineHeight:1.7,width:736,hints:true,hintFrequency:5,theme:'light',simplified:true,group:'工作空间'};
function IconButton({icon:Icon,label,onClick,className='',...props}){return <button type="button" className={'icon-button '+className} title={label} aria-label={label} onClick={onClick} {...props}><Icon size={19} strokeWidth={1.7}/></button>}
function Modal({title,onClose,children,wide=false}){
 const ref=useRef();
 useEffect(()=>{const previous=document.activeElement;ref.current?.focus();const trap=e=>{if(e.key!=='Tab')return;const nodes=Array.from(ref.current.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]'));if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};ref.current.addEventListener('keydown',trap);return ()=>previous?.focus();},[]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} className={'modal '+(wide?'wide':'')}><div className="modal-head"><h2>{title}</h2><IconButton icon={X} label="关闭" onClick={onClose}/></div>{children}</section></div>;
}
const workHints=['已使用 浏览器','已使用 浏览器和文档加载了工具运行了命令','核对资料结构与上下文','已完成内容索引','已使用 浏览器','正在检查引用与记录'];
function WorkHint({seed=0}){const n=(seed*17+3)%workHints.length;return <div className="work-hint" aria-hidden="true">{n===0||n===4?<span className="browser-icon"><FileText size={14}/><span/></span>:<LayoutGrid size={16} strokeWidth={1.6}/>}<span>{workHints[n]}</span></div>}
function App(){
 const [library,setLibrary]=useState([]),[book,setBook]=useState(null),[settings,setSettings]=useState(defaultSettings),[sources,setSources]=useState([]);
 const [ready,setReady]=useState(false),[modal,setModal]=useState(null),[sidebar,setSidebar]=useState(true),[toc,setToc]=useState(false),[boss,setBoss]=useState(false),[toast,setToast]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [range,setRange]=useState({start:0,end:0}),[current,setCurrent]=useState(0),[chapterErrors,setChapterErrors]=useState({}),[query,setQuery]=useState(''),[hits,setHits]=useState(null),[searching,setSearching]=useState(false),[tocQuery,setTocQuery]=useState(''),[tocTab,setTocTab]=useState('chapters'),[dragging,setDragging]=useState(false);
 const [readingPosition,setReadingPosition]=useState({chapter:0,paragraph:0});
 const [context,setContext]=useState(null),[rename,setRename]=useState(''),[pendingRemove,setPendingRemove]=useState(null);
 const scrollRef=useRef(),inputRef=useRef(),bookRef=useRef(),rangeRef=useRef(range),loadingChapters=useRef(new Set()),toastTimer=useRef(),progressTimer=useRef(),pendingProgress=useRef(),restoreAnchor=useRef(null),collapseAnchor=useRef(null),saveBusy=useRef(false),actionsRef=useRef(),openVersion=useRef(0);
 const pointerFocusedButton=useRef(null);
 bookRef.current=book;rangeRef.current=range;
 const say=useCallback(message=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3400);},[]);
 const display=useCallback(text=>settings.simplified?convert(text||''):text||'',[settings.simplified]);
 const sync=useCallback(async()=>{const d=await api.state();setLibrary(d.books);setSettings(d.settings);setSources(d.sources);return d;},[]);
 const flushProgress=useCallback(async()=>{
  clearTimeout(progressTimer.current);if(saveBusy.current||!pendingProgress.current)return;
  const p=pendingProgress.current;pendingProgress.current=null;saveBusy.current=true;
  try{const s=await api.patch(p.id,{progress:p.progress});setLibrary(items=>items.map(x=>x.id===s.id?s:x));}catch(e){say('进度保存失败：'+e.message);pendingProgress.current=p;}finally{saveBusy.current=false;if(pendingProgress.current)progressTimer.current=setTimeout(flushProgress,500);}
 },[say]);
 const openBook=useCallback(async(id)=>{
  const version=++openVersion.current;await flushProgress();
  const b=await api.open(id);if(version!==openVersion.current)return;
  setBook(b);setReadingPosition(b.progress||{chapter:0,paragraph:0});const i=b.progress?.chapter||0;setCurrent(i);setRange({start:i,end:Math.min(i+1,b.chapters.length-1)});setChapterErrors({});setHits(null);setQuery('');setBoss(false);setContext(null);restoreAnchor.current={index:i,paragraph:b.progress?.paragraph||0};if(window.innerWidth<1000)setSidebar(false);
 },[flushProgress]);
 useEffect(()=>{(async()=>{try{if(!api)throw new Error('请运行 Windows 应用，浏览器预览不支持本地书库。');const d=await sync();if(d.activeId)await openBook(d.activeId);else if(d.books[0])await openBook(d.books[0].id);}catch(e){setError(e.message);}finally{setReady(true);}})();return ()=>clearTimeout(toastTimer.current);},[]);
 const run=useCallback(async(label,fn)=>{setBusy(label);setError('');try{return await fn();}catch(e){setError(e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{setBusy('');}},[]);
 async function importBooks(files){await run('正在导入…',async()=>{const r=files?await api.drop(files):await api.import();await sync();if(r.books.length){await openBook(r.books.at(-1).id);say('已导入 '+r.books.length+' 本，原文件保留不变');}if(r.errors.length)setError(r.errors.join('\n'));});}
 const saveSettings=async p=>{setSettings(s=>({...s,...p}));try{const s=await api.settings(p);setSettings(s);}catch(e){say(e.message);}};
 const loadChapter=useCallback(async(id,index)=>{
  const key=id+':'+index;if(loadingChapters.current.has(key))return;loadingChapters.current.add(key);
  setChapterErrors(e=>({...e,[index]:null}));
  try{const c=await api.chapter(id,index);setBook(b=>b?.id!==id?b:{...b,chapters:b.chapters.map((x,i)=>i===index?c:x)});}
  catch(e){if(bookRef.current?.id===id)setChapterErrors(s=>({...s,[index]:e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'' )}));}
  finally{loadingChapters.current.delete(key);}
 },[]);
 useEffect(()=>{if(!book)return;for(let i=range.start;i<=range.end;i++){const c=book.chapters[i];if(c&&!c.paragraphs&&!c.locked&&!chapterErrors[i])loadChapter(book.id,i);}},[book?.id,range,book?.chapters,chapterErrors]);
 useEffect(()=>{
  const r=restoreAnchor.current;if(!r||!book||!scrollRef.current)return;
  if(!book.chapters[r.index]?.paragraphs&&!book.chapters[r.index]?.locked)return;
  const timer=setTimeout(()=>{if(restoreAnchor.current!==r)return;const container=scrollRef.current;const target=(r.paragraph>0?container?.querySelector('[data-chapter="'+r.index+'"][data-paragraph="'+r.paragraph+'"]'):null)||document.getElementById('chapter-'+r.index);if(target&&container){container.scrollTop+=target.getBoundingClientRect().top-container.getBoundingClientRect().top-22;restoreAnchor.current=null;}},60);return ()=>clearTimeout(timer);
 },[book,range,boss,settings.fontSize]);
 useLayoutEffect(()=>{
  const anchor=collapseAnchor.current,container=scrollRef.current;if(!anchor||!container)return;
  const release=()=>{if(collapseAnchor.current===anchor){collapseAnchor.current=null;container.style.overflowAnchor=anchor.overflowAnchor;}};
  if(anchor.bookId!==book?.id){release();return;}
  const align=()=>{const line=document.querySelector('#chapter-'+anchor.index+' .thought-line');if(line)container.scrollTop+=line.getBoundingClientRect().top-container.getBoundingClientRect().top-anchor.offset;};
  // Hold the clicked chapter through the DOM shrink and browser scroll events.
  align();let second;const first=requestAnimationFrame(()=>{align();second=requestAnimationFrame(release);});
  return ()=>{cancelAnimationFrame(first);if(second)cancelAnimationFrame(second);release();};
 },[book?.id,book?.collapsed]);
 function jump(index,paragraph=0){
  const b=bookRef.current;if(!b||index<0||index>=b.chapters.length)return;
  flushProgress();setCurrent(index);setReadingPosition({chapter:index,paragraph});setBoss(false);setRange({start:index,end:Math.min(index+1,b.chapters.length-1)});setBook({...b,collapsed:b.collapsed.filter(i=>i!==index),progress:{chapter:index,paragraph}});api.patch(b.id,{collapsed:b.collapsed.filter(i=>i!==index)}).catch(e=>say(e.message));restoreAnchor.current={index,paragraph};setHits(null);setQuery('');pendingProgress.current={id:b.id,progress:{chapter:index,paragraph}};progressTimer.current=setTimeout(flushProgress,200);if(window.innerWidth<1150)setToc(false);
 }
 function onScroll(){
  if(boss||restoreAnchor.current||collapseAnchor.current||!bookRef.current)return;const sc=scrollRef.current;const top=sc.getBoundingClientRect().top;
  const elements=sc.querySelectorAll('.chapter:not(.collapsed) .prose [data-paragraph]');let candidate=null;
  for(const el of elements){const r=el.getBoundingClientRect();if(r.bottom>top+36&&r.top<sc.getBoundingClientRect().bottom){candidate=el;break;}}
  if(!candidate)return;const chapter=+candidate.dataset.chapter,paragraph=+candidate.dataset.paragraph;
  setCurrent(chapter);const b=bookRef.current;
  const last=sc.querySelector('[data-chapter="'+(b.chapters.length-1)+'"][data-paragraph="'+((b.chapters.at(-1)?.paragraphs?.length||1)-1)+'"]');
  const finished=!!last&&!b.collapsed.includes(b.chapters.length-1)&&sc.scrollTop>0&&last.getBoundingClientRect().bottom<=sc.getBoundingClientRect().bottom+2;
  const progress=finished?{chapter:b.chapters.length-1,paragraph:Math.max(0,(b.chapters.at(-1)?.paragraphs?.length||1)-1),finished:true}:{chapter,paragraph,finished:false};
  b.progress=progress;setReadingPosition(progress);pendingProgress.current={id:b.id,progress};clearTimeout(progressTimer.current);progressTimer.current=setTimeout(flushProgress,650);
 }
 useEffect(()=>{const blur=()=>flushProgress();window.addEventListener('blur',blur);document.addEventListener('visibilitychange',blur);return ()=>{window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',blur);};},[flushProgress]);
 async function findChapter(e){e?.preventDefault();if(!book){say('先点“新聊天”导入小说');return;}if(!query.trim()){inputRef.current?.focus();return;}setSearching(true);try{const result=await api.find(book.id,query);if(result.length===1){jump(result[0].index);say('已定位到 '+display(result[0].title));}else setHits(result);}catch(e){say(e.message);}finally{setSearching(false);}}
 async function toggleCollapsed(index){
  const b=bookRef.current;if(!b)return;
  const container=scrollRef.current,line=document.querySelector('#chapter-'+index+' .thought-line');
  if(container&&line){
   const top=line.getBoundingClientRect().top-container.getBoundingClientRect().top;
   const overflowAnchor=collapseAnchor.current?.overflowAnchor??container.style.overflowAnchor;
   collapseAnchor.current={bookId:b.id,index,offset:Math.max(22,Math.min(top,container.clientHeight-line.clientHeight-22)),overflowAnchor};
   container.style.overflowAnchor='none';
  }
  restoreAnchor.current=null;
  const collapsed=b.collapsed.includes(index)?b.collapsed.filter(x=>x!==index):[...b.collapsed,index];
  setCurrent(index);setBook({...b,collapsed});await api.patch(b.id,{collapsed}).catch(e=>say(e.message));
 }
 async function collapseAll(){if(!book)return;const collapsed=book.chapters.map((_,i)=>i);setBook({...book,collapsed});await api.patch(book.id,{collapsed});scrollRef.current?.scrollTo({top:0});say('正文已收起，点击用时行可展开');}
 async function bookmark(){if(!book)return;const p=book.progress||{chapter:current,paragraph:0};const exists=book.bookmarks.find(b=>b.chapter===p.chapter&&b.paragraph===p.paragraph);const bookmarks=exists?book.bookmarks.filter(b=>b!==exists):[...book.bookmarks,{...p,createdAt:Date.now()}];setBook({...book,bookmarks});await api.patch(book.id,{bookmarks});await sync();say(exists?'已移除当前位置书签':'已保存当前位置书签');}
 async function exportBook(){if(book)await run('正在导出…',async()=>{if(await api.export(book.id))say('已导出当前已缓存正文');});}
 async function refresh(){if(!book)return;if(!sources.find(s=>s.id===book.source.id)?.refreshable){say('本书已完整保存在本地');return;}await flushProgress();await run('正在检查更新…',async()=>{const b=await api.refresh(book.id);if(bookRef.current?.id===b.id){const i=b.progress.chapter;restoreAnchor.current={index:i,paragraph:b.progress.paragraph};setBook(b);setCurrent(i);setReadingPosition(b.progress);setRange({start:i,end:Math.min(i+1,b.chapters.length-1)});setChapterErrors({});}await sync();say('目录已更新，共 '+b.chapters.length+' 章');});}
 const action=async a=>{if(a==='prepare-close')return flushProgress().finally(()=>api.window('close'));if(a==='import')return importBooks();if(a==='search')return setModal('library');if(a==='export')return exportBook();if(a==='backup')return run('正在备份…',async()=>{if(await api.backup())say('书库备份已保存');});if(a==='restore')return run('正在恢复…',async()=>{const d=await api.restore();if(d){await sync();if(d.activeId)await openBook(d.activeId);say('已合并恢复书库，现有书籍保留');}});if(a==='sidebar')return setSidebar(v=>!v);if(a==='toc')return setToc(v=>!v);if(a==='collapse')return collapseAll();if(a==='boss'){if(boss&&book)restoreAnchor.current={index:book.progress.chapter,paragraph:book.progress.paragraph};else flushProgress();setBoss(v=>!v);setModal(null);setHits(null);setContext(null);return;}setModal(a);};
 actionsRef.current=action;
 useEffect(()=>api?.onAction(a=>actionsRef.current(a)),[]);
 useEffect(()=>{const key=e=>{
  if(e.key==='Tab')pointerFocusedButton.current=null;
  if(e.key==='Escape'){setModal(null);setHits(null);setContext(null);setError('');if(boss)setBoss(false);return;}
  if (e.key === ' ') {
   const focused = document.activeElement;
   const readingFocus = focused === document.body || focused === scrollRef.current ||
       focused === pointerFocusedButton.current;
   if (!book || modal || !readingFocus || e.defaultPrevented || e.isComposing ||
       e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
   e.preventDefault();
   if (!e.repeat) actionsRef.current('boss');
   return;
  }
  if((e.ctrlKey||e.metaKey)&&['o','k','f','b','d'].includes(e.key.toLowerCase())){e.preventDefault();const k=e.key.toLowerCase();if(k==='o')actionsRef.current('import');if(k==='k')setModal('library');if(k==='f'){setBoss(false);inputRef.current?.focus();}if(k==='b')setSidebar(s=>!s);if(k==='d')bookmark();return;}
  const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(typing||modal)return;
  if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();jump(current+1);}if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();jump(current-1);}
 };window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[book,current,boss,modal]);
 const chapterList=useMemo(()=>book?.chapters.map((c,i)=>({...c,index:i})).filter(c=>!tocQuery||display(c.title).toLowerCase().includes(display(tocQuery).toLowerCase())||String(c.index+1)===tocQuery)||[],[book?.chapters,tocQuery,display]);
 const percent=readingPercent(book,readingPosition);
 const progressLabel=book?'阅读进度 '+percent+'%，第 '+((readingPosition.chapter||0)+1)+' / '+book.chapters.length+' 章':'尚未选择小说';
 const currentBookTitle=book?display(book.title):'';
 const visibleChapters=book?book.chapters.slice(range.start,range.end+1):[];
 function workSummary(){return <div className="summary-text"><p>已完成这部分资料的整理，内容结构与相关记录已核对。</p><ul><li>检查了原始资料与对应条目。</li><li>保留了有效记录，并同步当前处理位置。</li><li>后续可继续核对剩余部分。</li></ul><p>当前结果已保存在本地。</p></div>}
 function handlePointerDown(event) {
  if (modal || !(event.target instanceof Element)) return;
  const target = event.target;
  if (event.button === 0) pointerFocusedButton.current = target.closest('button');
  if (context && !target.closest('.book-more, .row-popover')) setContext(null);
 }
 return <div className={'app theme-'+settings.theme+(sidebar?'':' sidebar-hidden')+(boss?' boss-mode':'')} style={{'--reading-size':settings.fontSize+'px','--reading-leading':settings.lineHeight,'--reading-width':settings.width+'px'}}
 onPointerDownCapture={handlePointerDown}
 onDragOver={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setDragging(true);}}
 onDragLeave={e=>{if(!e.relatedTarget)setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)importBooks(e.dataTransfer.files);}}>
  <div className="titlebar" onDoubleClick={e=>{if(e.target===e.currentTarget)api?.window('maximize');}}>
   <div className="titlebar-left"><IconButton icon={ArrowLeft} label="上一章 Alt+←" onClick={()=>jump(current-1)} disabled={!book||current===0}/><IconButton icon={ArrowRight} label="下一章 Alt+→" onClick={()=>jump(current+1)} disabled={!book||current>=book.chapters.length-1}/><IconButton icon={PanelLeft} label="切换侧边栏 Ctrl+B" onClick={()=>setSidebar(s=>!s)}/></div>
   <nav className="app-menu">{[['文件','file'],['编辑','edit'],['视图','view'],['帮助','help']].map(([t,id])=><button key={id} onClick={()=>api?.menu(id)}>{t}</button>)}</nav><div className="window-drag"/>
   <div className="window-buttons"><button aria-label="最小化" onClick={()=>api?.window('minimize')}><Minus size={15}/></button><button aria-label="最大化" onClick={()=>api?.window('maximize')}><Square size={13}/></button><button className="close" aria-label="关闭窗口" onClick={()=>{flushProgress().finally(()=>api?.window('close'));}}><X size={18}/></button></div>
  </div>
  <div className="desktop-shell">
   <nav className="rail">
    <IconButton icon={Home} label="主页" className="active" onClick={()=>{setBoss(false);setModal(null);}}/>
    <IconButton icon={Files} label="书库 Ctrl+K" onClick={()=>setModal('library')}/>
    <IconButton icon={Clock} label="继续上次阅读" onClick={()=>{if(book)jump(book.progress.chapter,book.progress.paragraph);}}/>
    <IconButton icon={AtSign} label="书签" onClick={()=>{setToc(true);setTocTab('bookmarks');}}/>
    <IconButton icon={MoreHorizontal} label="更多设置" onClick={()=>setModal('settings')}/><div className="rail-rule"/>
    <IconButton icon={GitFork} label="更新目录" onClick={refresh}/><IconButton icon={LayoutGrid} label="搜索小说" onClick={()=>setModal('library')}/>
    <div className="rail-space"/><button className="reading-progress" title={progressLabel} aria-label={progressLabel} onClick={()=>{if(book){setBoss(false);setToc(t=>!t);setTocTab('chapters');}else setModal('library');}}><svg viewBox="0 0 28 28" width="28" height="28" role="progressbar" aria-label="小说阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><circle className="progress-track" cx="14" cy="14" r="11"/><circle className="progress-value" cx="14" cy="14" r="11" pathLength="100" strokeDasharray="100" strokeDashoffset={100-percent} transform="rotate(-90 14 14)"/><path className="progress-diamond" d="M14 8.8 19.2 14 14 19.2 8.8 14Z"/></svg></button><button className="avatar" title="关于 Cotex" onClick={()=>setModal('about')}>TI</button>
   </nav>
   <div className="workspace">
    {sidebar&&<aside className="sidebar">
     <div className="sidebar-header"><button className="brand" onClick={()=>setModal('settings')}>Codex <ChevronDown size={15}/></button><div className="header-tools"><IconButton icon={Bell} label="阅读记录" onClick={()=>{setToc(true);setTocTab('bookmarks');}}/><IconButton icon={Search} label="搜索小说库 Ctrl+K" onClick={()=>setModal('library')}/></div></div>
     <div className="sidebar-actions"><button onClick={()=>importBooks()}><SquarePen size={18}/>新聊天</button><button onClick={()=>setModal('help')}><DotPet/>你的 Dot</button></div>
     <div className="sidebar-list"><div className="group-title">{settings.group}</div>{library.map(b=><div key={b.id} className={'book-row '+(book?.id===b.id?'selected':'')}>
      <button className="book-select" aria-label={b.alias} onClick={()=>run('',()=>openBook(b.id))}><span className="work-name">{b.alias}</span><span className="real-name">{display(b.title)}</span></button>
      <button className="book-more" aria-label={'管理 '+b.alias} aria-expanded={context===b.id} onClick={()=>setContext(id=>id===b.id?null:b.id)}><MoreHorizontal size={17}/></button>
      {context===b.id&&<div className="row-popover"><button onClick={()=>{setRename(b.alias);setModal('rename');}}><Pencil size={15}/>修改工作标题</button><button onClick={()=>{setPendingRemove(b);setModal('remove');setContext(null);}}><Trash2 size={15}/>移出书库</button></div>}
     </div>)}
     {!library.length&&<div className="empty-sidebar">点击「新聊天」<br/>导入你的第一本小说</div>}
     <div className="group-title secondary-group">项目资料</div><button className="sidebar-link" onClick={()=>setModal('library')}>查找资料</button><button className="sidebar-link" onClick={()=>setModal('help')}>使用说明</button>
     </div>
    </aside>}
    <main className="main">
     <header className="chat-header"><div className="chat-heading">{book?.alias||'准备开始工作'}<ChevronDown size={14}/></div><div className="header-tools"><IconButton icon={MoreHorizontal} label="阅读设置" onClick={()=>setModal('settings')}/><IconButton icon={SlidersHorizontal} label="章节目录" onClick={()=>setToc(t=>!t)}/><span className="header-divider"/><IconButton icon={PanelRight} label="切换目录面板" onClick={()=>setToc(t=>!t)}/></div></header>
     <div className="reader-layout"><div className="conversation-area">
      <div className="conversation" ref={scrollRef} onScroll={onScroll}>
       <div className="reading-column">
       {!ready&&<div className="loading-state"><LoaderCircle className="spin" size={22}/>正在载入工作空间…</div>}
       {ready&&!book&&<div className="welcome"><div className="welcome-symbol"><BookOpen size={30}/></div><h1>今天，从哪里开始？</h1><p>导入一本书，或从小说库里找到下一段故事。</p><div><button className="primary" onClick={()=>importBooks()}><Plus size={17}/>新聊天</button><button className="secondary" onClick={()=>setModal('library')}><Search size={17}/>搜索资料</button></div><span>支持 TXT · EPUB，进度自动保存</span></div>}
       {book&&boss?<section className="boss-content"><div className="user-message"><span>核对资料并整理当前工作结果</span></div><div className="thought-line"><span>用时 1 分钟 28 秒</span><ChevronDown size={14}/></div><WorkHint seed={2}/><p>我会先检查当前资料的完整性，再核对对应条目和处理记录。</p><WorkHint seed={0}/><p>已检查资料结构和相关记录，内容已同步到当前工作空间。</p><WorkHint seed={4}/>{workSummary()}<div className="assistant-actions"><CheckCheck size={17}/><span>已完成</span></div></section>:
       visibleChapters.map((c,offset)=>{const index=range.start+offset;const collapsed=book.collapsed.includes(index);return <section id={'chapter-'+index} key={book.id+'-'+index} className={'chapter '+(collapsed?'collapsed':'')} aria-label={'章节 '+display(c.title)}>
        <div className="user-message"><span>{display(c.title)}</span></div>
        <button className="thought-line" aria-label={(collapsed?'展开':'收起')+'正文 '+(index+1)} onClick={()=>toggleCollapsed(index)}><span>{collapsed?'已完成工作 · ':'用时 '}{Math.max(1,Math.ceil((c.paragraphs?.join('').length||1000)/600))} 分钟</span>{collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</button>
        {collapsed?<div data-chapter={index} data-paragraph={0}>{workSummary()}</div>:c.locked?<div className="chapter-status"><ShieldAlert size={22}/><h3>此章节需要在原站阅读</h3><p>原站标记为 VIP。你可以打开原站，或继续阅读其他公开章节。</p><button className="secondary" onClick={()=>api.external(c.url)}>打开原站<ExternalLink size={15}/></button></div>:c.paragraphs?<div className="prose">
         {settings.hints&&<div className="work-hint"><Wifi size={16}/><span>正在核对资料 {index+1}/{book.chapters.length}</span></div>}
         {c.paragraphs.map((p,j)=><React.Fragment key={j}><p data-chapter={index} data-paragraph={j}>{display(p)}</p>{settings.hints&&(j===0||(j*31+(index+1)*17)%11<11/settings.hintFrequency)&&<WorkHint seed={index*31+j}/>}</React.Fragment>)}
        </div>:<div className="chapter-status">{chapterErrors[index]?<><p className="error-copy">{chapterErrors[index]}</p><div className="retry-actions"><button className="secondary" onClick={()=>loadChapter(book.id,index)}><RotateCcw size={15}/>重试</button>{c.url&&<button className="secondary" onClick={()=>api.external(c.url)}><ExternalLink size={15}/>打开原站</button>}</div></>:<><LoaderCircle className="spin"/><p>正在载入正文…</p></>}</div>}
        <div className="assistant-actions"><IconButton icon={Copy} label="复制本章正文" disabled={!c.paragraphs} onClick={()=>navigator.clipboard.writeText(display(c.title)+'\n\n'+c.paragraphs.map(display).join('\n\n')).then(()=>say('已复制本章正文')).catch(()=>say('复制失败，请重试'))}/><IconButton icon={Bookmark} label="保存本章书签" onClick={async()=>{const bookmarks=[...book.bookmarks.filter(b=>!(b.chapter===index&&b.paragraph===0)),{chapter:index,paragraph:0,createdAt:Date.now()}];setBook({...book,bookmarks});await api.patch(book.id,{bookmarks});say('已保存本章书签');}}/><IconButton icon={collapsed?ChevronDown:ChevronsUp} label={collapsed?'展开本章':'收起本章'} onClick={()=>toggleCollapsed(index)}/><span>{collapsed?'已完成':c.paragraphs?'已保存':'待处理'}</span></div>
       </section>;})}
       {book&&!boss&&<div className="chapter-nav"><button disabled={range.start===0} onClick={()=>jump(Math.max(0,range.start-1))}><ArrowLeft size={16}/>上一章</button>{range.end<book.chapters.length-1?<button onClick={()=>{if(range.end-range.start>=3)jump(range.end+1);else setRange(r=>({...r,end:Math.min(r.end+2,book.chapters.length-1)}));}}>继续下一部分<ArrowDown size={16}/></button>:<span>已到达最后一章</span>}</div>}
       </div>
      </div>
      <div className="composer-dock">
       {book&&!boss&&<button className="jump-down" title="定位下一章" aria-label="定位下一章" disabled={current>=book.chapters.length-1} onClick={()=>jump(current+1)}><ArrowDown size={21}/></button>}
       {hits!==null&&!boss&&<div className="chapter-search-results"><div className="search-results-head"><span>{hits.length?'找到 '+hits.length+' 个章节':'没有匹配的章节'}</span><IconButton icon={X} label="关闭搜索结果" onClick={()=>setHits(null)}/></div>{!hits.length?<p>试试章节数字（如 12）、“第十二回”或标题中的词。</p>:hits.map(h=><button key={h.index} onClick={()=>jump(h.index)}><span className="result-number">{h.index+1}</span><span>{display(h.title)}</span><ArrowUp size={15}/></button>)}</div>}
       <form className="composer" onSubmit={findChapter}>
        <textarea ref={inputRef} value={boss?'':query} onChange={e=>{setBoss(false);setQuery(e.target.value);if(hits)setHits(null);}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();findChapter();}}} rows={2} placeholder="和 Codex 一起工作" aria-label="搜索章节" title="输入章节序号或标题，按 Enter 定位"/>
        <div className="composer-toolbar"><div><IconButton icon={Plus} label="导入本地小说" onClick={()=>importBooks()}/><button className="access-label" type="button" onClick={()=>setModal('help')}><ShieldAlert size={15}/>完全访问</button></div><div className="composer-right"><button className="model-select" type="button" title="阅读设置" onClick={()=>setModal('settings')}><Zap className="model-symbol" size={13} fill="currentColor"/><span>GPT-6 Astra <span className="model-level">Max</span></span><ChevronDown size={13}/></button><IconButton icon={Mic} label="保存当前位置书签 Ctrl+D" onClick={bookmark}/><button className="send-button" type="submit" aria-label="查找章节" title="查找章节" disabled={searching}>{searching?<LoaderCircle size={19} className="spin"/>:query.trim()?<ArrowUp size={20}/>:<AudioLines size={20}/>}</button></div></div>
       </form>
      </div>
     </div>
     {toc&&!boss&&<aside className="toc-panel"><div className="toc-heading"><strong>内容索引</strong><IconButton icon={X} label="关闭目录" onClick={()=>setToc(false)}/></div><div className="toc-book">{currentBookTitle}<small>{book?.author}</small></div><div className="tabs"><button className={tocTab==='chapters'?'active':''} onClick={()=>setTocTab('chapters')}>目录</button><button className={tocTab==='bookmarks'?'active':''} onClick={()=>setTocTab('bookmarks')}>书签 {book?.bookmarks.length||''}</button></div>{tocTab==='chapters'?<><div className="toc-filter"><Search size={15}/><input value={tocQuery} onChange={e=>setTocQuery(e.target.value)} placeholder="筛选章节" aria-label="筛选章节"/></div><div className="toc-list">{chapterList.map(c=><button className={current===c.index?'active':''} key={c.index} onClick={()=>jump(c.index)}><span>{c.index+1}</span><span>{display(c.title)}</span>{c.locked&&<ShieldAlert size={12}/>}</button>)}{!chapterList.length&&<p className="muted">没有匹配章节</p>}</div></>:<div className="toc-list">{book?.bookmarks.map((b,i)=><div className="bookmark-row" key={i}><button onClick={()=>jump(b.chapter,b.paragraph)}><Bookmark size={14}/><span>{display(book.chapters[b.chapter]?.title)}<small>第 {b.paragraph+1} 段</small></span></button><IconButton icon={X} label="移除书签" onClick={async()=>{const bookmarks=book.bookmarks.filter((_,j)=>i!==j);setBook({...book,bookmarks});await api.patch(book.id,{bookmarks});}}/></div>)}{!book?.bookmarks.length&&<div className="empty-panel"><Bookmark size={28}/><p>还没有书签</p><small>按 Ctrl+D 保存当前阅读位置</small></div>}</div>}<div className="toc-bottom"><button className="secondary" onClick={refresh}><RefreshCw size={14}/>检查更新</button><button className="secondary" onClick={()=>{setTocQuery('');collapseAll();}}>全部收起</button></div></aside>}
     </div>
    </main>
   </div>
  </div>
  {modal==='library'&&<LibraryModal library={library} sources={sources} display={display} onClose={()=>setModal(null)} onOpen={async id=>{setModal(null);await run('',()=>openBook(id));}} onAdd={async item=>{const b=await api.add(item.sourceId,item.remoteId);await sync();await openBook(b.id);setModal(null);say('已加入书库');}} onImport={()=>{setModal(null);importBooks();}}/>}
  {modal==='settings'&&<Modal title="设置" onClose={()=>setModal(null)}><div className="settings-content"><label className="setting-row"><span>字号 <small>正文与聊天回复保持一致</small></span><div><input type="range" min="14" max="24" value={settings.fontSize} onChange={e=>saveSettings({fontSize:+e.target.value})}/><b>{settings.fontSize}</b></div></label><label className="setting-row"><span>行距</span><select aria-label="行距" value={settings.lineHeight} onChange={e=>saveSettings({lineHeight:+e.target.value})}><option value="1.6">紧凑</option><option value="1.7">标准 · 参考界面</option><option value="1.95">舒展</option><option value="2.25">宽松</option></select></label><label className="setting-row"><span>正文宽度</span><select aria-label="正文宽度" value={settings.width} onChange={e=>saveSettings({width:+e.target.value})}><option value="720">适中</option><option value="736">标准 · 参考界面</option><option value="850">较宽</option><option value="1000">宽</option></select></label><label className="setting-row"><span>外观</span><select aria-label="外观" value={settings.theme} onChange={e=>saveSettings({theme:e.target.value})}><option value="light">浅色 · 截图风格</option><option value="dark">深色</option><option value="paper">纸张</option></select></label><label className="setting-row"><span>显示简体中文 <small>原文保留，可随时切换</small></span><input className="switch" type="checkbox" checked={settings.simplified} onChange={e=>saveSettings({simplified:e.target.checked})}/></label><label className="setting-row"><span>插入工作提示行 <small>随机样式的界面装饰，不调用 AI</small></span><input className="switch" type="checkbox" checked={settings.hints} onChange={e=>saveSettings({hints:e.target.checked})}/></label>{settings.hints&&<label className="setting-row"><span>提示密度</span><select value={settings.hintFrequency} onChange={e=>saveSettings({hintFrequency:+e.target.value})}><option value="3">较多</option><option value="5">标准</option><option value="9">较少</option></select></label>}<label className="setting-row"><span>侧栏分组名称</span><input className="text-input group-input" value={settings.group} onChange={e=>setSettings(s=>({...s,group:e.target.value}))} onBlur={e=>saveSettings({group:e.target.value})} maxLength={40}/></label><div className="settings-actions"><button className="secondary" onClick={()=>saveSettings({fontSize:14,lineHeight:1.7,width:736})}><RotateCcw size={16}/>恢复参考尺寸</button><button className="secondary" onClick={()=>action('backup')}><Download size={16}/>备份书库</button><button className="secondary" onClick={()=>action('restore')}><Upload size={16}/>恢复书库</button><button className="secondary" disabled={!book} onClick={exportBook}><FileText size={16}/>导出文本</button></div><button className="text-link" onClick={()=>setModal('help')}>查看使用说明与快捷键<ArrowRight size={14}/></button></div></Modal>}
  {(modal==='help'||modal==='about')&&<Modal title={modal==='about'?'关于 Cotex':'使用说明'} onClose={()=>setModal(null)}><div className="help-content"><div className="app-identity"><img className="app-logo" src={cotexIcon} alt="Cotex 图标"/><div><h3>Cotex</h3><p>让阅读，融入熟悉的工作界面。</p></div><small>{appVersion}</small></div>{modal==='help'?<><p>点击左侧「新聊天」导入 TXT / EPUB；点击左上角搜索，在本地书库、名著和网文之间切换。</p><p>左侧始终使用工作标题，鼠标悬停时显示书名。点条目右侧的「···」可打开管理菜单。点击菜单外可收起。</p><p>底部输入章节数字或标题，按 Enter 跳转。点击回复顶部的用时行收起正文；收起后显示工作摘要。目录、书签和阅读进度均会保留。左下角圆环显示阅读进度，悬停查看百分比，点击打开目录。在阅读界面按空格切换工作摘要。用 Tab 选中按钮后，按空格可激活该按钮。</p><div className="shortcut-list">{[['Ctrl + O','导入小说'],['Ctrl + K','搜索小说库'],['Ctrl + F','定位章节输入框'],['Ctrl + D','保存当前位置书签'],['Alt + ← / →','上一章 / 下一章'],['空格','切换工作摘要（阅读界面）'],['Esc','关闭弹窗 / 返回正文']].map(([k,t])=><div key={k}><span>{t}</span><kbd>{k}</kbd></div>)}</div><p>本地 TXT 支持 UTF-8、GB18030 和 UTF-16；EPUB 支持无 DRM 的文字书籍。可将文件拖入窗口。小说和进度保存在本机，原文件不会被修改。</p></>:<><p>这是独立的小说阅读应用，界面按你的参考截图制作，与 OpenAI 无隶属关系。界面中的模型名称和工具提示仅用于展示，不会发送小说内容给 AI。</p><p>经典文学：Project Gutenberg、维基文库。网文：菠萝包轻小说、17K 小说网、纵横中文网。支持跨源搜索、分页浏览和公开章节缓存；VIP 内容在原站阅读。网络异常时可继续阅读已缓存章节。</p><p>预置名著保留了原始文件与 Project Gutenberg 许可，可在程序资源包中查看。页面显示的繁简转换不修改原文。</p><div className="source-links">{sources.map(s=><button key={s.id} onClick={()=>api.external(s.url)}>{s.name}<ExternalLink size={13}/></button>)}</div></>}<button className="primary full" onClick={()=>setModal(null)}>知道了</button></div></Modal>}
  {modal==='rename'&&<Modal title="修改工作标题" onClose={()=>{setModal(null);setContext(null);}}><form className="simple-form" onSubmit={async e=>{e.preventDefault();const id=context;if(!id)return;await api.patch(id,{alias:rename});if(book?.id===id)setBook({...book,alias:rename.trim()||book.alias});await sync();setModal(null);setContext(null);}}><p className="muted">日常显示这个标题，悬停时才显示小说名。</p><input autoFocus className="text-input" aria-label="工作标题" value={rename} onChange={e=>setRename(e.target.value)} maxLength={100} required/><button className="primary full">保存</button></form></Modal>}
  {modal==='remove'&&<Modal title="移出书库" onClose={()=>setModal(null)}><div className="simple-form"><p>将《{display(pendingRemove?.title)}》移出书库？本地原文件不受影响，已缓存数据会保留在应用回收目录中。</p><div className="confirm-actions"><button className="secondary" onClick={()=>setModal(null)}>取消</button><button className="danger" onClick={async()=>{await flushProgress();const d=await api.remove(pendingRemove.id);setLibrary(d.books);if(book?.id===pendingRemove.id){if(d.activeId)await openBook(d.activeId);else setBook(null);}setModal(null);say('已移出书库');}}>移出</button></div></div></Modal>}
  {error&&<div className="error-banner" role="alert"><span>{error}</span><IconButton icon={X} label="关闭提示" onClick={()=>setError('')}/></div>}
  {busy&&<div className="busy-toast" role="status"><LoaderCircle size={17} className="spin"/>{busy}</div>}
  {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
  {dragging&&<div className="drop-overlay"><Upload size={38}/><h2>放开以导入小说</h2><p>TXT / EPUB · 支持多文件</p></div>}
 </div>;
}
function LibraryModal({library,sources,display,onClose,onOpen,onAdd,onImport}){
 const [tab,setTab]=useState('local'),[q,setQ]=useState(''),[results,setResults]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[adding,setAdding]=useState('');const version=useRef(0),lastQuery=useRef(''),pendingRequest=useRef(null);
 async function search(targetTab=tab,p=1,text=q){
  if(targetTab==='local')return;pendingRequest.current={tab:targetTab,p,text};const v=++version.current;setLoading(true);setError('');setNotice('');if(p===1)setResults([]);
  try{const d=await api.search(targetTab,text,p);if(v!==version.current)return;setResults(r=>p===1?d.items:[...r,...d.items.filter(i=>!r.some(x=>x.sourceId===i.sourceId&&x.remoteId===i.remoteId))]);setHasMore(d.hasMore);setPage(p);setNotice(d.notice||'');lastQuery.current=text;}
  catch(e){if(v===version.current)setError(e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{if(v===version.current)setLoading(false);}
 }
 function changeTab(t){version.current++;setTab(t);setResults([]);setError('');setNotice('');setHasMore(false);setLoading(false);if(t!=='local')search(t,1,q);}
 const local=library.filter(b=>display(b.title+' '+b.author+' '+b.alias).toLowerCase().includes(display(q).toLowerCase()));
 return <Modal title="搜索资料" onClose={onClose} wide><form className="library-search" onSubmit={e=>{e.preventDefault();search();}}><Search size={20}/><input autoFocus placeholder={tab==='local'?'搜索书名、作者或工作标题':'输入书名或作者，按 Enter 搜索'} aria-label="搜索书名或作者" value={q} onChange={e=>setQ(e.target.value)}/><button className="search-submit" disabled={loading} type="submit">{loading?<LoaderCircle size={18} className="spin"/>:'搜索'}</button></form><div className="library-tabs tabs"><button className={tab==='local'?'active':''} onClick={()=>changeTab('local')}><FolderOpen size={15}/>本地书库 <small>{library.length}</small></button><button className={tab==='all'?'active':''} onClick={()=>changeTab('all')}><Search size={15}/>全部书源</button>{sources.map(s=><button key={s.id} className={tab===s.id?'active':''} onClick={()=>changeTab(s.id)}><Globe size={15}/>{s.name}</button>)}</div><div className="library-scroll">{tab==='local'?<>{local.map(b=><button className="library-book" key={b.id} onClick={()=>onOpen(b.id)}><span className="book-cover"><BookOpen size={22}/></span><span className="book-info"><strong><span>{display(b.title)}</span><VipBadge sourceId={b.source.id} remoteId={b.source.remoteId} known={b.hasVip}/></strong><span>{b.author||'本地作品'} · {b.chapterCount} 章 · {b.source.name}</span><small>{b.alias} · 上次读到第 {(b.progress?.chapter||0)+1} 章</small></span><ChevronRight size={18}/></button>)}{!local.length&&<div className="empty-panel"><Search size={32}/><h3>没有找到这本书</h3><p>试试其他关键词，或从本地导入。</p></div>}</>:<><p className="source-description">{tab==='all'?'同时搜索五个书源；不输入关键词时，显示各站目录与推荐作品。':sources.find(s=>s.id===tab)?.description}</p>{notice&&<p className="source-notice">{notice}</p>}{results.map(item=><div className="library-book online" key={item.sourceId+':'+item.remoteId}><span className="book-cover"><FileText size={23}/></span><span className="book-info"><strong><span>{display(item.title)}</span><VipBadge sourceId={item.sourceId} remoteId={item.remoteId} known={item.hasVip}/></strong><span>{item.author||'作者信息见原站'} · {sources.find(s=>s.id===item.sourceId)?.name}</span><small>{display(item.description)}</small></span><button className="add-book" disabled={!!adding} onClick={async()=>{setAdding(item.sourceId+':'+item.remoteId);setError('');try{await onAdd(item);}catch(e){setError(e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{setAdding('');}}}>{adding===item.sourceId+':'+item.remoteId?<LoaderCircle size={15} className="spin"/>:<Plus size={15}/>}加入</button></div>)}{loading&&<div className="loading-state"><LoaderCircle className="spin" size={19}/>正在搜索…</div>}{!loading&&!error&&!results.length&&<div className="empty-panel"><Search size={28}/><h3>没有找到结果</h3><p>试试其他关键词或切换书源。</p></div>}{error&&<div className="inline-error"><p>{error}</p><button className="secondary" onClick={()=>{const r=pendingRequest.current;search(r?.tab||tab,r?.p||1,r?.text??q);}}><RotateCcw size={14}/>重试</button></div>}{hasMore&&!loading&&<button className="load-more secondary" onClick={()=>search(tab,page+1,lastQuery.current)}>加载更多</button>}</>}</div><div className="library-footer"><span>{tab==='local'?'本地文件不会上传':'加入后显示为工作条目，书名仅在侧栏悬停时显示'}</span><button className="text-link" onClick={onImport}><Plus size={16}/>导入本地文件</button></div></Modal>;
}
createRoot(document.getElementById('root')).render(<App/>);
