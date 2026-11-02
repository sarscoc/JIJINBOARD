'use strict';
(()=>{
 const settings=document.getElementById('settings');if(!settings)return;
 function refresh(){
  for(const input of settings.querySelectorAll('input[type=range]')){
   const min=Number(input.min)||0,max=Number(input.max)||100,value=Number(input.value);
   input.style.setProperty('--matrix-range-fill',Math.max(0,Math.min(100,100*(value-min)/(max-min||1)))+'%');
  }
  document.dispatchEvent(new Event('jijinboard-selects-updated'));
 }
 settings.addEventListener('input',refresh);settings.addEventListener('change',refresh);
 if(typeof restoreDisplay==='function'){
  const original=restoreDisplay;restoreDisplay=function(...args){const result=original.apply(this,args);refresh();return result};
 }
 refresh();
})();
