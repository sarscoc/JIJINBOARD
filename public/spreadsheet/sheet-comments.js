(()=>{
  const board=new URL(location.href).searchParams.get('board')||'';
  const originalFetch=window.fetch.bind(window);
  const bridge=window.__jijinSheetCommentBridge={comments:[],ready:false};
  const profile=()=>{try{return JSON.parse(localStorage.getItem('trpgMarkerProfile')||'null')}catch{return null}};
  const people=()=>{const p=profile()||{};return [{name:p.plName||'PL',type:'PL',icon:p.plIcon||''},...(p.personas||[]).map(person=>({name:person.name||'',type:person.type||'PC',icon:person.icon||''}))]};
  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?new URL(input,location.href):new URL(input.url,location.href);
    const method=String(init.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    const root=`/api/boards/${encodeURIComponent(board)}/spreadsheet/comments`;
    let options=init;
    if(board&&url.pathname===root&&method==='POST'&&typeof init.body==='string'){
      try{
        const body=JSON.parse(init.body),person=people().find(item=>item.name===body.personaName&&item.type===body.personaType);
        if(person?.icon&&!body.personaIcon)options={...init,body:JSON.stringify({...body,personaIcon:person.icon})};
      }catch{}
    }
    const response=await originalFetch(input,options);
    if(board&&url.pathname===root&&method==='GET'){
      response.clone().json().then(data=>{
        bridge.comments=Array.isArray(data?.comments)?data.comments:[];
        bridge.ready=true;
        setTimeout(()=>window.dispatchEvent(new CustomEvent('jijin-sheet-comments-data',{detail:{comments:bridge.comments}})),0);
      }).catch(()=>{});
    }
    return response;
  };
  const v='20260830-3';
  document.write(`<link rel="stylesheet" href="sheet-comments-unified.css?v=${v}"><script src="sheet-comments-base.js?v=${v}"><\/script><script src="sheet-comments-unified.js?v=${v}"><\/script>`);
})();
