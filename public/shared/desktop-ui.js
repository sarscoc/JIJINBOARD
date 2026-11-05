'use strict';
(()=>{
 let viewport=window;try{if(parent!==window)viewport=parent}catch{}
 if(viewport.innerWidth<=760)return;
 const timestamp=value=>{const s=String(value||'');const n=Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/.test(s)?s:s.replace(' ','T')+'Z');return Number.isFinite(n)?n:0};
 const newest=(a,b)=>timestamp(b.created_at)-timestamp(a.created_at)||String(b.id||'').localeCompare(String(a.id||''));
 document.documentElement.classList.add('jijin-desktop');window.JijinDesktop={newest,timestamp};
 const style=document.createElement('style');style.textContent=`
 html.jijin-desktop #sheetComments .comment-body,html.jijin-desktop .matrix-comment-body-row p,html.jijin-desktop .comment-body{font:400 11px/1.55 system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif!important;margin:4px 0 0!important}
 html.jijin-desktop .inline-comment-editor{display:grid!important;gap:6px!important;width:240px!important;height:auto!important;padding:8px!important}
 html.jijin-desktop .inline-comment-editor textarea{font:12px/1.5 system-ui!important;min-height:72px!important;width:100%!important;box-sizing:border-box!important}
 html.jijin-desktop .inline-comment-editor [role=status]{font:10px/1.4 system-ui;color:#a56e83;white-space:normal}
 html.jijin-desktop .inline-comment-editor [role=status]:empty{display:none}
 html.jijin-desktop #sheetComments .comment-avatar{width:24px!important;height:24px!important;flex-basis:24px!important}
 html.jijin-desktop :is(.full-character-page,.connected-character-page,.character-popup .modal){background-color:var(--character-bg,#fff)!important;color:var(--character-answer-text,var(--character-text,#303641))!important}
 html.jijin-desktop :is(.full-character-page,.connected-character-page,.character-popup .modal) :is(.character-sheet-edit,.character-answer,.character-sheet-value){color:var(--character-answer-text,var(--character-text,#303641))!important;-webkit-text-fill-color:var(--character-answer-text,var(--character-text,#303641))!important}
 html.jijin-desktop :is(.full-character-page,.connected-character-page,.character-popup .modal) :is(.character-sheet-label,.character-row-label){color:var(--character-question-text,#8b93a2)!important;-webkit-text-fill-color:var(--character-question-text,#8b93a2)!important}
 html.jijin-desktop :is(.full-character-page,.connected-character-page,.character-popup .modal) :is(.character-sheet-group-title,.full-character-page-title){color:var(--sheet-accent)!important;-webkit-text-fill-color:var(--sheet-accent)!important}
 `;document.head.append(style);
})();
