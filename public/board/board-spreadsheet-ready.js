"use strict";
(()=>{
  const frame=document.querySelector("#spreadsheetFrame");
  if(!frame)return;

  const style=document.createElement("style");
  style.textContent="#spreadsheetFrame.spreadsheet-loading{visibility:hidden!important}";
  document.head.append(style);

  const rawSelect=window.selectTool;
  if(typeof rawSelect==="function"&&!rawSelect.__jijinboardSpreadsheetGate){
    const wrapped=function(tool,...args){
      if(tool==="spreadsheet"&&frame.dataset.spreadsheetReady!=="1"){
        frame.classList.add("spreadsheet-loading");
      }
      return rawSelect.call(this,tool,...args);
    };
    wrapped.__jijinboardSpreadsheetGate=true;
    window.selectTool=wrapped;
  }

  addEventListener("message",event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type!=="jijinboard-spreadsheet-ready")return;
    frame.dataset.spreadsheetReady="1";
    // The child already waited two animation frames. One parent frame prevents
    // revealing in the middle of the tab button's own style/layout update.
    requestAnimationFrame(()=>frame.classList.remove("spreadsheet-loading"));
  });
})();
