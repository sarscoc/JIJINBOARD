(()=>{
 const q=new URL(location.href).searchParams,root=document.documentElement;
 if(q.get('embedded')==='1')root.classList.add('embedded');
 if(location.pathname.startsWith('/board'))root.classList.add('board-shell');
 const id=q.get('board')||q.get('id');if(!id)return;
 try{const theme=JSON.parse(localStorage.getItem('jijinboardScopedTheme:'+id)||'null')||{};
 const rgba=(hex,a)=>{if(!/^#[0-9a-f]{6}$/i.test(hex||''))return '';const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`};
 for(const [key,name,alpha]of [['gradientColor1','--jijin-background-one',.24],['gradientColor2','--jijin-background-two',.12]]){const value=rgba(theme[key],alpha);if(value)root.style.setProperty(name,value)}
 }catch{}
})();
