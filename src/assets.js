// HTML owns its dependency list. Do not append older UI helpers at delivery time:
// Workers, Pages, and direct static assets must initialize the same interface.
export async function serveAsset(request,env,url=new URL(request.url)){
  const response=await env.ASSETS.fetch(request);
  if(request.method!=='GET'||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
  let html=await response.text();
  if(/^\/board\/?(?:index\.html)?$/.test(url.pathname)&&url.searchParams.get('id')){
    const image=new URL('/api/boards/'+encodeURIComponent(url.searchParams.get('id'))+'/home-image',url.origin).href;
    html=html.replace(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:card)["'][^>]*>/g,'');
    html=html.replace('</head>',`<meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}"><meta name="twitter:card" content="summary_large_image"></head>`);
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-cache');
  return new Response(html,{headers,status:response.status,statusText:response.statusText});
}
