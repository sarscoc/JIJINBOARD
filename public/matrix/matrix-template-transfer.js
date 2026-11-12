'use strict';
(()=>{
  const settings=document.getElementById('displaySettingsBody'),ctx=window.matrixBoardContext;
  if(!settings||!ctx)return;
  const section=document.createElement('section');
  section.className='settings-panel-section matrix-template-transfer';
  section.innerHTML=`
    <div class="settings-panel-title">テンプレートの一括移行</div>
    <div class="matrix-transfer-actions">
      <button type="button" data-download>すべてダウンロード</button>
      <button type="button" data-import>ファイルから一括追加</button>
    </div>
    <input type="file" accept=".json,application/json" hidden>
    <form class="matrix-transfer-actions">
      <input id="matrixTransferDestination" type="url" aria-label="コピー先の部屋URL" required placeholder="コピー先の部屋URL">
      <button type="submit">別の部屋にコピー</button>
    </form>
    <p class="matrix-transfer-caption">画像・表示設定・コマ配置・補足が対象です。</p>
    <p class="matrix-transfer-caption" role="status" aria-live="polite"></p>`;
  const deleteButton=document.getElementById('deleteCurrentTemplateBtn');
  settings.insertBefore(section,deleteButton?.parentElement===settings?deleteButton:null);
  const download=section.querySelector('[data-download]'),importButton=section.querySelector('[data-import]');
  const file=section.querySelector('input[type=file]'),form=section.querySelector('form');
  const destination=form.querySelector('input'),status=section.querySelector('[role=status]');
  const controls=[download,importButton,destination,form.querySelector('button')];
  const format='jijinboard-matrix-templates';
  const collection=board=>`/api/boards/${encodeURIComponent(board)}/matrix/${encodeURIComponent(board)}/templates`;
  let busy=false,pending=null;

  function dataUrl(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result));
      reader.onerror=()=>reject(new Error('テンプレ画像を読み込めませんでした'));
      reader.readAsDataURL(blob);
    });
  }

  async function collect(){
    const {templates}=await ctx.api(collection(ctx.boardId));
    if(!templates?.length)throw new Error('保存済みのテンプレートがありません');
    const result=[];
    for(const {record,templateState} of templates){
      status.textContent=`テンプレートを取得中（${result.length}/${templates.length}件）`;
      let image='';
      if(record.dataUrl){
        const response=await fetch(record.dataUrl,{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error(`画像を取得できませんでした「${record.name}」`);
        image=await dataUrl(await response.blob());
      }
      result.push({record:{name:record.name,imageName:record.imageName,createdAt:record.createdAt,dataUrl:image},templateState});
    }
    return {format,version:1,templates:result};
  }

  function validate(bundle){
    if(bundle?.format!==format||bundle.version!==1||!Array.isArray(bundle.templates)||!bundle.templates.length||
       bundle.templates.some(row=>typeof row?.record?.name!=='string'||typeof row.record.dataUrl!=='string'||
         (row.record.dataUrl&&!/^data:image\/[\w.+-]+;base64,[\w+/=]+$/.test(row.record.dataUrl))||
         !row.templateState||typeof row.templateState!=='object'||Array.isArray(row.templateState))){
      throw new Error('自陣ボードからダウンロードしたテンプレートファイルを選んでください');
    }
    return bundle;
  }

  async function transfer(board,bundle){
    const profile=ctx.profile();
    if(!profile?.id||!profile.plName)throw new Error('先にPLを登録してください');
    if(!pending){
      pending={board,rows:bundle.templates.map(row=>({...row,id:crypto.randomUUID()})),done:0};
    }
    const {rows}=pending;
    try{
      for(;pending.done<rows.length;pending.done++){
        const {id,record,templateState}=rows[pending.done],path=`${collection(board)}/${id}`;
        status.textContent=`テンプレートを追加中（${pending.done}/${rows.length}件）`;
        try{
          await ctx.api(path,{method:'PUT',body:JSON.stringify({baseRevision:null,authorId:profile.id,authorName:profile.plName,record,templateState})});
        }catch(error){
          // A timed-out write may already have committed. Reuse the same ID on retry.
          if(error.status!==409)throw error;
          await ctx.api(path);
        }
      }
      status.textContent=`${rows.length}件を追加しました。`;
      pending=null;
    }catch(error){
      throw new Error(`${pending.done}/${rows.length}件まで追加。 ${error.message}。もう一度同じ操作で再開できます`);
    }finally{
      if(board===ctx.boardId)window.dispatchEvent(new CustomEvent('matrix-board-comments-changed',{detail:{action:'matrix-template-state'}}));
    }
  }

  async function run(task){
    if(busy)return;
    busy=true;controls.forEach(control=>control.disabled=true);
    try{await task()}catch(error){status.textContent=error.message}
    finally{busy=false;controls.forEach(control=>control.disabled=false)}
  }
  download.addEventListener('click',()=>run(async()=>{
    const bundle=await collect();
    const url=URL.createObjectURL(new Blob([JSON.stringify(bundle)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='jijinboard-matrix-templates.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent=`${bundle.templates.length}件をダウンロードしました。`;
  }));
  importButton.addEventListener('click',()=>{
    if(pending?.board===ctx.boardId){run(()=>transfer(ctx.boardId));return}
    file.click();
  });
  file.addEventListener('change',()=>run(async()=>{
    const selected=file.files?.[0];file.value='';
    if(!selected)return;
    if(pending)throw new Error('途中のコピーを先に再開してください');
    await transfer(ctx.boardId,validate(JSON.parse(await selected.text())));
  }));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    run(async()=>{
      const target=new URL(destination.value),board=target.searchParams.get('id');
      if(target.origin!==location.origin||!/^\/board(?:\/index\.html|\/)?$/.test(target.pathname)||!board||board===ctx.boardId){
        throw new Error('別の自陣ボードの部屋URLを入力してください');
      }
      if(pending&&pending.board!==board)throw new Error('途中の一括追加を先に再開してください');
      if(pending){await transfer(board);return}
      await ctx.api(`/api/boards/${encodeURIComponent(board)}?summary=1`);
      await transfer(board,await collect());
    });
  });
})();
