"use strict";
(()=>{
  const frame=document.getElementById("logFrame");
  if(!frame)return;

  function apply(){
    try{
      const doc=frame.contentDocument;
      if(!doc?.head)return;
      let style=doc.getElementById("jijinboardLogNoShadows");
      if(!style){
        style=doc.createElement("style");
        style.id="jijinboardLogNoShadows";
        doc.head.append(style);
      }
      style.textContent=`
        html.embedded{--shadow:none!important}
        html.embedded body,html.embedded body *{box-shadow:none!important}
      `;
    }catch{}
  }

  frame.addEventListener("load",()=>{
    apply();
    setTimeout(apply,0);
    setTimeout(apply,120);
  });
  apply();
})();
