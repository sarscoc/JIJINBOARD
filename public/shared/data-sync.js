"use strict";
(()=>{
 if(globalThis.JijinSync)return;
  // Every invalidation increments a generation. A notification during an older
  // GET must cause another GET, including when several callers share a promise.
  function loader(read, apply) {
    let requested = 0, applied = 0, task = null, patches=[];
    function refresh() {
      requested++;
      if (!task) {
        task = (async () => {
          while (applied < requested) {
            const generation = requested;
            const patchStart=patches.length;
            const data = await read();
            if (generation === requested) { await apply(data); for(const patch of patches.slice(patchStart))patch(); applied = generation; }
          }
        })().finally(() => { task = null; patches=[]; });
      }
      return task;
    }
    refresh.patch=patch=>{patch();if(task)patches.push(patch)};
    return refresh;
  }
  function serialize() {
    const pending = new Map();
    return (key, write) => {
      const previous = pending.get(key) || Promise.resolve();
      const task = previous.catch(() => {}).then(write);
      pending.set(key, task);
      task.finally(() => { if (pending.get(key) === task) pending.delete(key); }).catch(() => {});
      return task;
    };
  }

  function reduce(rows,action,data,{scope='',viewerId='',own=false}={}){
    if(!data||!['comment:create','comment:edit','comment:delete','comment:like'].includes(action))return null;
    const incoming=data.comment||data.annotation||data.patch;
    const address=data.target||incoming?.target;
    if(!address)return null;
    if(scope&&address!==scope&&!address.startsWith(scope+'/'))return rows;
    if(action==='comment:delete')return Array.isArray(data.deletedIds)?rows.filter(row=>!data.deletedIds.includes(row.id)):null;
    if(action==='comment:like'){
      if(!data.id)return null;
      return rows.map(row=>row.id===data.id?{...row,like_count:Number(data.likeCount)||0,...(data.actorId===viewerId?{liked_by_me:!!data.liked}:{})}:row);
    }
    if(!incoming?.id)return null;
    const previous=rows.find(row=>row.id===incoming.id);
    // Reaction selection is personal; another viewer's response must not replace it.
    const item={...previous,...incoming,liked_by_me:own?!!incoming.liked_by_me:!!previous?.liked_by_me};
    if(action==='comment:edit'&&!previous)return null;
    return previous?rows.map(row=>row.id===item.id?item:row):[...rows,item];
  }
  function ledger(){
    let baseline=-1;const versions=new Map();
    const newer=data=>!Number.isFinite(data?.version)||data.version>baseline;
    return {
      snapshot(version){if(Number.isFinite(version))baseline=Math.max(baseline,version)},newer,
      accept(action,data){
        if(!newer(data))return false;
        const ids=data?.deletedIds||[data?.id||data?.comment?.id||data?.annotation?.id||data?.patch?.id];
        if(!Number.isFinite(data?.version))return true;
        if(ids.every(id=>(versions.get(id)??-1)>=data.version))return false;
        for(const id of ids)versions.set(id,data.version);return true;
      }
    };
  }
  // Bound realtime payloads to the hub contract; large resources use invalidation.
  const payload=value=>JSON.stringify(value).length<=5500?value:null;

 globalThis.JijinSync=Object.freeze({loader,serialize,reduce,payload,ledger});
})();
