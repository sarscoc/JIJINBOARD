"use strict";
(()=>{
  function isImageUrl(value){
    let url;try{url=new URL(value)}catch{return false}
    return /\.(?:png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(url.pathname)||
      /^(?:png|jpe?g|gif|webp|avif)$/i.test(url.searchParams.get('format')||'')||
      ['i.imgur.com','cdn.discordapp.com','media.discordapp.net','pbs.twimg.com','files.catbox.moe'].includes(url.hostname)||
      url.hostname.endsWith('.oaiusercontent.com');
  }
  function render(value,{esc,text,archiveImages={},expandImage=false}){
    const urlPattern=/(https:\/\/[^\s<>"'「」『』。、]+)/g;
    return String(value||"").replace(/\r\n?/g,"\n").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,"\n\n").split(urlPattern).map(part=>{
      if(!part.startsWith("https://"))return text(part);
      let url;
      try{url=new URL(part)}catch{return text(part)}
      const safe=esc(part),link=`<a class="comment-link" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
      if(/\.(?:mp4|webm|ogv|ogg|mov)$/i.test(url.pathname)){
        return `<video class="comment-video" src="${safe}" preload="none" controls playsinline></video>${link}`;
      }
      const host=url.hostname.replace(/^www\./,'');
      let videoId='';
      if(host==='youtu.be')videoId=url.pathname.split('/')[1]||'';
      if(['youtube.com','m.youtube.com','music.youtube.com'].includes(host)){
        videoId=url.pathname==='/watch'?url.searchParams.get('v')||'':url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]||'';
      }
      if(/^[A-Za-z0-9_-]{11}$/.test(videoId)){
        return `<iframe class="comment-video" src="https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1" title="YouTube 動画" loading="lazy" allowfullscreen></iframe>${link}`;
      }
      if(isImageUrl(part)){
        const image=esc(archiveImages[part]||part);
        return `<img class="comment-image url-image" ${expandImage?'data-expand-image':''} src="${image}" alt="引用画像" loading="lazy" referrerpolicy="no-referrer">${link}`;
      }
      return link;
    }).join("");
  }
  window.JijinCommentMedia=Object.freeze({render,isImageUrl});
})();
