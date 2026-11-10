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

let prefs={nudges:true,daily_enabled:false,daily_time:'20:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Chicago'};
let loadedFor=null,loading=false,feedback='';
async function loadPrefs(){const user=await me();if(!user){loadedFor=null;return false}if(loadedFor===user.id)return true;
 const {data,error}=await db.from('harada_notification_preferences').select('nudges,daily_enabled,daily_time,timezone').eq('user_id',user.id).maybeSingle();if(error)throw error;
 prefs={nudges:data?.nudges??true,daily_enabled:data?.daily_enabled??false,daily_time:(data?.daily_time||'20:00').slice(0,5),timezone:data?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Chicago'};loadedFor=user.id;return true}
async function savePrefs(){const user=await me();if(!user)throw Error('Sign in under Friends first.');const payload={user_id:user.id,nudges:prefs.nudges,daily_enabled:prefs.daily_enabled,daily_time:prefs.daily_time,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||prefs.timezone};const {error}=await db.from('harada_notification_preferences').upsert(payload,{onConflict:'user_id'});if(error)throw error;feedback='Preferences saved.'}
async function drawSettings(){const host=document.querySelector('#harada-push-settings');if(!host)return;if(loading)return;loading=true;
 try{const signedIn=await loadPrefs();if(!host.isConnected)return;
  const st=await status().catch(()=>'error');const enabled=st==='enabled';
  host.innerHTML=(signedIn?'<div class="notification-pref"><div><strong>Friend nudges</strong><small>“[Friend] says you should [Goal]”</small></div><input id="harada-pref-nudges" type="checkbox" '+(prefs.nudges?'checked':'')+'></div><div class="notification-pref"><div><strong>Daily check-in</strong><small>Get a reminder to review and update today’s goals</small></div><input id="harada-pref-daily" type="checkbox" '+(prefs.daily_enabled?'checked':'')+'></div><div class="notification-pref"><div><strong>Reminder time</strong><small>Uses your phone’s time zone ('+prefs.timezone.replace(/[^A-Za-z0-9_\/+-]/g,'')+')</small></div><input id="harada-pref-time" type="time" value="'+prefs.daily_time+'" '+(!prefs.daily_enabled?'disabled':'')+'></div>':'<p class="friends-muted">Sign in on the Friends tab to save notification preferences.</p>')+'<p class="friends-muted">Phone push: '+(enabled?'Enabled':st==='install'?'Install Harada to your iPhone Home Screen first':st==='blocked'?'Blocked in iPhone settings':'Not enabled on this device')+'</p>'+(signedIn&&!enabled?'<button class="friends-btn" id="harada-settings-enable">Enable phone notifications</button>':'')+(feedback?'<p class="friends-muted" role="status"></p>':'');
  if(feedback)host.querySelector('[role=status]').textContent=feedback;
  host.querySelector('#harada-settings-enable')?.addEventListener('click',async()=>{await enable();drawSettings()});
  for(const [id,key] of [['harada-pref-nudges','nudges'],['harada-pref-daily','daily_enabled'],['harada-pref-time','daily_time']])host.querySelector('#'+id)?.addEventListener('change',async e=>{prefs[key]=key==='daily_time'?e.target.value:e.target.checked;try{await savePrefs()}catch(err){feedback=err.message||String(err)}drawSettings()});
 }catch(e){if(host.isConnected)host.textContent='Unable to load notification preferences: '+(e.message||e)}finally{loading=false}}

window.HaradaPush={draw,drawSettings,notifyNudge};
})();
