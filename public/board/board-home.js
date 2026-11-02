"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("id")||"";
  if(!boardId)return;
  const $=selector=>document.querySelector(selector);
  const imageUrl=()=>`/api/boards/${encodeURIComponent(boardId)}/home-image`;

  function showImage(src){
    const image=$("#boardHomeImage"),empty=$("#boardHomeEmpty"),label=$("#boardHomeUploadLabel");if(!image||!empty)return;
    image.loading="eager";image.fetchPriority="high";image.decoding="async";
    image.onload=()=>{image.classList.remove("hidden");empty.classList.add("hidden");if(label)label.textContent="スクショを変更"};
    image.onerror=()=>{image.classList.add("hidden");empty.classList.remove("hidden");if(label)label.textContent="スクショを設定"};
    if(image.getAttribute("src")!==src)image.src=src;
    if(image.complete&&image.naturalWidth)image.onload();
  }

  async function resizeScreenshot(file){
    const bitmap=await createImageBitmap(file),max=2560,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("画像を変換できませんでした")),"image/webp",.9));
  }

  async function uploadScreenshot(file){
    if(!file)return;
    const label=$("#boardHomeUploadLabel"),input=$("#boardHomeInput"),old=label?.textContent||"スクショを設定";
    try{
      if(label)label.textContent="保存中…";if(input)input.disabled=true;
      const blob=await resizeScreenshot(file),response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/home-image`,{method:"POST",headers:{"content-type":blob.type||"image/webp"},body:blob}),body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);
      showImage(imageUrl()+"?v="+Date.now());
    }catch(error){alert(error.message);if(label)label.textContent=old}finally{if(input){input.disabled=false;input.value=""}}
  }

  function installLogTransitionGuard(){
    const frame=$("#logFrame"),welcome=$("#welcome");
    if(!frame||!welcome||typeof setToolFrameLoading!=="function"||typeof setToolFrameReady!=="function"||typeof selectTool!=="function")return;

    const rawLoading=setToolFrameLoading,rawReady=setToolFrameReady,rawSelect=selectTool;
    const keepLoading=()=>{frame.style.visibility="hidden";if(state.tool==="log")welcome.classList.add("hidden")};
    const reveal=()=>{frame.style.visibility="";frame.classList.remove("hidden");welcome.classList.add("hidden")};
    const frameMatches=()=>{
      const expected=frame.dataset.room||"";
      try{return (new URL(frame.contentWindow.location.href).searchParams.get("room")||"")===expected}catch{return true}
    };

    setToolFrameLoading=function(target){
      rawLoading(target);
      if(target===frame)keepLoading();
    };
    setToolFrameReady=function(target){
      if(target!==frame){rawReady(target);return}
      if(!frameMatches())return;
      rawReady(target);
      if(state.tool==="log")reveal();
    };
    selectTool=function(tool){
      rawSelect(tool);
      if(tool==="log"&&frame.getAttribute("src")&&frame.dataset.ready!=="1")keepLoading();
    };

    const warm=()=>{
      for(const href of ["/log/style.css?v=20261102-room1","/log/profile-compact.css?v=20261102-room1","/log/embedded-layout.css?v=20261102-room1"]){
        const link=document.createElement("link");link.rel="prefetch";link.as="style";link.href=href;document.head.appendChild(link);
      }
    };
    (window.requestIdleCallback||((callback)=>setTimeout(callback,250)))(warm);
  }

  function installBoardHomeLink(){
    const brand=$(".board-brand-stack");if(!brand)return;
    const href=`/board/?id=${encodeURIComponent(boardId)}`;
    const ownerLink=$("#ownerTopLink");if(ownerLink)ownerLink.href=href;
    brand.setAttribute("role","link");brand.tabIndex=0;brand.title="自陣TOPに戻る";brand.style.cursor="pointer";
    const go=()=>{location.href=href};
    brand.addEventListener("click",event=>{event.preventDefault();go()});
    brand.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();go()}});
  }

  const upload=$("#boardHomeUpload"),input=$("#boardHomeInput");
  if(upload){
    upload.classList.remove("hidden");
    upload.style.position="fixed";
    upload.style.right="14px";
    upload.style.bottom="14px";
    upload.style.padding="4px 7px";
    upload.style.fontSize="8px";
    upload.style.zIndex="20";
  }
  input?.addEventListener("change",event=>uploadScreenshot(event.target.files?.[0]));
  if(window.JijinBoardReady)window.JijinBoardReady.image.then(ok=>{if(ok&&$("#boardHomeUploadLabel"))$("#boardHomeUploadLabel").textContent="スクショを変更"});
  else showImage(imageUrl());
  installLogTransitionGuard();
  installBoardHomeLink();
})();
