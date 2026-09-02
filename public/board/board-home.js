"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("id")||"";
  if(!boardId)return;
  const $=selector=>document.querySelector(selector);
  const adminToken=()=>localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||"";
  const imageUrl=()=>`/api/boards/${encodeURIComponent(boardId)}/home-image?v=${Date.now()}`;

  function showImage(src){const image=$("#boardHomeImage"),empty=$("#boardHomeEmpty");if(!image||!empty)return;image.src=src;image.onload=()=>{image.classList.remove("hidden");empty.classList.add("hidden")};image.onerror=()=>{image.classList.add("hidden");empty.classList.remove("hidden")}}
  function syncOwner(){const upload=$("#boardHomeUpload");if(upload)upload.classList.toggle("hidden",!adminToken())}

  async function resizeScreenshot(file){
    const bitmap=await createImageBitmap(file),max=2560,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    return canvas.toDataURL("image/webp",.92);
  }

  async function uploadScreenshot(file){
    if(!file)return;
    const label=$("#boardHomeUploadLabel"),input=$("#boardHomeInput"),old=label?.textContent||"スクショを設定";
    try{
      if(label)label.textContent="保存中…";if(input)input.disabled=true;
      const imageData=await resizeScreenshot(file),response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/home-image`,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":adminToken()},body:JSON.stringify({imageData})}),body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);
      showImage(imageUrl());
    }catch(error){alert(error.message)}finally{if(label)label.textContent=old;if(input){input.disabled=false;input.value=""}}
  }

  const input=$("#boardHomeInput");if(input)input.addEventListener("change",event=>uploadScreenshot(event.target.files?.[0]));
  syncOwner();showImage(imageUrl());
  addEventListener("storage",syncOwner);
})();
