(function(root){
  const sections=new Set(['charaHub.characters','charaHub.sources','charaHub.layoutV1']);
  const safe=key=>!['__proto__','constructor','prototype'].includes(key);
  const container=value=>value!==null&&typeof value==='object';
  function diff(before,after,path=[],result=[]){
    if(JSON.stringify(before)===JSON.stringify(after))return result;
    if(container(before)&&container(after)&&Array.isArray(before)===Array.isArray(after)&&(!Array.isArray(before)||before.length===after.length)){
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
        if(safe(key))diff(before[key],after[key],[...path,key],result);
      }
    }else result.push(after===undefined?{path,remove:true}:{path,value:after});
    return result;
  }
  function apply(state,changes){
    if(!Array.isArray(changes)||changes.length>5000)throw Error('Invalid sheet changes');
    const next=JSON.parse(JSON.stringify(state||{}));
    for(const change of changes){
      const path=change?.path;
      if(!Array.isArray(path)||!sections.has(path[0])||path.length>30||path.some(key=>typeof key!=='string'||!safe(key)))throw Error('Invalid sheet path');
      let target=next;
      for(const key of path.slice(0,-1)){
        if(!Object.hasOwn(target,key)||!container(target[key]))throw Error('Unknown sheet path');
        target=target[key];
      }
      const key=path.at(-1);
      if(Array.isArray(target)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=target.length||change.remove))throw Error('Invalid sheet index');
      if(change.remove)delete target[key];
      else if(Object.hasOwn(change,'value'))target[key]=change.value;
      else throw Error('Missing sheet value');
    }
    return next;
  }
  root.JijinSheetPatch=Object.freeze({diff,apply});
})(globalThis);
