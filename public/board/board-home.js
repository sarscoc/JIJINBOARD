"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("id")||"";
  if(!boardId)return;
  const $=selector=>document.querySelector(selector);
  const imageUrl=()=>`/api/boards/${encodeURIComponent(boardId)}/home-image?v=${Date.now()}`;

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

  const upload=$("#boardHomeUpload"),input=$("#boardHomeInput");
  upload?.classList.remove("hidden");
  input?.addEventListener("change",event=>uploadScreenshot(event.target.files?.[0]));
  showImage(imageUrl());
})();
