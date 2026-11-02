'use strict';
// Keep native selects as the application state; render one accessible menu above
// the scrolling toolbar so its border and options cannot be clipped by it.
(()=>{
 let active=null;
 for(const select of document.querySelectorAll('#viewMode,#tabFilter,[data-select-menu]')){
  if(select.dataset.prettySelect)continue;
  const id=select.id;
  select.dataset.prettySelect='1';select.hidden=true;
  const wrap=document.createElement('span');wrap.className='log-select';wrap.dataset.select=id;
  const button=document.createElement('button');button.type='button';button.className='log-select-trigger';button.id=id+'Trigger';
  button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',select.getAttribute('aria-label')||select.dataset.selectMenuLabel||(id==='viewMode'?'ログの表示方法':'メインタブ'));
  const label=document.createElement('span');button.append(label);wrap.append(button);select.after(wrap);
  const menu=document.createElement('div');menu.id=id+'Menu';menu.className='log-select-menu';menu.dataset.selectOwner=id;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',button.getAttribute('aria-label'));menu.hidden=true;document.body.append(menu);button.setAttribute('aria-controls',menu.id);
  let highlighted=-1;
  const options=()=>[...select.options].filter(option=>!option.disabled&&!option.hidden&&option.value!=='');
  function sync(){label.textContent=select.selectedOptions[0]?.textContent||options()[0]?.textContent||'選択肢なし';button.disabled=select.disabled||!options().length;if(!menu.hidden)render()}
  function place(){
   const r=button.getBoundingClientRect(),width=Math.min(Math.max(r.width,160),Math.max(0,innerWidth-16));
   menu.style.width=width+'px';menu.style.left=Math.max(8,Math.min(r.left,innerWidth-width-8))+'px';
   const below=Math.max(0,innerHeight-r.bottom-16),above=Math.max(0,r.top-16),up=below<120&&above>below;
   menu.style.maxHeight=Math.min(340,up?above:below)+'px';menu.style.top=up?'auto':Math.max(8,r.bottom+6)+'px';menu.style.bottom=up?Math.max(8,innerHeight-r.top+6)+'px':'auto';
  }
  function render(){
   const list=options();if(highlighted<0||highlighted>=list.length)highlighted=Math.max(0,list.findIndex(o=>o.value===select.value));
   menu.replaceChildren(...list.map((option,index)=>{
    const item=document.createElement('div');item.id=menu.id+'Option'+index;item.className='log-select-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.value===select.value));item.classList.toggle('highlighted',index===highlighted);item.textContent=option.textContent;
    item.addEventListener('pointermove',()=>{highlighted=index;highlight()});item.addEventListener('pointerdown',event=>event.preventDefault());item.addEventListener('click',()=>choose(index));return item;
   }));highlight();
  }
  function highlight(){
   [...menu.children].forEach((item,index)=>item.classList.toggle('highlighted',index===highlighted));
   const item=menu.children[highlighted];if(item){button.setAttribute('aria-activedescendant',item.id);item.scrollIntoView?.({block:'nearest'})}
  }
  function close(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');if(active?.button===button)active=null;if(focus)button.focus()}
  function open(){
   if(button.disabled)return;active?.close();active={button,close};menu.hidden=false;highlighted=options().findIndex(o=>o.value===select.value);button.setAttribute('aria-expanded','true');place();render();
  }
  function choose(index){const option=options()[index];if(!option)return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true)}
  button.addEventListener('click',()=>{sync();menu.hidden?open():close()});
  document.addEventListener('jijinboard-selects-updated',sync);
  button.addEventListener('keydown',event=>{
   if(event.key==='Escape'){if(!menu.hidden){event.preventDefault();close(true)}return}
   if(event.key==='Tab'){close();return}
   if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
    event.preventDefault();if(menu.hidden){open();return}
    const length=options().length;if(!length)return;
    if(event.key==='Enter'||event.key===' '){choose(highlighted);return}
    highlighted=event.key==='Home'?0:event.key==='End'?length-1:Math.max(0,Math.min(length-1,highlighted+(event.key==='ArrowDown'?1:-1)));highlight();
   }
  });
  select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{subtree:true,childList:true,characterData:true,attributes:true});
  document.addEventListener('pointerdown',event=>{if(!wrap.contains(event.target)&&!menu.contains(event.target))close()});
  window.addEventListener('resize',()=>{if(!menu.hidden)place()});document.addEventListener('scroll',event=>{if(!menu.hidden&&!menu.contains(event.target))close()},true);
  sync();
 }
})();
