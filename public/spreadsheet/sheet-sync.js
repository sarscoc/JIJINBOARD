(()=>{
  const board=new URL(location.href).searchParams.get('board');if(!board)return;
  const keys=['charaHub.characters','charaHub.sources','charaHub.layoutV1'],api=async(path,options={})=>{const r=await fetch(path,{headers:{'content-type':'application/json'},...options}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'同期に失敗しました');return d};
  const read=()=>Object.fromEntries(keys.map(k=>[k,JSON.parse(localStorage.getItem(k)|| (k==='charaHub.layoutV1'?'{"groups":[],"assignments":{},"localItems":[],"parts":[]}':'[]'))]));
  const meaningful=s=>(s['charaHub.characters']||[]).length||(s['charaHub.sources']||[]).length||(s['charaHub.layoutV1']?.localItems||[]).length||(s['charaHub.layoutV1']?.parts||[]).length;
  let timer,loading=true;const push=()=>{if(loading)return;clearTimeout(timer);timer=setTimeout(()=>api(`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`,{method:'POST',body:JSON.stringify({state:read()})}).catch(console.warn),700)};
  const raw=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){const result=raw.call(this,key,value);if(this===localStorage&&keys.includes(String(key)))push();return result};
  (async()=>{try{const remote=(await api(`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`)).state;if(remote&&meaningful(remote)){const local=read(),same=JSON.stringify(local)===JSON.stringify(remote);if(!same){keys.forEach(k=>localStorage.setItem(k,JSON.stringify(remote[k]??(k==='charaHub.layoutV1'?{}:[]))));location.reload();return}}else if(meaningful(read()))await api(`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`,{method:'POST',body:JSON.stringify({state:read()})})}catch(error){console.warn(error)}finally{loading=false}})();
})();
