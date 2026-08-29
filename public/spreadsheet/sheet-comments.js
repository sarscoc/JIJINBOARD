(()=>{
  const board=new URL(location.href).searchParams.get('board');if(!board)return;
  let comments=[],cell='',reply='',edit='',mode=localStorage.getItem('sheetCommentMode')||'comment';
  const api=async(p,o={})=>{const r=await fetch(p,{headers:{'content-type':'application/json'},...o}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'コメントの取得に失敗しました');return d};
  const me=()=>JSON.parse(localStorage.getItem('trpgMarkerProfile')||'null');
  const people=()=>{const p=me();return[{name:p?.plName||'PL',type:'PL'},...(p?.personas||[])]};

  function setupTocOverlay(){
    if(!document.documentElement.classList.contains('embedded'))return;
    const existing=document.querySelector('#jijinSheetTocRail');
    if(existing){existing.__place?.();return}
    document.querySelector('#sheetTocRail')?.remove();
    const source=document.querySelector('#databaseLayout>.database-toc');
    const inner=source?.querySelector('.database-toc-inner');
    const layout=document.querySelector('#databaseLayout');
    if(!source||!inner||!layout)return;

    inner.querySelector('.database-toc-title')?.remove();
    const style=document.createElement('style');
    style.id='jijinSheetTocStyle';
    style.textContent=`
      #jijinSheetTocRail{position:fixed!important;left:0!important;width:18px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;z-index:2147483000!important;cursor:pointer!important}
      #jijinSheetTocRail[hidden]{display:none!important}
      #jijinSheetTocHandle{position:absolute!important;left:9px!important;top:50%!important;transform:translate(-50%,-50%)!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:rgba(73,82,96,.68)!important;font:400 16px/1 system-ui!important;pointer-events:none!important;user-select:none!important}
      #jijinSheetTocPopover{position:absolute!important;left:14px!important;top:0;margin:0!important;padding:6px!important;width:max-content!important;min-width:96px!important;max-width:calc(100vw - 32px)!important;height:max-content!important;max-height:none!important;overflow:visible!important;border:1px solid #e2e7ed!important;border-radius:8px!important;background:rgba(255,255,255,.97)!important;backdrop-filter:blur(18px) saturate(130%)!important;-webkit-backdrop-filter:blur(18px) saturate(130%)!important;box-shadow:0 8px 24px rgba(42,51,67,.10)!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateX(-4px)!important;transition:opacity .08s ease,transform .08s ease!important}
      #jijinSheetTocRail.open #jijinSheetTocPopover{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translateX(0)!important}
      #jijinSheetTocPopover>.database-toc-inner{position:static!important;inset:auto!important;display:block!important;width:max-content!important;min-width:100%!important;max-width:none!important;height:max-content!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important}
      #jijinSheetTocPopover .database-toc-title{display:none!important}
      #jijinSheetTocPopover #databaseToc{display:grid!important;grid-template-columns:max-content!important;gap:1px!important;width:max-content!important;min-width:100%!important;margin:0!important;padding:0!important;background:transparent!important}
      #jijinSheetTocPopover .database-toc-link{display:block!important;width:auto!important;min-width:100%!important;margin:0!important;padding:3px 5px!important;border:0!important;border-radius:5px!important;background:transparent!important;color:#626b78!important;font:500 7px/1.25 system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif!important;letter-spacing:0!important;text-align:left!important;text-decoration:none!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
      #jijinSheetTocPopover .database-toc-link:hover{background:#f0f3f8!important;color:#303843!important}
    `;
    document.head.appendChild(style);

    const rail=document.createElement('div');
    rail.id='jijinSheetTocRail';
    rail.innerHTML='<span id="jijinSheetTocHandle" aria-hidden="true">︙</span><div id="jijinSheetTocPopover"></div>';
    const popover=rail.querySelector('#jijinSheetTocPopover');
    popover.appendChild(inner);
    source.remove();
    document.body.appendChild(rail);

    const place=()=>{
      const target=document.querySelector('#databaseLayout');
      if(!target)return;
      const cs=getComputedStyle(target),rect=target.getBoundingClientRect();
      const hidden=cs.display==='none'||cs.visibility==='hidden'||rect.width<1||rect.height<1;
      rail.hidden=hidden;
      if(hidden)return;
      const top=Math.max(0,rect.top),bottom=Math.min(window.innerHeight,rect.bottom);
      rail.style.top=`${top}px`;
      rail.style.height=`${Math.max(0,bottom-top)}px`;
    };
    const placePopoverAt=clientY=>{
      const rr=rail.getBoundingClientRect();
      const y=Math.max(0,Math.min(rr.height,clientY-rr.top));
      popover.style.top=`${y}px`;
      requestAnimationFrame(()=>{
        const h=popover.offsetHeight,room=rr.height;
        let top=y;
        if(h<=room-8){if(top+h>room-4)top=room-h-4;if(top<4)top=4}else top=4;
        popover.style.top=`${top}px`;
      });
    };
    let closeTimer=0;
    const cancelClose=()=>{if(closeTimer){clearTimeout(closeTimer);closeTimer=0}};
    const openAt=clientY=>{cancelClose();placePopoverAt(clientY);rail.classList.add('open')};
    const close=()=>{cancelClose();rail.classList.remove('open')};
    const scheduleClose=()=>{cancelClose();closeTimer=setTimeout(close,200)};

    rail.addEventListener('mouseenter',event=>{cancelClose();if(!rail.classList.contains('open'))openAt(event.clientY)});
    rail.addEventListener('mouseleave',scheduleClose);
    popover.addEventListener('mouseenter',cancelClose);
    popover.addEventListener('mouseleave',scheduleClose);
    popover.addEventListener('click',event=>{
      const link=event.target.closest('.database-toc-link[data-db-jump]');
      if(!link)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target=document.getElementById(`group-${link.dataset.dbJump}`),wrap=document.getElementById('sheetWrap');
      if(target&&wrap){
        const wr=wrap.getBoundingClientRect(),tr=target.getBoundingClientRect();
        const stickyCell=[...wrap.querySelectorAll('thead th')].find(el=>getComputedStyle(el).position==='sticky');
        const stickyHeight=stickyCell?.getBoundingClientRect().height||0;
        const top=wrap.scrollTop+(tr.top-wr.top)-stickyHeight-1;
        wrap.scrollTo({top:Math.max(0,top),behavior:'smooth'});
      }
      close();
    },true);
    document.addEventListener('click',event=>{if(rail.classList.contains('open')&&!rail.contains(event.target))close()},true);

    rail.__place=place;
    place();
    requestAnimationFrame(place);
    window.addEventListener('resize',place,{passive:true});
    if(window.ResizeObserver){const ro=new ResizeObserver(place);ro.observe(layout)}
    if(window.MutationObserver){const mo=new MutationObserver(place);mo.observe(layout,{attributes:true,attributeFilter:['class','style']})}
  }

  function syncModeToggle(){
    const head=document.querySelector('.data-sheet thead .item-col');
    if(!head)return;
    let button=head.querySelector('#sheetModeToggle');
    if(!button){
      head.textContent='';
      button=document.createElement('button');
      button.type='button';
      button.id='sheetModeToggle';
      button.onclick=event=>{event.preventDefault();event.stopPropagation();setMode(mode==='comment'?'edit':'comment')};
      const label=document.createElement('span');
      label.className='sheet-item-heading-label';
      label.textContent='項目';
      head.append(button,label);
    }
    const nextLabel=mode==='comment'?'コメント':'編集';
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
    button.dataset.mode=mode;
    button.title=mode==='comment'?'クリックで編集モードへ':'クリックでコメントモードへ';
  }
  function setMode(next){
    mode=next;
    localStorage.setItem('sheetCommentMode',mode);
    document.body.classList.toggle('sheet-comment-mode',mode==='comment');
    syncModeToggle();
  }
  function controls(){
    let el=document.querySelector('#sheetCommentModes');
    if(!el){
      el=document.createElement('div');
      el.id='sheetCommentModes';
      el.innerHTML='<button type="button" data-open-sheet-comments>COMMENTS</button>';
      document.querySelector('.table-actions')?.prepend(el);
      el.querySelector('[data-open-sheet-comments]').onclick=()=>ui().hidden=false;
    }
    syncModeToggle();
    const root=document.getElementById('dataTableRoot');
    if(root&&!root.dataset.modeToggleObserved){
      root.dataset.modeToggleObserved='1';
      new MutationObserver(syncModeToggle).observe(root,{childList:true});
    }
    setMode(mode);
  }
  function ui(){let a=document.querySelector('#sheetComments');if(a)return a;a=document.createElement('aside');a.id='sheetComments';a.innerHTML='<div class="sheet-comments-head"><b>COMMENTS <span></span></b><button type="button" title="コメントを閉じる">×</button></div><section><p>読み込み中…</p></section>';a.querySelector('button').onclick=()=>a.hidden=true;document.body.append(a);return a}
  function card(c){return `<article data-cell="${c.cell_id}"><small>${c.persona_name} [${c.persona_type}]</small><p>${c.body}</p><button data-like="${c.id}">${c.liked_by_me?'♥':'♡'}${c.like_count||''}</button><button data-reply="${c.id}">↩</button>${c.author_id===me()?.id?`<button data-edit="${c.id}">✎</button>`:''}</article>`}
  async function load(){try{comments=(await api(`/api/boards/${board}/spreadsheet/comments?authorId=${encodeURIComponent(me()?.id||'')}`)).comments||[]}catch(error){console.warn('Spreadsheet comments load failed',error);comments=[]}const a=ui();a.querySelector('b span').textContent=comments.length;a.querySelector('section').innerHTML=comments.map(card).join('')||'<p>セルへのコメントがここに並びます。</p>'}
  function dialog(){let d=document.querySelector('#sheetCommentDialog');if(d)return d;d=document.createElement('dialog');d.id='sheetCommentDialog';d.innerHTML='<form><b>セルにコメント</b><select></select><textarea placeholder="感想を書く"></textarea><button>投稿</button><button type="button" data-close>閉じる</button><button type="button" data-delete hidden>削除</button></form>';document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.querySelector('form').onsubmit=post;d.querySelector('[data-delete]').onclick=remove;return d}
  function open(id,r='',e=''){const p=me();if(!p?.plName)return alert('先に発言者を登録してください。');ui().hidden=false;cell=id;reply=r;edit=e;const d=dialog(),old=comments.find(x=>x.id===e),ps=people();d.querySelector('select').innerHTML=ps.map((x,i)=>`<option value="${i}">${x.name} [${x.type}]</option>`).join('');d.querySelector('textarea').value=old?.body||'';d.querySelector('[data-delete]').hidden=!old;d.showModal()}
  async function post(e){e.preventDefault();const d=dialog(),p=me(),person=people()[d.querySelector('select').value],body=d.querySelector('textarea').value.trim();if(!body)return;try{if(edit)await api(`/api/boards/${board}/spreadsheet/comments/${edit}`,{method:'PATCH',body:JSON.stringify({authorId:p.id,body})});else await api(`/api/boards/${board}/spreadsheet/comments`,{method:'POST',body:JSON.stringify({cellId:cell,parentId:reply,authorId:p.id,personaName:person.name,personaType:person.type,body})});d.close();load()}catch(x){alert(x.message)}}
  async function remove(){if(!confirm('このコメントを削除しますか？'))return;await api(`/api/boards/${board}/spreadsheet/comments/${edit}`,{method:'DELETE',body:JSON.stringify({authorId:me().id})});dialog().close();load()}

  document.body.classList.toggle('sheet-comment-mode',mode==='comment');
  setupTocOverlay();
  controls();
  ui();
  document.addEventListener('click',e=>{const td=e.target.closest('[data-sheet-cell]'),b=e.target.closest('[data-like],[data-reply],[data-edit]'),a=e.target.closest('#sheetComments article');if(b){e.stopPropagation();const c=comments.find(x=>x.id===(b.dataset.like||b.dataset.reply||b.dataset.edit));if(b.dataset.like)api(`/api/boards/${board}/spreadsheet/comments/${c.id}/like`,{method:'POST',body:JSON.stringify({authorId:me().id})}).then(load);else open(c.cell_id,b.dataset.reply?c.id:'',b.dataset.edit?c.id:'');return}if(a){const t=document.querySelector(`[data-sheet-cell="${CSS.escape(a.dataset.cell)}"]`);t?.classList.add('sheet-comment-flash');setTimeout(()=>t?.classList.remove('sheet-comment-flash'),1100);t?.scrollIntoView({behavior:'smooth',block:'center'});return}if(mode==='comment'&&td){e.preventDefault();open(td.dataset.sheetCell)}});
  load();
})();
