// Supabase Edge Function: harada-send-push
// Deploy with "Verify JWT" OFF; this function validates the caller's JWT itself.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
const cors={'Access-Control-Allow-Origin':'https://logankee.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
webpush.setVapidDetails('mailto:harada-notifications@example.com',Deno.env.get('VAPID_PUBLIC_KEY')!,Deno.env.get('VAPID_PRIVATE_KEY')!);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return json({error:'Unauthorized'},401);
  const {data:{user},error:authError}=await admin.auth.getUser(token);if(authError||!user)return json({error:'Unauthorized'},401);
  const {nudge_id}=await req.json();if(!Number.isSafeInteger(nudge_id)||nudge_id<=0)return json({error:'Invalid nudge ID'},400);
  const {data:nudge,error:nudgeError}=await admin.from('harada_nudges').select('id,sender,recipient,goal_name,created_at').eq('id',nudge_id).maybeSingle();
  if(nudgeError||!nudge||nudge.sender!==user.id)return json({error:'Nudge not found'},404);
  if(Date.now()-new Date(nudge.created_at).getTime()>5*60*1000)return json({error:'Nudge too old'},409);
  // Only send once for each nudge, even if the sender retries the request.
  const {data:claimed,error:claimError}=await admin.from('harada_push_deliveries').insert({nudge_id:nudge.id}).select('nudge_id').maybeSingle();
  if(claimError){if(claimError.code==='23505')return json({status:'already processed'});throw claimError}
  if(!claimed)return json({status:'already processed'});
  const {data:profile}=await admin.from('harada_profiles').select('display_name').eq('id',user.id).maybeSingle();
  const {data:subs,error:subsError}=await admin.from('harada_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',nudge.recipient);if(subsError)throw subsError;
  const payload=JSON.stringify({title:'A nudge from '+(profile?.display_name||'a friend')+'!',body:'Don\'t forget: '+nudge.goal_name,tag:'harada-nudge-'+nudge.id});
  let delivered=0;
  for(const sub of subs||[]){try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{TTL:3600});delivered++}catch(e){const code=(e as {statusCode?:number}).statusCode;if(code===404||code===410)await admin.from('harada_push_subscriptions').delete().eq('id',sub.id);else console.error('Web push failed:',code,String(e))}}
  return json({status:'processed',delivered});
 }catch(e){console.error(e);return json({error:'Unable to deliver push'},500)}
});
