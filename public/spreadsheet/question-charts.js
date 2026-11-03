/* Local rendering only: answers stay in the existing sheet. */
(()=>{
 'use strict';
 function dataset(entries){
  const filled=entries.map(e=>({...e,text:String(e.text??'').trim()})).filter(e=>e.text);
  const number=text=>{
   const normalized=text.normalize('NFKC').replace(/,/g,'');
   const match=normalized.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*(?:cm|mm|m|kg|g|歳|才|人|個|点|円|%))?(?:\s*[（(].*[)）])?\s*$/i);
   return match?Number(normalized.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)/)[0]):NaN;
  };
  if(filled.length&&filled.every(e=>Number.isFinite(number(e.text))))return {numeric:true,values:filled.map(e=>({label:e.label,value:number(e.text),answer:e.text}))};
  const counts=new Map();for(const entry of filled)counts.set(entry.text,(counts.get(entry.text)||0)+1);
  return {numeric:false,values:[...counts].map(([label,value])=>({label,value,answer:''}))};
 }
 function render(entries,mode){
  const data=dataset(entries),root=document.createElement('section');root.className='question-chart';
  const note=document.createElement('p');note.textContent=data.numeric?'各キャラクターの数値（単位・括弧内の補足は除く）':'同じ回答の件数（空欄は除く）';root.append(note);
  if(!data.values.length){note.textContent='回答を入力するとグラフを表示できます。';return root}
  const values=data.values;
  if(mode==='pie'&&(values.some(e=>e.value<0)||!values.some(e=>e.value>0))){note.textContent='円グラフは、0以上で合計が0より大きい値に使えます。棒グラフを選んでください。';return root}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  const horizontal=mode==='bar-horizontal',width=520,height=horizontal?Math.max(220,values.length*32+32):360;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',mode==='pie'?'円グラフ':horizontal?'横棒グラフ':'縦棒グラフ');root.append(svg);
  const shape=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;svg.append(el);return el};
  const color=i=>`hsl(${(i*47+315)%360} 52% 72%)`;
  if(mode==='pie'){
   const total=values.reduce((sum,e)=>sum+e.value,0);let angle=-Math.PI/2;
   values.forEach((entry,i)=>{if(!entry.value)return;const sweep=entry.value/total*Math.PI*2,next=angle+sweep;
    if(sweep>=Math.PI*2-1e-8)shape('circle',{cx:260,cy:175,r:140,fill:color(i)});
    else shape('path',{d:`M260 175 L${260+140*Math.cos(angle)} ${175+140*Math.sin(angle)} A140 140 0 ${sweep>Math.PI?1:0} 1 ${260+140*Math.cos(next)} ${175+140*Math.sin(next)} Z`,fill:color(i),stroke:'#fff','stroke-width':2});angle=next;
   });
  }else{
   const min=Math.min(0,...values.map(e=>e.value)),max=Math.max(0,...values.map(e=>e.value)),range=max-min||1;
   if(horizontal){
    const x=value=>140+(value-min)/range*320;
    shape('line',{x1:x(0),x2:x(0),y1:10,y2:height-12,stroke:'#d9cddd'});
    values.forEach((e,i)=>{const y=18+i*32;shape('text',{x:130,y:y+15,'text-anchor':'end'},e.label.length>13?e.label.slice(0,12)+'…':e.label);shape('rect',{x:Math.min(x(0),x(e.value)),y,width:Math.abs(x(e.value)-x(0)),height:20,rx:4,fill:color(i)});shape('text',{x:470,y:y+15},String(e.value))});
   }else{
    const y=value=>280-(value-min)/range*240,step=460/values.length;
    shape('line',{x1:40,x2:500,y1:y(0),y2:y(0),stroke:'#d9cddd'});
    values.forEach((e,i)=>{const x=40+i*step;shape('rect',{x:x+step*.18,y:Math.min(y(0),y(e.value)),width:step*.64,height:Math.abs(y(e.value)-y(0)),rx:4,fill:color(i)});shape('text',{x:x+step/2,y:Math.max(14,y(e.value)-7),'text-anchor':'middle'},String(e.value));shape('text',{x:x+step/2,y:304,transform:`rotate(35 ${x+step/2} 304)`,'text-anchor':'start'},String(i+1))});
   }
  }
  const legend=document.createElement('ol');legend.className='question-chart-legend';
  values.forEach((e,i)=>{const li=document.createElement('li'),swatch=document.createElement('span');swatch.style.background=color(i);li.append(swatch,document.createTextNode(`${mode==='bar-vertical'?`${i+1}. `:''}${e.label}：${e.value}${data.numeric?'':'件'}`));if(data.numeric)li.title=e.answer;legend.append(li)});root.append(legend);return root;
 }
 window.JijinQuestionCharts={dataset,render};
})();
