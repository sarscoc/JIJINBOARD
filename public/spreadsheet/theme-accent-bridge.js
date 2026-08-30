(()=>{
  "use strict";
  const params=new URL(location.href).searchParams,boardId=params.get("board")||"";
  if(params.get("embedded")!=="1"||!boardId)return;
  const themeKey=`jijinboardScopedTheme:${boardId}`;
  const valid=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  const readColor=()=>{
    try{
      const value=JSON.parse(parent.localStorage.getItem(themeKey)||"null");
      if(valid(value?.color1))return value.color1;
    }catch{}
    return "";
  };
  const original=typeof window.getGlobalThemeColor==="function"?window.getGlobalThemeColor:null;
  if(original){
    window.getGlobalThemeColor=function(){
      const color=readColor();
      return color||(original?original():"#8da8ff");
    };
  }
  function refresh(){
    const color=readColor();
    if(!color)return;
    document.documentElement.style.setProperty("--user-accent",color);
    document.documentElement.style.setProperty("--user-accent-soft",`color-mix(in srgb,${color} 16%,transparent)`);
    document.documentElement.style.setProperty("--user-accent-faint",`color-mix(in srgb,${color} 7%,transparent)`);
    try{window.applyGlobalTheme?.()}catch{}
    try{if(window.state?.layout?.mainMode==="characters")window.renderFullCharacterMode?.()}catch{}
  }
  addEventListener("storage",event=>{if(event.key===themeKey)refresh()});
  refresh();
  setTimeout(refresh,0);
})();
