/* Harada Friends v1 — optional Supabase integration. No existing local goals are replaced. */
(()=>{'use strict';
const app=()=>window.HaradaApp, esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=window.HARADA_SUPABASE_URL, key=window.HARADA_SUPABASE_ANON_KEY;
const configured=!!(url&&key&&window.supabase);
const db=configured?window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let user=null, profile=null, friends=[], requests=[], outgoing=[], shared=[], nudges=[], section='feed', message='', busy=false, syncTimer=null, refreshTimer=null, booted=false;
const ui=()=>{if(app()?.getTab()==='Friends')app().refresh()};
const error=e=>{message=e?.message||String(e);ui()};
const friendly=e=>{message=e;ui()};
function progress(g,s){const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 let start=today;if(g.frequency==='weekly'){const d=new Date(now);d.setDate(d.getDate()-(d.getDay()+6)%7);start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}else if(g.frequency==='monthly')start=today.slice(0,7)+'-01';
 let total=0;for(const [date,values] of Object.entries(s.entries||{}))if(date>=start&&date<=today)total+=Number(values[g.id]||0);
 return {owner_id:user.id,goal_id:g.id,goal_name:g.name,category:s.categories.find(c=>c.id===g.cat)?.name||'Goal',frequency:g.frequency,progress:Math.round(total*100)/100,target:g.target,unit:g.unit||'',mode:g.mode||'reach',completed:g.mode==='under'?total<=g.target:total>=g.target,updated_at:new Date().toISOString()};
}
async function sync(){if(!user||!db)return;const s=app()?.getState();if(!s)return;const ids=(s.sharedGoalIds||[]).filter(id=>s.goals.some(g=>g.id===id));
 const rows=s.goals.filter(g=>ids.includes(g.id)).map(g=>progress(g,s));
 const {data:existing,error:readError}=await db.from('harada_shared_goals').select('goal_id').eq('owner_id',user.id);if(readError)throw readError;
 const toDelete=(existing||[]).map(r=>r.goal_id).filter(id=>!ids.includes(id));
 if(toDelete.length){const {error:e}=await db.from('harada_shared_goals').delete().eq('owner_id',user.id).in('goal_id',toDelete);if(e)throw e}
 if(rows.length){const {error:e}=await db.from('harada_shared_goals').upsert(rows,{onConflict:'owner_id,goal_id'});if(e)throw e}
}
function scheduleSync(){if(!user)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync().catch(error),900)}
async function load(){if(!user)return;
 const [fr,go,nu,pr]=await Promise.all([
 db.from('harada_friendships').select('*').or(`requester.eq.${user.id},recipient.eq.${user.id}`).order('created_at',{ascending:false}),
 db.from('harada_shared_goals').select('*'),
 db.from('harada_nudges').select('*').or(`sender.eq.${user.id},recipient.eq.${user.id}`).order('created_at',{ascending:false}).limit(50),
 db.from('harada_profiles').select('*').eq('id',user.id).maybeSingle()
 ]);
 for(const r of [fr,go,nu,pr])if(r.error)throw r.error;
 const f=fr.data||[];friends=f.filter(x=>x.status==='accepted');requests=f.filter(x=>x.status==='pending'&&x.recipient===user.id);outgoing=f.filter(x=>x.status==='pending'&&x.requester===user.id);shared=go.data||[];nudges=nu.data||[];profile=pr.data;
 const ids=[...new Set(f.flatMap(x=>[x.requester,x.recipient]).filter(x=>x!==user.id))];
 let names={};if(ids.length){const r=await db.from('harada_profiles').select('id,display_name').in('id',ids);if(r.error)throw r.error;for(const p of r.data||[])names[p.id]=p.display_name}
 window.HaradaFriends.names=names;ui();
}
async function reload(){if(!user)return;await load()}
async function signIn(email,password,signup,name){busy=true;ui();try{
 if(signup){const r=await db.auth.signUp({email,password,options:{data:{display_name:name}}});if(r.error)throw r.error;
 if(r.data.user&&r.data.session){user=r.data.user;await ensureProfile(name);await sync();await load();friendly('Account created. You can now connect with friends.')}
 else friendly('Check your email to confirm your account, then sign in.')}
 else{const r=await db.auth.signInWithPassword({email,password});if(r.error)throw r.error;user=r.data.user;await ensureProfile();await sync();await load();friendly('Signed in. Your existing goals are still saved on this device.')}
 }catch(e){error(e)}finally{busy=false;ui()}}
async function ensureProfile(name){if(!user)return;const existing=await db.from('harada_profiles').select('id').eq('id',user.id).maybeSingle();if(existing.error)throw existing.error;
 if(!existing.data){const display=(name||user.user_metadata?.display_name||user.email?.split('@')[0]||'Harada friend').slice(0,60);const r=await db.from('harada_profiles').insert({id:user.id,display_name:display});if(r.error)throw r.error}}
async function action(task,success){if(busy)return;busy=true;message='';ui();try{await task();await load();friendly(success)}catch(e){error(e)}finally{busy=false;ui()}}
function person(id){return esc(window.HaradaFriends.names?.[id]||'Friend')}
function goalRow(g,other){const pct=g.target>0?Math.min(100,Math.round(g.progress/g.target*100)):0;
 const sent=nudges.some(n=>n.sender===user.id&&n.recipient===g.owner_id&&n.goal_id===g.goal_id&&n.sent_on===new Date().toISOString().slice(0,10));
 return `<div class="friends-row"><div style="flex:1;min-width:0"><div class="name">${esc(g.goal_name)}</div><div class="friends-muted">${esc(g.category)} · ${esc(g.progress)}${g.unit?' '+esc(g.unit):''} / ${esc(g.target)} ${esc(g.unit)} · ${esc(g.frequency)}</div><div style="height:5px;background:#e3e9df;border-radius:5px;margin-top:7px;overflow:hidden"><div style="width:${pct}%;background:#719B74;height:100%"></div></div></div>${g.completed?'<span class="friends-muted">✓ Done</span>':`<button class="friends-btn light" data-nudge="${esc(g.owner_id)}" data-goal="${esc(g.goal_id)}" ${sent||busy?'disabled':''}>${sent?'Nudged':'Nudge'}</button>`}</div>`;
}
function render(){if(!configured)return `<main class="screen"><h1 class="section-title">Friends</h1><p class="sub">Better together.</p><section class="card"><h3>Connect Harada to enable Friends</h3><p class="friends-muted">Your existing goals are safe. To connect with friends, create a free Supabase project and add its public URL and key to <b>friends-config.js</b>. Run the supplied <b>supabase-setup.sql</b> first.</p><p class="friends-muted">See SETUP_FRIENDS.md in the download for exact instructions.</p></section></main>`;
 if(!user)return `<main class="screen"><h1 class="section-title">Friends</h1><p class="sub">Share progress, celebrate wins, and give a gentle nudge.</p><section class="card"><h3>Sign in to connect</h3><p class="friends-muted">Your existing goals stay on this phone. Only goals you explicitly share will be uploaded.</p><form id="friends-auth" class="friends-stack"><input class="friends-field" name="name" placeholder="Display name (for new accounts)"><input class="friends-field" name="email" type="email" placeholder="Email" required autocomplete="email"><input class="friends-field" name="password" type="password" placeholder="Password (at least 6 characters)" minlength="6" required autocomplete="current-password"><div class="rowbtns"><button class="friends-btn" name="intent" value="login" ${busy?'disabled':''}>Sign in</button><button class="friends-btn light" name="intent" value="signup" ${busy?'disabled':''}>Create account</button></div></form></section>${message?`<p class="friends-feedback">${esc(message)}</p>`:''}</main>`;
 const s=app()?.getState(),selected=s?.sharedGoalIds||[];
 const tabs=`<div class="friends-tabs">${[['feed','Friends'],['share','Share goals'],['requests','Requests']].map(([id,label])=>`<button data-friends-section="${id}" class="${section===id?'active':''}">${label}${id==='requests'&&requests.length?' ('+requests.length+')':''}</button>`).join('')}</div>`;
 let body='';
 if(section==='share')body=`<section class="card"><h3>Choose what friends can see</h3><p class="friends-muted">All goals are private by default. Friends see only the goals you select and their current progress, not your entire history.</p>${s?.goals.length?s.goals.map(g=>`<label class="friends-row"><span><b>${esc(g.name)}</b><div class="friends-muted">${esc(s.categories.find(c=>c.id===g.cat)?.name||'')}</div></span><input class="friends-toggle" type="checkbox" data-share-goal="${esc(g.id)}" ${selected.includes(g.id)?'checked':''}></label>`).join(''):'<p class="friends-muted">Create a goal in the Goals tab first.</p>'}</section>`;
 else if(section==='requests')body=`<section class="card"><h3>Friend requests</h3>${requests.length?requests.map(r=>`<div class="friends-row"><b>${person(r.requester)}</b><div style="display:flex;gap:5px"><button class="friends-btn" data-respond="${r.id}" data-status="accepted">Accept</button><button class="friends-btn light" data-respond="${r.id}" data-status="declined">Decline</button></div></div>`).join(''):'<p class="friends-muted">No incoming requests.</p>'}<h3 style="margin-top:16px">Sent requests</h3>${outgoing.length?outgoing.map(r=>`<div class="friends-row"><span>${person(r.recipient)}</span><span class="friends-muted">Pending</span></div>`).join(''):'<p class="friends-muted">None pending.</p>'}</section>`;
 else body=`${nudges.filter(n=>n.recipient===user.id).length?`<section class="card"><h3>Recent nudges</h3>${nudges.filter(n=>n.recipient===user.id).slice(0,5).map(n=>`<div class="friends-row"><span><b>${person(n.sender)}</b> nudged you about <b>${esc(n.goal_name)}</b></span><span class="friends-muted">${new Date(n.created_at).toLocaleDateString()}</span></div>`).join('')}</section>`:''}<section class="card"><h3>Your friends</h3>${friends.length?friends.map(f=>{const other=f.requester===user.id?f.recipient:f.requester,goals=shared.filter(g=>g.owner_id===other);return `<div style="padding:8px 0"><div class="friends-row"><b>${person(other)}</b><button class="friends-btn light" data-unfriend="${f.id}">Remove</button></div>${goals.length?goals.map(g=>goalRow(g,other)).join(''):'<p class="friends-muted">No goals shared yet.</p>'}</div>`}).join(''):'<p class="friends-muted">No friends yet. Share your friend ID below or enter theirs.</p>'}</section><section class="card"><h3>Add a friend</h3><p class="friends-muted">Share your friend ID privately. Your friend can paste it here to send a request.</p><div class="friends-code">${esc(user.id)}</div><div class="rowbtns"><button class="friends-btn light" data-copy-id>Copy my ID</button></div><form id="friends-add" class="friends-stack" style="margin-top:12px"><input class="friends-field" name="friendid" placeholder="Paste a friend's ID" required><button class="friends-btn" ${busy?'disabled':''}>Send friend request</button></form></section>`;
 return `<main class="screen"><h1 class="section-title">Friends</h1><p class="sub">Better together. Keep each other going.</p><section class="card"><div class="friends-row"><div><b>${esc(profile?.display_name||user.email||'My account')}</b><div class="friends-muted">Connected to Harada Friends</div></div><button class="friends-btn light" data-signout>Sign out</button></div></section>${tabs}${message?`<p class="friends-feedback" style="margin-top:12px">${esc(message)}</p>`:''}<div style="margin-top:12px">${body}</div><button class="friends-btn light" data-friends-refresh style="width:100%;margin-bottom:15px">Refresh friends</button></main>`;
}
function bind(){const form=document.querySelector('#friends-auth');if(form)form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),intent=e.submitter?.value||'login';signIn(String(f.get('email')).trim(),String(f.get('password')),intent==='signup',String(f.get('name')).trim())};
 document.querySelectorAll('[data-friends-section]').forEach(b=>b.onclick=()=>{section=b.dataset.friendsSection;message='';ui()});
 document.querySelectorAll('[data-share-goal]').forEach(b=>b.onchange=()=>{const s=app().getState();s.sharedGoalIds=s.sharedGoalIds||[];s.sharedGoalIds=b.checked?[...new Set([...s.sharedGoalIds,b.dataset.shareGoal])]:s.sharedGoalIds.filter(id=>id!==b.dataset.shareGoal);localStorage.setItem('gbb-v2',JSON.stringify(s));scheduleSync();ui()});
 const add=document.querySelector('#friends-add');if(add)add.onsubmit=e=>{e.preventDefault();const id=String(new FormData(add).get('friendid')).trim();if(!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id))return friendly('That is not a valid friend ID.');if(id===user.id)return friendly('You cannot add yourself.');action(async()=>{const r=await db.from('harada_friendships').insert({requester:user.id,recipient:id});if(r.error)throw r.error},'Friend request sent.')};
 document.querySelectorAll('[data-respond]').forEach(b=>b.onclick=()=>action(async()=>{const r=await db.from('harada_friendships').update({status:b.dataset.status}).eq('id',b.dataset.respond).eq('recipient',user.id);if(r.error)throw r.error},b.dataset.status==='accepted'?'Friend added.':'Request declined.'));
 document.querySelectorAll('[data-unfriend]').forEach(b=>b.onclick=()=>{if(!confirm('Remove this friend?'))return;action(async()=>{const r=await db.from('harada_friendships').delete().eq('id',b.dataset.unfriend);if(r.error)throw r.error},'Friend removed.')});
 document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>action(async()=>{const g=shared.find(x=>x.owner_id===b.dataset.nudge&&x.goal_id===b.dataset.goal);if(!g)throw Error('Goal is no longer available.');const r=await db.from('harada_nudges').insert({sender:user.id,recipient:g.owner_id,goal_id:g.goal_id,goal_name:g.goal_name});if(r.error)throw r.error},'Nudge sent! Your friend will see it in Harada.'));
 const cp=document.querySelector('[data-copy-id]');if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(user.id);friendly('Friend ID copied.')}catch{friendly('Copy the ID displayed above.')}};
 const out=document.querySelector('[data-signout]');if(out)out.onclick=()=>action(async()=>{const r=await db.auth.signOut();if(r.error)throw r.error;user=null;friends=[];shared=[];nudges=[]},'Signed out.');
 const refresh=document.querySelector('[data-friends-refresh]');if(refresh)refresh.onclick=()=>action(load,'Friends updated.');
}
async function init(){if(booted||!db)return;booted=true;try{const {data,error:e}=await db.auth.getUser();if(e&&e.name!=='AuthSessionMissingError')throw e;if(data?.user){user=data.user;await ensureProfile();await sync();await load()}}
 catch(e){error(e)}ui();db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){user=null;ui()}else if(event==='SIGNED_IN'&&session?.user&&!user){user=session.user;setTimeout(()=>initSignedIn().catch(error),0)}});
 refreshTimer=setInterval(()=>{if(user&&document.visibilityState==='visible')load().catch(()=>{})},30000);
}
async function initSignedIn(){await ensureProfile();await sync();await load()}
window.HaradaFriends={render,bind,scheduleSync,names:{}};
init();
})();
