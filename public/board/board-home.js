"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("id")||"";
  if(!boardId)return;
  const $=selector=>document.querySelector(selector);
  const imageUrl=()=>`/api/boards/${encodeURIComponent(boardId)}/home-image?v=${Date.now()}`;
  const logFrame=$("#logFrame"),welcome=$("#welcome");
  let uploaderRequested=false;

  function frameRoom(){
    if(!logFrame)return "";
    try{return new URL(logFrame.getAttribute("src")||"",location.href).searchParams.get("room")||""}catch{return ""}
  }
  function showTopCover(){
    if(!logFrame||!welcome)return;
    welcome.classList.remove("hidden");
    logFrame.classList.add("hidden");
  }
  function showPreparedLog(){
    if(!logFrame||!welcome)return;
    logFrame.classList.remove("hidden");
    welcome.classList.add("hidden");
  }
  function prewarmLogShell(){
    if(!logFrame||logFrame.getAttribute("src")||logFrame.dataset.room)return;
    logFrame.dataset.jijinPrewarm="1";
    logFrame.classList.add("hidden");
    logFrame.src=`/log/?embedded=1&board=${encodeURIComponent(boardId)}&prewarm=1`;
  }

  function showImage(src){
    const image=$("#boardHomeImage"),empty=$("#boardHomeEmpty"),label=$("#boardHomeUploadLabel");if(!image||!empty)return;
    image.src=src;
    image.onload=()=>{image.classList.remove("hidden");empty.classList.add("hidden");if(label)label.textContent="スクショを変更"};
    image.onerror=()=>{image.classList.add("hidden");empty.classList.remove("hidden");if(label)label.textContent="スクショを設定"};
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
      showImage(imageUrl());
    }catch(error){alert(error.message);if(label)label.textContent=old}finally{if(input){input.disabled=false;input.value=""}}
  }

  if(logFrame){
    new MutationObserver(()=>{
      const src=logFrame.getAttribute("src")||"";
      if(!src)return;
      if(frameRoom()){uploaderRequested=false;showTopCover()}
      else if(!uploaderRequested)showTopCover();
    }).observe(logFrame,{attributes:true,attributeFilter:["src"]});

    addEventListener("message",event=>{
      if(event.origin!==location.origin||event.source!==logFrame.contentWindow)return;
      const message=event.data||{};if(message.type!=="jijinboard-log-ready")return;
      const readyRoom=String(message.roomId||""),currentRoom=frameRoom();
      if(readyRoom){
        if(readyRoom===currentRoom){uploaderRequested=false;showPreparedLog()}
        return;
      }
      if(uploaderRequested&&!currentRoom)showPreparedLog();
      else showTopCover();
    });

    document.addEventListener("click",event=>{
      if(event.target.closest("#addLogButton")){
        uploaderRequested=true;
        queueMicrotask(showTopCover);
        return;
      }
      if(event.target.closest('[data-tool="log"]')){
        queueMicrotask(()=>{if(!frameRoom()&&!uploaderRequested)showTopCover()});
      }
    });

    queueMicrotask(prewarmLogShell);
  }

  const upload=$("#boardHomeUpload"),input=$("#boardHomeInput");
  upload?.classList.remove("hidden");
  input?.addEventListener("change",event=>uploadScreenshot(event.target.files?.[0]));
  showImage(imageUrl());
})();
