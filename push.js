/* Harada web push — optional, requires installed iOS 16.4+ Home Screen app. */
(()=>{'use strict';
const url=window.HARADA_SUPABASE_URL, key=window.HARADA_SUPABASE_ANON_KEY, vapid=window.HARADA_VAPID_PUBLIC_KEY;
if(!url||!key||!window.supabase)return;
// Separate client uses the same Supabase session persisted by supabase-js.
const db=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const toBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
let busy=false,info='';
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window)&&window.isSecureContext;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent);
const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
async function me(){const {data,error}=await db.auth.getUser();if(error)throw error;return data?.user}
async function status(){if(!supported())return 'unsupported';if(ios()&&!installed())return 'install';const permission=Notification.permission;if(permission==='denied')return 'blocked';const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();return sub?'enabled':permission==='granted'?'off':'ask'}
async function enable(){if(busy)return;busy=true;try{
 const user=await me();if(!user)throw Error('Sign in to Harada Friends first.');
 if(!supported())throw Error('Push notifications are not supported in this browser.');
 if(ios()&&!installed())throw Error('On iPhone, open Harada in Safari, tap Share → Add to Home Screen, then open the installed Harada app.');
 const perm=await Notification.requestPermission();if(perm!=='granted')throw Error('Notifications were not allowed. Enable them in iPhone Settings → Notifications → Harada.');
 const reg=await navigator.serviceWorker.ready;
 let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(vapid)});
 const j=sub.toJSON();const {data:existing,error:readError}=await db.from('harada_push_subscriptions').select('id').eq('endpoint',j.endpoint).maybeSingle();if(readError)throw readError;const payload={p256dh:j.keys.p256dh,auth:j.keys.auth,user_agent:navigator.userAgent.slice(0,300),updated_at:new Date().toISOString()};const result=existing?await db.from('harada_push_subscriptions').update(payload).eq('id',existing.id):await db.from('harada_push_subscriptions').insert({user_id:user.id,endpoint:j.endpoint,...payload});if(result.error)throw result.error;
 info='Notifications enabled on this device.';
 }catch(e){info=e.message||String(e)}finally{busy=false;draw()}}
async function disable(){if(busy)return;busy=true;try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub){const {error}=await db.from('harada_push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)throw error;await sub.unsubscribe()}info='Notifications turned off on this device.'}catch(e){info=e.message||String(e)}finally{busy=false;draw()}}
async function draw(){const host=document.querySelector('#harada-push-controls');if(!host)return;
 let st;try{st=await status()}catch(e){st='error';info=e.message}
 if(!host.isConnected)return;
 const label=st==='enabled'?'Notifications are on for this device.':st==='install'?'On iPhone: Safari → Share → Add to Home Screen. Then open Harada from its icon.':st==='blocked'?'Notifications are blocked. Allow them in iPhone Settings → Notifications → Harada.':st==='unsupported'?'This browser does not support push notifications.':st==='off'?'Notifications are currently off.':'Get nudges on your phone even when Harada is closed.';
 host.innerHTML='<h3>Phone notifications</h3><p class="friends-muted">'+label+'</p>'+((st==='ask'||st==='off')?'<button class="friends-btn" id="push-enable">Enable notifications</button>':st==='enabled'?'<button class="friends-btn light" id="push-disable">Turn off notifications</button>':'')+(info?'<p class="friends-muted" role="status"></p>':'');
 if(info)host.querySelector('[role=status]').textContent=info;
 host.querySelector('#push-enable')?.addEventListener('click',enable);
 host.querySelector('#push-disable')?.addEventListener('click',disable);
}
async function notifyNudge(nudgeId){try{const {data}=await db.auth.getSession();const token=data?.session?.access_token;if(!token)return;
 const res=await fetch(url+'/functions/v1/harada-send-push',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':key},body:JSON.stringify({nudge_id:nudgeId})});
 if(!res.ok)console.warn('Push delivery unavailable; in-app nudge was saved.',res.status);
 }catch(e){console.warn('Push delivery unavailable; in-app nudge was saved.',e)}}
window.HaradaPush={draw,notifyNudge};
})();
