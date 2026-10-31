(()=>{
  "use strict";
  const storageKey="sheetLocalZoom";
  const min=0.75,max=1.6,step=0.05;
  const clamp=value=>Math.min(max,Math.max(min,Math.round(value/step)*step));
  const read=()=>{
    const value=Number(localStorage.getItem(storageKey));
    return Number.isFinite(value)&&value>0?clamp(value):1;
  };
  const apply=value=>{
    const zoom=clamp(value);
    document.documentElement.style.setProperty("--sheet-local-zoom",String(zoom));
    try{localStorage.setItem(storageKey,String(zoom))}catch{}
    const control=document.querySelector("#sheetZoomControl input");
    if(control)control.value=String(Math.round(zoom*100));
    const root=document.querySelector("#sheetZoomControl");
    if(root)root.title=`スプレッドシート表示倍率 ${Math.round(zoom*100)}%（この端末のみ）`;
  };

  const style=document.createElement("style");
  style.id="sheetLocalZoomStyle";
  style.textContent=`
    .sheet-wrap .data-sheet{zoom:var(--sheet-local-zoom,1)}
    #sheetZoomControl{display:flex;align-items:center;gap:7px;height:28px;min-height:28px;padding:3px 9px;border:1px solid color-mix(in srgb,var(--line) 60%,transparent);border-radius:999px;background:#fff;color:rgb(75,75,75);font-size:8px;line-height:1;white-space:nowrap;user-select:none}
    #sheetZoomControl span{font-size:8px;font-weight:700;letter-spacing:-.04em}
    #sheetZoomControl input{-webkit-appearance:none;appearance:none;width:92px;height:14px;margin:0;padding:0;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;cursor:pointer}
    #sheetZoomControl input:focus{box-shadow:none!important;outline:none!important}
    #sheetZoomControl input::-webkit-slider-runnable-track{height:2px;border-radius:999px;background:linear-gradient(90deg,#7facff,#ac8cff)}
    #sheetZoomControl input::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;margin-top:-4.5px;border:2px solid #fff;border-radius:50%;background:#8f9fff;box-shadow:0 1px 7px rgba(110,137,255,.5)}
    #sheetZoomControl input::-moz-range-track{height:2px;border:0;border-radius:999px;background:linear-gradient(90deg,#7facff,#ac8cff)}
    #sheetZoomControl input::-moz-range-thumb{width:8px;height:8px;border:2px solid #fff;border-radius:50%;background:#8f9fff;box-shadow:0 1px 7px rgba(110,137,255,.5)}
    @media(max-width:800px){#sheetZoomControl input{width:72px}}
  `;
  document.head.append(style);

  function install(){
    const actions=document.querySelector(".table-actions");
    if(!actions||document.querySelector("#sheetZoomControl"))return;
    const label=document.createElement("label");
    label.id="sheetZoomControl";
    label.innerHTML='<span>A−</span><input type="range" min="75" max="160" step="5" aria-label="スプレッドシート表示倍率"><span>A＋</span>';
    const input=label.querySelector("input");
    input.addEventListener("input",()=>apply(Number(input.value)/100));
    actions.prepend(label);
    apply(read());
  }

  apply(read());
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
