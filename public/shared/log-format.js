'use strict';
// Tekey inline notation remains the stored source of truth. Rendering never changes
// source offsets used by existing comments; each visible text run maps back to UTF-16.
(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function tokens(source,begin=0,end=source.length,depth=0){
  const out=[];let i=begin,start=begin;
  const literal=to=>{if(to>start)out.push({type:'text',start,end:to,text:source.slice(start,to)})};
  while(i<end&&depth<32){
   let token=null,next=i;
   if(source[i]==='|'||source[i]==='｜'){
    const m=source.slice(i,end).match(/^[|｜]([^|｜《》\n]+)《([^《》\n]+)》/);
    if(m){next=i+m[0].length;token={type:'ruby',start:i,end:next,children:tokens(source,i+1,i+1+m[1].length,depth+1),reading:m[2],baseStart:i+1,baseEnd:i+1+m[1].length}}
   }else if(source.slice(i,i+2)==='**'||source.slice(i,i+2)==='~~'){
    const delimiter=source.slice(i,i+2),close=source.indexOf(delimiter,i+2);
    if(close>i+2&&close+2<=end){next=close+2;token={type:delimiter==='**'?'strong':'del',start:i,end:next,children:tokens(source,i+2,close,depth+1)}}
   }
   if(token){literal(i);out.push(token);i=next;start=i}else i++;
  }
  literal(end);return out;
 }
 function render(source,segments=[],options={}){
  source=String(source??'');
  const hidden=options.compactBlankLines?Array.from(source.matchAll(/\n(?:[\t ]*\n)+/g),m=>({start:m.index+1,end:m.index+m[0].length})):[];
  function mapped(start,end){
   const cuts=[...new Set([start,end,...hidden.flatMap(r=>[r.start,r.end]).filter(n=>n>start&&n<end)])].sort((a,b)=>a-b);
   return cuts.slice(0,-1).map((a,i)=>{const b=cuts[i+1],hide=hidden.some(r=>r.start<=a&&r.end>=b);return `<span data-log-start="${a}" data-log-end="${b}"${hide?' data-log-hidden="1" aria-hidden="true" style="display:none"':''}>${escape(source.slice(a,b))}</span>`}).join('');
  }
  function textHtml(token){
   const edges=[...new Set([token.start,token.end,...segments.flatMap(s=>[s.start,s.end]).filter(n=>n>token.start&&n<token.end)])].sort((a,b)=>a-b);
   let html='';for(let i=0;i<edges.length-1;i++){
    const start=edges[i],end=edges[i+1],winner=segments.find(s=>s.start<=start&&s.end>=end)?.winner;
    const value=mapped(start,end);
    html+=winner?`<mark data-ann="${escape(winner.id)}" style="--marker:${escape(winner.color)}">${value}</mark>`:value;
   }return html;
  }
  function html(list){return list.map(t=>t.type==='text'?textHtml(t):t.type==='ruby'?`<ruby>${html(t.children)}<rt data-log-start="${t.baseStart}" data-log-end="${t.baseEnd}" data-log-reading="1" style="user-select:none">${escape(t.reading)}</rt></ruby>`:`<${t.type}>${html(t.children)}</${t.type}>`).join('')}
  return html(tokens(source));
 }
 function plain(source,start=0,end=String(source??'').length){
  source=String(source??'');const walk=list=>list.map(t=>t.type==='text'?source.slice(Math.max(start,t.start),Math.max(Math.max(start,t.start),Math.min(end,t.end))):walk(t.children)).join('');return walk(tokens(source));
 }
 function fromNode(node){
  if(node.nodeType===3)return node.nodeValue||'';
  if(node.nodeType!==1&&node.nodeType!==11)return '';
  const tag=node.nodeName.toLowerCase();if(['script','style','iframe','object','svg','rt','rp'].includes(tag))return '';
  if(tag==='br')return '\n';
  const children=()=>Array.from(node.childNodes,fromNode).join('');
  if(tag==='ruby'){
   const base=children(),reading=Array.from(node.querySelectorAll('rt'),rt=>rt.textContent||'').join('');
   return base&&reading?`|${base}《${reading}》`:base;
  }
  const value=children();return ['b','strong'].includes(tag)&&value?`**${value}**`:['s','del','strike'].includes(tag)&&value?`~~${value}~~`:value;
 }
 function sourceOffset(root,node,offset,edge='start'){
  const parent=node.nodeType===1?node:node.parentElement,run=parent?.closest('[data-log-start]');
  if(run&&root.contains(run)){
   const start=Number(run.dataset.logStart),end=Number(run.dataset.logEnd);
   if(run.dataset.logReading)return edge==='start'?start:end;
   const range=root.ownerDocument.createRange();range.selectNodeContents(run);range.setEnd(node,offset);return Math.min(end,start+range.toString().length);
  }
  // Element boundaries (between formatted runs) use the next/previous run's address.
  const point=root.ownerDocument.createRange();point.setStart(node,offset);point.collapse(true);
  for(const element of root.querySelectorAll('[data-log-start]:not([data-log-reading])')){
   const range=root.ownerDocument.createRange();range.selectNodeContents(element);
   if(point.compareBoundaryPoints(0,range)<=0)return Number(element.dataset.logStart);
  }
  return Number(root.dataset.sourceLength)||0;
 }
 globalThis.JijinLogFormat={render,plain,fromNode,sourceOffset};
})();
