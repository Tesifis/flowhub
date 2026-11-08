/**
 * FlowHub / Polka — narrowly-scoped, read-only BMSTU calendar relay.
 * Deploy as a Cloudflare Worker. No personal authentication or cookies.
 * Limit to a verified UUID and the fixed BMSTU ICS endpoint (not an open proxy).
 */
const UPSTREAM='https://lks.bmstu.ru/lks-back/srv/v2/ics/';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function respond(body,status=200,extra={}){
 return new Response(body,{status,headers:{
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET, OPTIONS',
  'access-control-allow-headers':'content-type',
  'content-type':'text/plain; charset=utf-8',
  'x-content-type-options':'nosniff',
  ...extra
 }});
}
export default {
 async fetch(request){
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return respond('',204);
  if(request.method!=='GET')return respond('Method not allowed',405);
  if(url.pathname==='/health')return respond('FlowHub BMSTU relay ready');
  const match=url.pathname.match(/^\/ics\/([a-f0-9-]{36})\/?$/i);
  if(!match||!UUID.test(match[1]))return respond('Not found',404);
  try{
   const upstream=await fetch(UPSTREAM+match[1],{
    method:'GET',
    headers:{'Accept':'text/calendar,text/plain'},
    redirect:'error',
    cf:{cacheTtl:900,cacheEverything:true}
   });
   if(!upstream.ok)return respond('BMSTU unavailable: '+upstream.status,502);
   const length=Number(upstream.headers.get('content-length')||0);
   if(length>2000000)return respond('Calendar too large',502);
   // Stream-bound responses can be larger than advertised; reject after read.
   const body=await upstream.text();
   if(body.length>2000000||!body.includes('BEGIN:VCALENDAR'))return respond('Invalid calendar response',502);
   return respond(body,200,{'content-type':'text/calendar; charset=utf-8','cache-control':'public, max-age=900'});
  }catch{
   return respond('Unable to reach BMSTU',502);
  }
 }
};
