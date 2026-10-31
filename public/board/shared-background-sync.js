"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;

  const storageKey=`jijinboardScopedTheme:${boardId}`;
  const defaults={gradientColor1:"#67a3ff",gradientColor2:"#9f71ff"};
  const frameIds=["logFrame","matrixFrame","spreadsheetFrame"];
  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  const rgba=(hex,alpha)=>{
    const value=validColor(hex)?hex:"#000000";
    const n=parseInt(value.slice(1),16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  };
  function currentTheme(){
    try{
      const value=JSON.parse(localStorage.getItem(storageKey)||"null")||{};
      return {
        gradientColor1:validColor(value.gradientColor1)?value.gradientColor1:defaults.gradientColor1,
        gradientColor2:validColor(value.gradientColor2)?value.gradientColor2:defaults.gradientColor2
      };
    }catch{return {...defaults}}
  }
  function applyBackground(doc){
    if(!doc?.documentElement||!doc?.body)return;
    const embedded=doc.documentElement.classList.contains("embedded");
    const dark=doc.documentElement.classList.contains("dark");
    const value=currentTheme();
    const one=rgba(value.gradientColor1,.24),two=rgba(value.gradientColor2,.12);
    doc.documentElement.style.setProperty('--jijin-background-one',one);
    doc.documentElement.style.setProperty('--jijin-background-two',two);
    const image=`radial-gradient(circle at 12% 8%,${one},transparent 28%),radial-gradient(circle at 86% 82%,${two},transparent 30%)`;
    for(const node of [doc.documentElement,doc.body]){
      const style=node.style;
      style.setProperty("background-color",dark?"#424242":embedded||node===doc.body?"transparent":"#f5f7fa","important");
      style.setProperty("background-image",dark||embedded||node===doc.body?"none":image,"important");
      style.setProperty("transition","none","important");
      style.setProperty("background-repeat","no-repeat","important");
      style.setProperty("background-position","0 0","important");
      style.setProperty("background-size","100% 100%","important");
      style.setProperty("background-attachment","fixed","important");
      style.setProperty("background-origin","padding-box","important");
      style.setProperty("background-clip","border-box","important");
    }
  }
  function attachThemeObserver(frame){
    try{
      const doc=frame?.contentDocument;
      const style=doc?.getElementById("jijinboardScopedThemeStyle");
      if(!style||style.__jijinBackgroundObserved)return;
      style.__jijinBackgroundObserved=true;
      new MutationObserver(()=>applyBackground(doc)).observe(style,{childList:true,characterData:true,subtree:true});
    }catch{}
  }
  function syncFrame(frame){
    try{
      const doc=frame?.contentDocument;
      applyBackground(doc);attachThemeObserver(frame);
      if(doc?.documentElement&&!doc.documentElement.__plainLogObserved){
        doc.documentElement.__plainLogObserved=true;
        new MutationObserver(()=>applyBackground(doc)).observe(doc.documentElement,{attributes:true,attributeFilter:["class"]});
      }
    }catch{}
  }
  function syncAll(){applyBackground(document);for(const id of frameIds)syncFrame(document.getElementById(id))}

  for(const id of frameIds){
    const frame=document.getElementById(id);
    frame?.addEventListener("load",()=>{
      syncFrame(frame);
      setTimeout(()=>syncFrame(frame),0);
      setTimeout(()=>syncFrame(frame),120);
    });
  }

  document.addEventListener("input",event=>{
    if(event.target?.id==="scopedGradient1"||event.target?.id==="scopedGradient2")setTimeout(syncAll,0);
  },true);
  window.addEventListener("storage",event=>{if(event.key===storageKey)syncAll()});

  syncAll();
  setTimeout(syncAll,300);
  setTimeout(syncAll,1200);
})();
