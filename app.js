"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const dkeyLocal=(d=new Date())=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const fmtT=ms=>ms?new Date(ms).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—';
const fmtD=k=>new Date(k+'T00:00:00').toLocaleDateString([], {weekday:'short',day:'numeric',month:'short'});
const fmtDur=(a,b)=>{if(!a||!b)return '';const m=Math.max(0,Math.round((b-a)/60000));return Math.floor(m/60)+'h '+pad(m%60)+'m';};
const fmtHM=m=>Math.floor(m/60)+'h '+pad(m%60)+'m';
const fmtDist=m=>m<1000?Math.round(m)+' m':(m/1000).toFixed(1)+' km';
const mapUrl=e=>'https://www.google.com/maps?q='+e.lat+','+e.lng;
function hav(a,b,c,d){const R=6371000,t=x=>x*Math.PI/180,dl=t(c-a),dg=t(d-b);const h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const CODE_RE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,28}[A-Za-z0-9]$/;

const ICON={
 sheet:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16l1.500 1.500L13 15"/></svg>',
 mark:'<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
 today:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500"/><path d="M16 11.500a3 3 0 1 0 0-6M18 20c0-2.300-.8-4-2.500-4.900"/></svg>',
 recs:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
 team:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.500"/><path d="M5 20c0-3.700 3-6 7-6s7 2.300 7 6"/></svg>',
 settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
 account:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.500"/><path d="M5 20c0-3.700 3-6 7-6s7 2.300 7 6"/></svg>'
};
const LABEL={sheet:'Sheet',mark:'Attendance',today:'Today',recs:'Records',team:'Team',settings:'Settings',account:'Account'};

const S={user:null,booting:true,fatal:'',cfg:{sites:[],blockOutside:false,mySiteId:null},todayKey:null,status:null,today:null,users:null,
  recs:null,recsLoading:false,tab:'mark',loginErr:'',setup:false,photos:{},photoAt:0,
  flt:{user:'',from:dkeyLocal(new Date(Date.now()-6*864e5)),to:dkeyLocal()},
  siteForm:{name:'',lat:'',lng:'',radius:150},
  nu:{empCode:'',name:'',designation:'',role:'employee',siteId:''},bulk:{lines:'',siteId:''},purgeDays:90,exporting:false,sum:null,sumLoading:false,sumMonth:dkeyLocal().slice(0,7),bsh:{site:'',start:'08:00',end:'20:00'},graceEdit:null,pending:null,sheet:{mode:'day',date:null,day:null,loading:false,month:dkeyLocal().slice(0,7),grid:null,site:'',unmarked:false,fail:''}};
let sb=null,sbTmp=null;
const isAdmin=()=>S.user&&S.user.role==='admin';

/* ---------- Supabase helpers ---------- */
function friendly(e){
  const m=(e&&e.message)?String(e.message):String(e||'');
  const mm=/MISSING_MARKS:(\d+)/.exec(m);if(mm)return 'Mark every day before submitting ('+mm[1]+' not marked yet).';
  if(/SHEET_LOCKED/.test(m))return 'This month\'s sheet is submitted and locked. Ask admin to return it for corrections.';
  if(/FUTURE_DATE/.test(m))return 'You cannot mark a future date.';
  if(/NO_CHECKIN/.test(m))return 'Admins and field officers do not check in.';
  const o=/OUTSIDE_SITE:(\d+):(.*)/.exec(m);
  if(o)return 'You are outside your site ('+fmtDist(+o[1])+' from '+o[2]+'). Move to your site to mark attendance.';
  if(/ALREADY_IN/.test(m))return 'You are already checked in.';
  if(/NO_OPEN/.test(m))return 'You have no open shift to check out of.';
  if(/LOCATION_REQUIRED/.test(m))return 'Location is required to mark attendance.';
  if(/PHOTO_REQUIRED/.test(m))return 'A selfie photo is required.';
  if(/ACCOUNT_DISABLED/.test(m))return 'Your account is not active. Please contact your admin.';
  if(/FORBIDDEN/.test(m))return 'Only admins can do that.';
  if(/Invalid login credentials/i.test(m))return 'Wrong Employee ID or password.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))return 'No connection. Check your internet and try again.';
  if(/rate limit|too many requests/i.test(m)||(e&&e.status===429))return 'Too many attempts. Please wait a few minutes and try again.';
  return m||'Something went wrong';
}
async function rpc(name,args){
  const r=await sb.rpc(name,args||{});
  if(r.error)throw new Error(friendly(r.error));
  return r.data;
}
async function qry(p){const r=await p;if(r.error)throw new Error(friendly(r.error));return r.data;}
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3200);}
const emailFor=code=>String(code).trim().toLowerCase()+'@'+PF_CONFIG.EMAIL_DOMAIN;
function genPw(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=new Uint32Array(8);crypto.getRandomValues(b);return Array.from(b,x=>A[x%A.length]).join('');}
function tmpClient(){
  if(!sbTmp)sbTmp=supabase.createClient(PF_CONFIG.SUPABASE_URL,PF_CONFIG.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'pf-tmp'}});
  return sbTmp;
}

/* ---------- row mapping and photos ---------- */
const ms=t=>t?Date.parse(t):null;
function mapRow(r){
  const ci={t:ms(r.in_at),lat:r.in_lat,lng:r.in_lng,acc:r.in_acc,site:r.in_site,dist:r.in_dist,inside:r.in_inside,photo:r.in_photo};
  const co=r.out_at?{t:ms(r.out_at),lat:r.out_lat,lng:r.out_lng,acc:r.out_acc,site:r.out_site,dist:r.out_dist,inside:r.out_inside,photo:r.out_photo}:null;
  const o={id:r.id,date:r.work_date,checkIn:ci,checkOut:co,manual:!!r.out_manual,inNote:r.in_note,outNote:r.out_note,lateMin:r.late_min,earlyMin:r.early_min};
  if(r.profiles){o.name=r.profiles.name;o.empCode=r.profiles.emp_code;o.userId=r.user_id;}
  return o;
}
function mapProfile(p){return {id:p.id,empCode:p.emp_code,name:p.name,designation:p.designation,role:p.role,siteId:p.site_id,active:p.active,mustChange:p.must_change,shiftStart:p.shift_start?String(p.shift_start).slice(0,5):null,shiftEnd:p.shift_end?String(p.shift_end).slice(0,5):null};}
async function signPhotos(rows){
  if(Date.now()-S.photoAt>45*60000){S.photos={};S.photoAt=Date.now();}
  const need=[];
  rows.forEach(r=>[r.checkIn,r.checkOut].forEach(e=>{if(e&&e.photo&&!S.photos[e.photo]&&need.indexOf(e.photo)<0)need.push(e.photo);}));
  for(let i=0;i<need.length;i+=100){
    const r=await sb.storage.from('selfies').createSignedUrls(need.slice(i,i+100),3600);
    if(r.data)r.data.forEach(x=>{if(x.signedUrl)S.photos[x.path]=x.signedUrl;});
  }
}

/* ---------- views ---------- */
let raf=0;
function draw(){cancelAnimationFrame(raf);raf=requestAnimationFrame(doDraw);}
const tabsFor=()=>isAdmin()?['today','sheet','recs','team','settings']:S.user.role==='field_officer'?['sheet','today','recs','account']:['mark','account'];
function doDraw(){
  const app=$('#app'),nav=$('#nav');
  if(S.fatal){nav.hidden=true;app.innerHTML=`<div class="banner bad"><b>Setup needed.</b> ${esc(S.fatal)}</div>`;return;}
  if(S.booting){app.innerHTML='<div class="card muted"><span class="spin"></span> Loading…</div>';nav.hidden=true;$('#who').innerHTML='';return;}
  if(!S.user){nav.hidden=true;$('#who').innerHTML='';app.innerHTML=S.setup?viewSetup():viewLogin();return;}
  $('#who').innerHTML=`<b>${esc(S.user.name)}</b><i>${isAdmin()?'Admin':S.user.role==='field_officer'?'Field officer':esc(S.user.empCode)}</i>`;
  if(S.user.mustChange){nav.hidden=true;app.innerHTML=viewMustChange();return;}
  const tabs=tabsFor();
  nav.hidden=false;
  $('#navIn').innerHTML=tabs.map(k=>`<button data-tab="${k}" aria-selected="${S.tab===k}">${ICON[k]}<span>${LABEL[k]}</span></button>`).join('');
  const v={sheet:viewSheet,mark:viewMark,today:viewToday,recs:viewRecs,team:viewTeam,settings:viewSettings,account:viewAccount}[S.tab]||viewMark;
  app.innerHTML=v();
  tick();
}
function viewLogin(){
  return `<div class="login card"><img class="lg" src="logo.jpg" alt="Public Force Security Services">
  <h2>Sign in</h2><p class="sub muted">Use the Employee ID and password given by your company.</p>
  <form id="loginForm" autocomplete="on">
  <label class="f" for="lc">Employee ID</label><input id="lc" name="username" autocomplete="username" autocapitalize="characters" autocorrect="off" required>
  <label class="f" for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required>
  <p class="formerr" id="loginErr" role="alert">${esc(S.loginErr)}</p>
  <button class="big" type="submit" id="loginBtn">Sign in</button></form>
  <button class="linkbtn" data-act="showsetup" style="color:var(--accent)">First-time company setup</button></div>`;
}
function viewSetup(){
  return `<div class="login card"><h2>Create admin account</h2><p class="sub muted">Only for the very first setup. You need the setup code from your setup file.</p>
  <form id="setupForm"><label class="f" for="sc">Setup code</label><input id="sc" autocapitalize="characters" autocomplete="off" required>
  <label class="f" for="si">Admin ID</label><input id="si" value="ADMIN" autocapitalize="characters" required>
  <label class="f" for="sn2">Admin name</label><input id="sn2" required>
  <label class="f" for="sp">Password (8+ characters)</label><input id="sp" type="password" autocomplete="new-password" required>
  <p class="formerr" id="setupErr" role="alert"></p><button class="big" type="submit">Create admin</button></form>
  <button class="linkbtn" data-act="hidesetup" style="color:var(--accent)">Back to sign in</button></div>`;
}
function viewMustChange(){
  return `<div class="login card"><h2>Set a new password</h2><p class="sub muted">For your security, choose a new password before continuing.</p>
  <form id="pwForm"><label class="f" for="p0">Current (temporary) password</label><input id="p0" type="password" autocomplete="current-password" required>
  <label class="f" for="p1">New password (6+ characters)</label><input id="p1" type="password" autocomplete="new-password" required>
  <label class="f" for="p2">Repeat new password</label><input id="p2" type="password" autocomplete="new-password" required>
  <p class="formerr" id="pwErr" role="alert"></p><button class="big" type="submit">Save password</button></form>
  <button class="linkbtn" data-act="logout" style="color:var(--accent)">Sign out</button></div>`;
}
function chipFor(e){
  if(!e)return '';
  if(e.inside===true)return `<span class="chip ok">On site${e.site?' · '+esc(e.site):''}</span>`;
  if(e.inside===false)return `<span class="chip bad">Off site${e.dist!=null?' · '+fmtDist(e.dist):''}</span>`;
  return e.lat!=null?'<span class="chip">Location logged</span>':'<span class="chip warn">No location</span>';
}
function thumb(e,label,who){
  if(!e||!e.photo)return `<div class="thumb empty">${e&&e.t?label:label}</div>`;
  const u=S.photos[e.photo];
  if(!u)return `<div class="thumb empty">…</div>`;
  return `<button style="border:0;background:none;padding:0" data-lb="${esc(e.photo)}" data-cap="${esc((who?who+' · ':'')+label+' · '+new Date(e.t).toLocaleString())}" aria-label="View ${label} selfie"><img class="thumb" loading="lazy" alt="${label} selfie" src="${esc(u)}"></button>`;
}
function recRow(r,adminView){
  const i=r.checkIn,o=r.checkOut,who=adminView?r.name:(S.user&&S.user.name);
  const stale=!o&&S.todayKey&&r.date!==S.todayKey,g=S.cfg.graceMin==null?10:S.cfg.graceMin;
  return `<div class="rec"><div class="thumbs">${thumb(i,'IN',who)}${thumb(o,'OUT',who)}</div>
  <div class="rec-b"><b>${adminView?esc(r.name)+' <span class="muted small">'+esc(r.empCode)+'</span>':fmtD(r.date)}</b>
  <span class="small muted">${adminView?fmtD(r.date)+' · ':''}${fmtT(i.t)} → ${o?fmtT(o.t)+' · '+fmtDur(i.t,o.t):'<b>on duty</b>'}</span>
  <div class="chips">${chipFor(i)}${o?chipFor(o):''}${r.manual?'<span class="chip warn">Closed by admin</span>':''}${r.lateMin>g?'<span class="chip warn">Late '+r.lateMin+'m</span>':''}${r.earlyMin>g?'<span class="chip warn">Left '+r.earlyMin+'m early</span>':''}${i.lat!=null?`<a class="map" href="${mapUrl(i)}" target="_blank" rel="noopener">Map ↗</a>`:''}</div>
  ${r.inNote?'<div class="small" style="margin-top:.3rem">📝 In: '+esc(r.inNote)+'</div>':''}${r.outNote?'<div class="small" style="margin-top:.2rem">📝 Out: '+esc(r.outNote)+'</div>':''}
  ${adminView&&isAdmin()&&!o?`<button class="btn sm" style="margin-top:.4rem" data-closeid="${r.id}">${stale?'Close old shift':'Close shift'}</button>`:''}</div></div>`;
}
function viewMark(){
  if(!S.status)return '<div class="card muted"><span class="spin"></span> Loading…</div>';
  const op=S.status.open,today=S.todayKey,now=new Date(),fo=S.user.role==='field_officer';
  const last=S.status.recent[0],doneToday=!op&&last&&last.date===today&&last.checkOut;
  const stale=op&&op.date!==today;
  const mySite=S.cfg.mySiteId?S.cfg.sites.find(s=>s.id===S.cfg.mySiteId):null;
  let h='';
  if(fo)h+=`<div class="banner small" style="background:var(--panel);color:var(--fg)">🚶 <b>Field officer:</b> you can check in at any work site. Check in when you arrive and check out when you leave.</div>`;
  if(S.cfg.shiftStart&&S.cfg.shiftEnd)h+=`<div class="banner small" style="background:var(--panel);color:var(--fg)">🕒 Your shift: <b>${S.cfg.shiftStart} – ${S.cfg.shiftEnd}</b></div>`;
  if(mySite)h+=`<div class="banner small" style="background:var(--panel);color:var(--fg)">📍 Assigned site: <b>${esc(mySite.name)}</b></div>`;
  h+=`<div class="hero"><div class="date">${now.toLocaleDateString([], {weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
  <div class="clock" id="clk">${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
  <span class="status ${op?'on':doneToday?'done':''}"><span class="dot"></span>${op?'On duty since '+fmtT(op.checkIn.t)+(fo&&op.checkIn.site?' at '+esc(op.checkIn.site):'')+' · <span id="el"></span>':doneToday?'Shift completed · '+fmtDur(last.checkIn.t,last.checkOut.t):'Not checked in'}</span>
  <button class="big ${op?'out':''}" data-act="${op?'out':'in'}">${op?(fo?'Check out of site':'Check out'):(fo?'Check in at site':'Check in')}</button></div>`;
  if(stale)h+=`<div class="banner warn">Your shift from ${fmtD(op.date)} is still open. Check out to close it.</div>`;
  if(S.cfg.blockOutside&&S.cfg.sites.length)h+=`<div class="banner warn small">You must be at your assigned site to mark attendance.</div>`;
  if(fo){
    const td=S.status.recent.filter(r=>r.date===today),ea=S.status.recent.filter(r=>r.date!==today);
    h+=`<div class="card"><h3>Today's visits (${td.length})</h3>`+(td.length?td.map(r=>recRow(r,false)).join(''):'<p class="muted">No visits yet today.</p>')+'</div>';
    if(ea.length)h+=`<div class="card"><h3>Earlier visits</h3>`+ea.map(r=>recRow(r,false)).join('')+'</div>';
    return h;
  }
  h+=`<div class="card"><h3>My recent attendance</h3>`;
  h+=S.status.recent.length?S.status.recent.map(r=>recRow(r,false)).join(''):'<p class="muted">No attendance marked yet.</p>';
  return h+'</div>';
}
function viewToday(){
  if(!S.today)return '<div class="card muted"><span class="spin"></span> Loading team…</div>';
  const list=S.today.people,c={on:0,done:0,none:0},g=S.cfg.graceMin==null?10:S.cfg.graceMin,od=list.filter(p=>p.overdue!=null).length;list.forEach(p=>c[p.status]++);
  let h=`<div class="stats"><div class="stat"><b>${list.length}</b><span>Total</span></div><div class="stat"><b>${c.on}</b><span>On duty</span></div><div class="stat"><b>${c.done}</b><span>Done</span></div><div class="stat"><b>${c.none}</b><span>Absent</span></div></div>
  <div class="card"><div class="row"><h3 class="grow" style="margin:0">Team today</h3><button class="btn sm" data-act="refresh">Refresh</button></div>`;
  if(!list.length)h+='<p class="muted">No employees yet. Add them in the Team tab.</p>';
  if(S.pending&&S.pending.length)h=h.replace('<div class="card">',`<div class="banner warn">📋 The attendance sheet for <b>${esc(monthLabel(S.pending[0]))}</b> is waiting for your review. <button class="btn sm" data-openmonth="${esc(S.pending[0])}">Open</button></div><div class="card">`);
  if(od)h=h.replace('<div class="card">',`<div class="banner bad"><b>${od} not arrived</b> — past their shift start time.</div><div class="card">`);
  h+=list.map(p=>{
    const cls=p.status==='on'?'ok':p.status==='done'?'warn':'bad',txt=p.status==='on'?(p.stale?'Open shift':'On duty'):p.status==='done'?'Completed':'Not marked';
    return `<button class="emp" data-emp="${esc(p.id)}"><div class="avatar">${esc((p.name||'?')[0].toUpperCase())}</div>
    <div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="small muted">${esc(p.empCode)}${p.role==='field_officer'?' · Field officer'+(p.visits?' · '+p.visits+' visit'+(p.visits===1?'':'s'):'')+(p.status==='on'&&p.curSite?' · At '+esc(p.curSite):''):(p.site?' · '+esc(p.site):'')}${p.inAt?' · In '+fmtT(p.inAt):''}${p.outAt?' · Out '+fmtT(p.outAt):''}</div></div>
    <div style="text-align:right"><span class="chip ${p.overdue!=null?'bad':cls}">${p.overdue!=null?'Not arrived · '+p.overdue+'m late':txt}</span>${p.lateMin>g&&p.status!=='none'?'<div><span class="chip warn" style="margin-top:.2rem">Late '+p.lateMin+'m</span></div>':''}${p.inside===false?'<div><span class="chip bad" style="margin-top:.2rem">Off site</span></div>':''}</div></button>`;}).join('');
  return h+'</div>';
}
function viewRecs(){
  const users=S.users||[];
  let h=`<div class="card"><h3>Attendance records</h3>
  <label class="f" for="fu">Employee</label><select id="fu" data-flt="user"><option value="">All employees</option>${users.filter(u=>u.role==='employee').map(u=>`<option value="${esc(u.id)}" ${u.id===S.flt.user?'selected':''}>${esc(u.name)} (${esc(u.empCode)})</option>`).join('')}</select>
  <div class="row"><div class="grow"><label class="f" for="ff">From</label><input type="date" id="ff" data-flt="from" value="${S.flt.from}"></div><div class="grow"><label class="f" for="ft">To</label><input type="date" id="ft" data-flt="to" value="${S.flt.to}"></div></div>
  <div class="row" style="margin-top:.9rem"><button class="btn pri grow" data-act="search">Show records</button>
  <button class="btn grow" data-act="export" ${S.exporting?'disabled':''}>${S.exporting?'Preparing…':'⬇ Export CSV'}</button></div></div>`;
  if(isAdmin())h+=summaryCard();
  h+='<div class="card"><h3>Results</h3>';
  if(S.recsLoading)h+='<p class="muted"><span class="spin"></span> Loading…</p>';
  else if(!S.recs)h+='<p class="muted">Choose filters and tap “Show records”.</p>';
  else if(!S.recs.length)h+='<p class="muted">No records found.</p>';
  else h+=S.recs.map(r=>recRow(r,true)).join('')+(S.recs.length>=100?'<p class="muted small">Showing the latest 100. Narrow the dates or export CSV for everything.</p>':'');
  return h+'</div>';
}
function summaryCard(){
  let h=`<div class="card"><h3>Monthly summary</h3><label class="f" for="sm">Month</label><input type="month" id="sm" data-sum="month" value="${esc(S.sumMonth)}">
  <div class="row" style="margin-top:.9rem"><button class="btn pri grow" data-act="sumshow">Show summary</button>${S.sum?'<button class="btn grow" data-act="sumcsv">⬇ Summary CSV</button>':''}</div>`;
  if(S.sumLoading)h+='<p class="muted"><span class="spin"></span> Loading…</p>';
  else if(S.sum){
    h+=`<p class="muted small">${esc(S.sum.from)} to ${esc(S.sum.to)} (${S.sum.days} days). “No record” counts days with no attendance, so it includes weekly offs and leave.</p><div style="overflow-x:auto"><table class="t"><tr><th>Name</th><th>Present</th><th>No record</th><th>Late</th><th>Early</th><th>Hours</th></tr>`+
    S.sum.people.map(p=>`<tr><td>${esc(p.name)}<div class="small muted">${esc(p.empCode)}${p.role==='field_officer'?' · Field':''}</div></td><td>${p.daysPresent}${p.role==='field_officer'&&p.visits?' ('+p.visits+' visits)':''}</td><td>${Math.max(0,S.sum.days-p.daysPresent)}</td><td>${p.late}</td><td>${p.early}</td><td>${fmtHM(p.minutes)}${p.open?' <span class="chip warn">'+p.open+' open</span>':''}</td></tr>`).join('')+'</table></div>';
  }
  return h+'</div>';
}
function siteOpts(sel){return '<option value="">Any site</option>'+S.cfg.sites.map(s=>`<option value="${s.id}" ${String(s.id)===String(sel==null?'':sel)?'selected':''}>${esc(s.name)}</option>`).join('');}
function viewTeam(){
  const users=S.users;
  let h=`<div class="card"><h3>Add employee</h3>
  <label class="f" for="nc">Employee ID</label><input id="nc" data-nu="empCode" value="${esc(S.nu.empCode)}" autocapitalize="characters" placeholder="e.g. PF1024">
  <label class="f" for="nn">Full name</label><input id="nn" data-nu="name" value="${esc(S.nu.name)}">
  <label class="f" for="nd">Designation (optional)</label><input id="nd" data-nu="designation" value="${esc(S.nu.designation)}" placeholder="Security Guard">
  <div class="row"><div class="grow"><label class="f" for="ns">Assigned site</label><select id="ns" data-nu="siteId" ${S.nu.role==='field_officer'?'disabled':''}>${siteOpts(S.nu.siteId)}</select></div>
  <div class="grow"><label class="f" for="nr">Role</label><select id="nr" data-nu="role"><option value="employee" ${S.nu.role==='employee'?'selected':''}>Employee</option><option value="field_officer" ${S.nu.role==='field_officer'?'selected':''}>Field officer (marks attendance)</option><option value="admin" ${S.nu.role==='admin'?'selected':''}>Admin</option></select></div></div>
  <button class="btn pri" style="width:100%;margin-top:.9rem" data-act="adduser">Create account</button><p class="formerr" id="nuErr"></p></div>
  <div class="card"><h3>Add many at once</h3><p class="muted small">One employee per line: <b>ID, Name, Designation</b>. Do about 20 at a time (the free service limits how fast accounts can be created).</p>
  <textarea data-bulk="lines" placeholder="PF1001, Ravi Kumar, Security Guard&#10;PF1002, Suresh N, Supervisor">${esc(S.bulk.lines)}</textarea>
  <label class="f" for="bs">Assign all to site</label><select id="bs" data-bulk="siteId">${siteOpts(S.bulk.siteId)}</select>
  <button class="btn" style="width:100%;margin-top:.9rem" data-act="bulkadd">Create accounts</button></div>
  <div class="card"><h3>Set shift for many</h3><p class="muted small">Sets the same shift for all employees at a site (field officers are not included). Night shifts work too, for example 20:00 to 08:00.</p>
  <label class="f" for="bsite">Employees at</label><select id="bsite" data-bsh="site"><option value="">All sites (all employees)</option>${S.cfg.sites.map(s=>`<option value="${s.id}" ${String(s.id)===String(S.bsh.site)?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
  <div class="row"><div class="grow"><label class="f" for="bs1">Shift starts</label><input type="time" id="bs1" data-bsh="start" value="${esc(S.bsh.start)}"></div><div class="grow"><label class="f" for="bs2">Shift ends</label><input type="time" id="bs2" data-bsh="end" value="${esc(S.bsh.end)}"></div></div>
  <button class="btn" style="width:100%;margin-top:.9rem" data-act="applyshift">Apply shift</button></div>
  <div class="card"><h3>Employees${users?' ('+users.length+')':''}</h3>`;
  if(!users)h+='<p class="muted"><span class="spin"></span> Loading…</p>';
  else h+=users.map(u=>`<div class="ur"><div class="avatar">${esc((u.name||'?')[0].toUpperCase())}</div>
    <div class="grow" style="min-width:140px"><b>${esc(u.name)}</b> ${u.role==='admin'?'<span class="chip warn">Admin</span>':''}${u.role==='field_officer'?'<span class="chip">Field officer</span>':''}${u.active?'':' <span class="chip bad">Inactive</span>'}
    <div class="small muted">${esc(u.empCode)}${u.designation?' · '+esc(u.designation):''}${u.shiftStart?' · 🕒 '+u.shiftStart+'–'+u.shiftEnd:''}</div></div>
    ${u.role==='employee'?`<select data-usite="${esc(u.id)}" aria-label="Site for ${esc(u.name)}">${siteOpts(u.siteId)}</select>`:''}
    ${u.role!=='admin'?`<select data-urole="${esc(u.id)}" aria-label="Role for ${esc(u.name)}"><option value="employee" ${u.role==='employee'?'selected':''}>Employee</option><option value="field_officer" ${u.role==='field_officer'?'selected':''}>Field officer</option></select>`:''}
    <button class="btn sm" data-reset="${esc(u.id)}">Reset password</button>
    ${u.role==='employee'?`<button class="btn sm" data-shift="${esc(u.id)}">Shift</button>`:''}
    ${u.id!==S.user.id?`<button class="btn sm ${u.active?'bad':''}" data-toggle="${esc(u.id)}" data-active="${u.active?1:0}">${u.active?'Deactivate':'Activate'}</button>`:''}</div>`).join('');
  return h+'</div>';
}
function viewSettings(){
  const f=S.siteForm,sites=S.cfg.sites;
  let h=`<div class="card"><h3>Work sites</h3><p class="muted small">Attendance is compared with each employee's assigned site (or the nearest site if none is assigned).</p>`;
  h+=sites.length?sites.map(s=>`<div class="ur"><div class="grow"><b>${esc(s.name)}</b><div class="small muted">${(+s.lat).toFixed(5)}, ${(+s.lng).toFixed(5)} · ${s.radius} m</div></div><button class="btn sm bad" data-delsite="${s.id}">Remove</button></div>`).join(''):'<p class="muted">No sites yet.</p>';
  h+=`<label class="row" style="margin-top:1rem;gap:.7rem"><input type="checkbox" id="blk" ${S.cfg.blockOutside?'checked':''}><span>Block check-in outside the site radius</span></label></div>
  <div class="card"><h3>Add site</h3>
  <label class="f" for="sn">Site name</label><input id="sn" data-sf="name" value="${esc(f.name)}" placeholder="e.g. Yelahanka Warehouse">
  <div class="row"><div class="grow"><label class="f" for="sa">Latitude</label><input id="sa" data-sf="lat" inputmode="decimal" value="${esc(f.lat)}"></div><div class="grow"><label class="f" for="so">Longitude</label><input id="so" data-sf="lng" inputmode="decimal" value="${esc(f.lng)}"></div></div>
  <label class="f" for="sr">Radius (metres)</label><input id="sr" data-sf="radius" inputmode="numeric" value="${esc(f.radius)}">
  <div class="row" style="margin-top:.9rem"><button class="btn grow" data-act="usehere">📍 Use my location</button><button class="btn pri grow" data-act="addsite">Add site</button></div><p class="formerr" id="siteErr"></p></div>
  <div class="card"><h3>Late rule</h3><p class="muted small">A guard is marked late only if they check in more than this many minutes after shift start. The same grace applies to leaving early.</p>
  <label class="f" for="gr">Grace period (minutes)</label><input id="gr" data-grace="1" inputmode="numeric" value="${esc(S.graceEdit==null?(S.cfg.graceMin==null?10:S.cfg.graceMin):S.graceEdit)}">
  <button class="btn" style="width:100%;margin-top:.9rem" data-act="savegrace">Save</button></div>
  <div class="card"><h3>Free up photo space</h3><p class="muted small">The free plan has about 1 GB for selfies. This deletes old selfie photos but keeps the attendance records (times, places, hours).</p>
  <label class="f" for="pd">Delete photos older than (days)</label><input id="pd" data-purge="1" inputmode="numeric" value="${esc(S.purgeDays)}">
  <button class="btn bad" style="width:100%;margin-top:.9rem" data-act="purge">Delete old photos</button></div>`;
  return h+viewAccount();
}
function viewAccount(){
  return `<div class="card"><h3>My account</h3><p class="muted">${esc(S.user.name)} · ${esc(S.user.empCode)}</p>
  <form id="pwForm2"><label class="f" for="a0">Current password</label><input id="a0" type="password" autocomplete="current-password">
  <label class="f" for="a1">New password (6+ characters)</label><input id="a1" type="password" autocomplete="new-password">
  <p class="formerr" id="pw2Err" role="alert"></p><button class="btn pri" type="submit" style="width:100%">Change password</button></form>
  <button class="btn" style="width:100%;margin-top:1rem" data-act="logout">Sign out</button></div>`;
}

/* ---------- live clock ---------- */
function tick(){
  const c=$('#clk');if(c)c.textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const e=$('#el');if(e&&S.status&&S.status.open){const m=Math.floor((Date.now()-S.status.open.checkIn.t)/60000);e.textContent=Math.floor(m/60)+'h '+pad(m%60)+'m';}
}
setInterval(tick,1000);

/* ---------- modal ---------- */
function openModal(html){$('#modalIn').innerHTML=html;$('#modal').hidden=false;}
function closeModal(){$('#modal').hidden=true;$('#modalIn').innerHTML='';}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal'||e.target.closest('[data-mclose]'))closeModal();});

/* ---------- capture sheet ---------- */
const SH={mode:null,stream:null,pos:null,raw:null,busy:false,locTry:0};
function evalSite(pos){
  let sites=S.cfg.sites||[];
  if(S.cfg.mySiteId)sites=sites.filter(s=>s.id===S.cfg.mySiteId);
  if(!pos||!sites.length)return {site:null,dist:null,inside:null};
  let best=null;sites.forEach(s=>{const d=hav(pos.lat,pos.lng,s.lat,s.lng);if(!best||d<best.d)best={s,d};});
  return {site:best.s.name,dist:Math.round(best.d),inside:best.d<=best.s.radius};
}
function openSheet(mode){
  Object.assign(SH,{mode,pos:null,raw:null,busy:false});
  $('#shTitle').textContent=mode==='in'?'Check in':'Check out';
  $('#sheet').hidden=false;document.body.style.overflow='hidden';
  setReview(false);$('#shErr').textContent='';
  $('#noteIn').value='';$('#noteIn').placeholder=mode==='out'?(S.user.role==='field_officer'?'Visit note (optional), e.g. what you checked':'Note (optional)'):'Remark (optional)';
  startLoc();startCam();
}
function closeSheet(){stopCam();$('#sheet').hidden=true;document.body.style.overflow='';}
function setReview(on){
  $('#shot').hidden=!on;$('#vid').hidden=on;$('#oval').hidden=on||!$('#camMsg').hidden;
  $('#btnShutter').hidden=on||!$('#camMsg').hidden;$('#reviewBtns').hidden=!on;$('#btnFile').hidden=on;
  if(!on)SH.raw=null;
  refreshSubmit();
}
function stopCam(){if(SH.stream){SH.stream.getTracks().forEach(t=>t.stop());SH.stream=null;}$('#vid').srcObject=null;}
async function startCam(){
  $('#camMsg').hidden=true;$('#btnShutter').hidden=false;$('#oval').hidden=false;stopCam();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){camFail('Camera is not available on this device or page.');return;}
  try{
    const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:1280}},audio:false});
    if($('#sheet').hidden){st.getTracks().forEach(t=>t.stop());return;}
    SH.stream=st;const v=$('#vid');v.srcObject=st;await v.play().catch(()=>{});
  }catch(e){camFail(e&&e.name==='NotAllowedError'?'Camera permission was denied.':'Could not open the camera.');}
}
function camFail(t){const m=$('#camMsg');m.textContent=t+' Use the phone camera button below.';m.hidden=false;$('#oval').hidden=true;$('#btnShutter').hidden=true;}
function startLoc(){
  const chip=$('#locChip');chip.className='chip';chip.innerHTML='<span class="spin"></span> Locating…';
  $('#siteChip').hidden=true;$('#btnLocRetry').hidden=true;SH.pos=null;refreshSubmit();
  if(!navigator.geolocation){locFail('Location is not supported');return;}
  const my=++SH.locTry;
  navigator.geolocation.getCurrentPosition(p=>{
    if(my!==SH.locTry)return;
    SH.pos={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy)};
    const ev=evalSite(SH.pos);SH.pos.ev=ev;
    chip.className='chip '+(SH.pos.acc>100?'warn':'ok');chip.textContent='📍 Location locked (±'+SH.pos.acc+' m)';
    const sc=$('#siteChip');
    if(ev.inside===null)sc.hidden=true;
    else{sc.hidden=false;sc.className='chip '+(ev.inside?'ok':'bad');sc.textContent=ev.inside?'On site · '+ev.site:'Off site · '+fmtDist(ev.dist)+' from '+ev.site;}
    refreshSubmit();
  },e=>{if(my===SH.locTry)locFail(e&&e.code===1?'Location permission denied':e&&e.code===3?'Location timed out':'Location unavailable');},
  {enableHighAccuracy:true,timeout:20000,maximumAge:0});
}
function locFail(t){const c=$('#locChip');c.className='chip bad';c.textContent='⚠ '+t;$('#btnLocRetry').hidden=false;refreshSubmit();}
function refreshSubmit(){
  const b=$('#btnSubmit');if(!b)return;
  let ok=!!SH.raw&&!!SH.pos&&!SH.busy,err='';
  if(SH.raw&&!SH.pos&&!SH.busy)err='Location is required to mark attendance.';
  if(SH.pos&&SH.pos.ev.inside===false&&S.cfg.blockOutside){ok=false;err='You are outside your site radius. Move to your site to continue.';}
  b.disabled=!ok;if(!SH.busy)$('#shErr').textContent=err;
}
function toCanvas(src,w,h){const max=360,s=Math.min(1,max/w),c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c;}
function capture(){
  const v=$('#vid');if(!v.videoWidth)return;
  SH.raw=toCanvas(v,v.videoWidth,v.videoHeight);
  $('#shot').src=SH.raw.toDataURL('image/jpeg',.8);$('#shot').style.transform='scaleX(-1)';
  stopCam();setReview(true);
}
async function fromFile(f){
  if(!f)return;
  try{
    let bmp;
    try{bmp=await createImageBitmap(f,{imageOrientation:'from-image'});}
    catch(_){bmp=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=URL.createObjectURL(f);});}
    SH.raw=toCanvas(bmp,bmp.width||bmp.naturalWidth,bmp.height||bmp.naturalHeight);
    $('#shot').src=SH.raw.toDataURL('image/jpeg',.8);$('#shot').style.transform='none';
    stopCam();$('#camMsg').hidden=true;setReview(true);
  }catch(e){$('#shErr').textContent='Could not read that photo. Try again.';}
}
function stampBlob(c,lines){
  const o=document.createElement('canvas');o.width=c.width;o.height=c.height;const x=o.getContext('2d');x.drawImage(c,0,0);
  const fs=Math.max(10,Math.round(c.width/30)),bh=lines.length*(fs+4)+8;
  x.fillStyle='rgba(0,0,0,.62)';x.fillRect(0,o.height-bh,o.width,bh);
  x.fillStyle='#fff';x.font='600 '+fs+'px sans-serif';x.textBaseline='top';
  lines.forEach((l,i)=>x.fillText(l,6,o.height-bh+5+i*(fs+4),o.width-12));
  return new Promise((ok,no)=>o.toBlob(b=>b?ok(b):no(new Error('Could not prepare photo')),'image/jpeg',0.62));
}
async function submitMark(){
  if(SH.busy||!SH.raw||!SH.pos)return;
  SH.busy=true;const btn=$('#btnSubmit');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Saving…';$('#shErr').textContent='';
  const now=new Date(),u=S.user;let path=null;
  try{
    const blob=await stampBlob(SH.raw,[u.name+' · '+u.empCode,now.toLocaleString([], {dateStyle:'medium',timeStyle:'medium'}),SH.pos.lat.toFixed(5)+', '+SH.pos.lng.toFixed(5)+' (±'+SH.pos.acc+'m)'].concat(SH.pos.ev&&SH.pos.ev.inside?['At: '+SH.pos.ev.site]:[]));
    path=u.id+'/'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.jpg';
    const up=await sb.storage.from('selfies').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(up.error)throw new Error(friendly(up.error));
    const r=await rpc('pf_mark',{p_kind:SH.mode,p_lat:SH.pos.lat,p_lng:SH.pos.lng,p_acc:SH.pos.acc,p_photo:path,p_device:(navigator.userAgent||'').slice(0,120),p_note:($('#noteIn').value||'').trim().slice(0,300)||null});
    path=null;
    const gm=S.cfg.graceMin==null?10:S.cfg.graceMin;
    closeSheet();toast((SH.mode==='in'?'Checked in at ':'Checked out at ')+fmtT(r.time)+(SH.mode==='in'&&r.lateMin>gm?' · '+r.lateMin+' min late':'')+(SH.mode==='out'&&r.earlyMin>gm?' · '+r.earlyMin+' min early':''));
    await Promise.all([loadConfig(),loadStatus()]);draw();
  }catch(e){
    if(path){try{await sb.storage.from('selfies').remove([path]);}catch(_){}}
    $('#shErr').textContent=friendly(e);
    if(/already checked in|no open shift/i.test(friendly(e))){closeSheet();await loadStatus();draw();}
  }
  SH.busy=false;btn.textContent='Confirm';refreshSubmit();
}

/* ---------- data loading ---------- */
async function loadConfig(){try{const c=await rpc('pf_config');S.cfg={sites:c.sites||[],blockOutside:!!c.blockOutside,mySiteId:c.mySiteId,graceMin:c.graceMin==null?10:c.graceMin,shiftStart:c.shiftStart,shiftEnd:c.shiftEnd};S.todayKey=c.today;}catch(e){toast(friendly(e));}}
async function loadStatus(){
  try{
    const rows=await qry(sb.from('attendance').select('*').eq('user_id',S.user.id).order('in_at',{ascending:false}).limit(30));
    const recent=rows.map(mapRow);
    let open=recent.find(r=>!r.checkOut)||null;
    if(!open){const o=await qry(sb.from('attendance').select('*').eq('user_id',S.user.id).is('out_at',null).limit(1));if(o.length)open=mapRow(o[0]);}
    await signPhotos(recent);
    S.status={open,recent};
  }catch(e){toast(friendly(e));}
}
async function loadToday(){
  try{S.today=await rpc('pf_admin_today');S.todayKey=S.today.today;}catch(e){toast(friendly(e));}
  if(isAdmin()){try{S.pending=await rpc('pf_sheet_pending');}catch(e){S.pending=null;}}
}
async function loadUsers(){try{S.users=(await qry(sb.from('profiles').select('*').order('name'))).map(mapProfile);}catch(e){toast(friendly(e));}}
async function loadRecs(){
  S.recsLoading=true;S.recs=null;draw();
  try{
    let q=sb.from('attendance').select('*, profiles(name, emp_code)').gte('work_date',S.flt.from).lte('work_date',S.flt.to).order('in_at',{ascending:false}).limit(100);
    if(S.flt.user)q=q.eq('user_id',S.flt.user);
    const rows=(await qry(q)).map(mapRow);
    await signPhotos(rows);
    S.recs=rows;
  }catch(e){S.recs=[];toast(friendly(e));}
  S.recsLoading=false;draw();
}
async function enterTab(t){
  S.tab=t;draw();window.scrollTo(0,0);
  if(t==='mark'){await Promise.all([loadStatus(),loadConfig()]);}
  if(t==='today')await loadToday();
  if(t==='sheet')await (S.sheet.mode==='month'?loadSheetMonth():loadSheetDay());
  if(t==='recs'){if(!S.users)await loadUsers();if(!S.recs)loadRecs();}
  if(t==='team'){await Promise.all([loadUsers(),loadConfig()]);}
  draw();
}
async function afterLogin(){
  S.tab=isAdmin()?'today':S.user.role==='field_officer'?'sheet':'mark';
  S.status=null;S.today=null;S.users=null;S.recs=null;S.pending=null;
  S.sheet.day=null;S.sheet.grid=null;S.sheet.date=null;S.sheet.fail='';S.sheet.mode=isAdmin()?'month':'day';draw();
  if(S.user.mustChange)return;
  await loadConfig();
  if(S.user.role==='employee'){await loadStatus();draw();}
  else await enterTab(S.tab);
}
async function startSession(authUser){
  const r=await sb.from('profiles').select('*').eq('id',authUser.id).maybeSingle();
  if(r.error||!r.data){await sb.auth.signOut();throw new Error('This account is not set up. Please contact your admin.');}
  if(!r.data.active){await sb.auth.signOut();throw new Error('Your account is not active. Please contact your admin.');}
  S.user=mapProfile(r.data);
  await afterLogin();
}

/* ---------- admin actions ---------- */
async function createAccount(f,invite){
  const code=String(f.empCode||'').trim();
  if(!CODE_RE.test(code))throw new Error('Employee ID must be 2-30 letters or numbers (dots, dashes and underscores allowed).');
  if(!String(f.name||'').trim())throw new Error('Enter the employee name.');
  const tmp=genPw();
  const r=await tmpClient().auth.signUp({email:emailFor(code),password:tmp,options:{data:{invite:invite,emp_code:code.toUpperCase(),name:String(f.name).trim(),designation:String(f.designation||'').trim(),role:(f.role==='admin'||f.role==='field_officer')?f.role:'employee',site_id:(f.role==='field_officer'||!f.siteId)?'':String(f.siteId)}}});
  if(r.error){
    const m=r.error.message||'';
    if(/already|registered/i.test(m))throw new Error('That Employee ID already exists.');
    if(/Database error/i.test(m))throw new Error('Could not create the account. The ID may already exist or be invalid.');
    const e=new Error(friendly(r.error));e.rate=/rate limit|too many/i.test(m)||r.error.status===429;throw e;
  }
  return tmp;
}
async function loadSummary(){
  const [y,m]=S.sumMonth.split('-').map(Number);
  if(!y||!m){toast('Choose a month');return;}
  const from=S.sumMonth+'-01',to=S.sumMonth+'-'+pad(new Date(y,m,0).getDate());
  S.sumLoading=true;S.sum=null;draw();
  try{S.sum=await rpc('pf_admin_monthly',{p_from:from,p_to:to});}catch(e){toast(friendly(e));}
  S.sumLoading=false;draw();
}
function sumCsv(){
  if(!S.sum)return;
  const out=[['Employee ID','Name','Role','Site','Shift','Days present','No-record days','Visits','Late (over grace)','Early exit (over grace)','Total hours','Open shifts','Closed by admin']];
  S.sum.people.forEach(p=>out.push([p.empCode,p.name,p.role==='field_officer'?'Field officer':'Employee',p.site||'',p.shiftStart?p.shiftStart+'-'+p.shiftEnd:'',p.daysPresent,Math.max(0,S.sum.days-p.daysPresent),p.visits,p.late,p.early,(p.minutes/60).toFixed(2),p.open,p.manual]));
  const csv='\ufeff'+out.map(r=>r.map(v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\n');
  downloadBlob(new Blob([csv],{type:'text/csv'}),'monthly_summary_'+S.sum.from.slice(0,7)+'.csv');
}
async function exportCsv(){
  if(S.exporting)return;S.exporting=true;draw();
  try{
    const rows=[];let from=0;
    for(;;){
      let q=sb.from('attendance').select('*, profiles(name, emp_code, designation, role)').gte('work_date',S.flt.from).lte('work_date',S.flt.to).order('work_date').order('in_at').range(from,from+999);
      if(S.flt.user)q=q.eq('user_id',S.flt.user);
      const part=await qry(q);rows.push(...part);if(part.length<1000)break;from+=1000;
    }
    const fm=t=>{if(!t)return '';const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
    const yn=v=>v==null?'':v?'Yes':'No';
    const out=[['Date','Employee ID','Employee','Designation','Role','Check-in','Check-out','Hours','In site','In on-site','In distance (m)','In lat','In lng','In accuracy (m)','Out site','Out on-site','Out lat','Out lng','Closed by admin','Late (min)','Early exit (min)','In note','Out note']];
    rows.forEach(r=>{const p=r.profiles||{};out.push([r.work_date,p.emp_code,p.name,p.designation,p.role==='field_officer'?'Field officer':p.role==='admin'?'Admin':'Employee',fm(r.in_at),fm(r.out_at),r.out_at?((Date.parse(r.out_at)-Date.parse(r.in_at))/3600000).toFixed(2):'',r.in_site,yn(r.in_inside),r.in_dist,r.in_lat,r.in_lng,r.in_acc,r.out_site,yn(r.out_inside),r.out_lat,r.out_lng,r.out_manual?'Yes':'',r.late_min,r.early_min,r.in_note,r.out_note]);});
    const csv='\ufeff'+out.map(r=>r.map(v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}),'attendance_'+S.flt.from+'_to_'+S.flt.to+'.csv');
    toast(rows.length+' records exported');
  }catch(e){toast(friendly(e));}
  S.exporting=false;draw();
}
function downloadBlob(b,name){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
async function purgePhotos(){
  const days=parseInt(S.purgeDays,10);
  if(!(days>=7)){toast('Enter 7 days or more');return;}
  const paths=await rpc('pf_admin_old_photos',{p_days:days});
  if(!paths.length){toast('No photos older than '+days+' days');return;}
  if(!confirm('Delete '+paths.length+' selfie photos older than '+days+' days? Attendance records stay, only the photos are removed. This cannot be undone.'))return;
  const done=[];
  for(let i=0;i<paths.length;i+=100){
    const b=paths.slice(i,i+100),r=await sb.storage.from('selfies').remove(b);
    if(r.error)throw new Error(friendly(r.error));
    done.push(...b);
  }
  for(let i=0;i<done.length;i+=200)await rpc('pf_admin_clear_photos',{p_paths:done.slice(i,i+200)});
  S.photos={};toast(done.length+' photos deleted');
}

/* ---------- attendance sheet (field officer marks, admin approves) ---------- */
const ST=[['present','Present','P'],['absent','Absent','A'],['half_day','Half day','HD'],['leave','Leave','L'],['weekly_off','Weekly off','WO'],['overtime','Overtime','OT']];
const STNAME={},STCODE={};ST.forEach(x=>{STNAME[x[0]]=x[1];STCODE[x[0]]=x[2];});
const STCLS={present:'ok',absent:'bad',half_day:'warn',leave:'',weekly_off:'',overtime:'ok'};
function dateAdd(k,n){const d=new Date(k+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function eachDate(a,b,fn){for(let k=a;k<=b;k=dateAdd(k,1))fn(k);}
function monthLabel(m){const p=m.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString([], {month:'long',year:'numeric'});}
function guardCounts(p,g){
  const c={present:0,absent:0,half_day:0,leave:0,weekly_off:0,overtime:0,missing:0};
  Object.keys(p.marks||{}).forEach(k=>{const s=p.marks[k];if(c[s]!=null)c[s]++;});
  const from=p.created>g.from?p.created:g.from,to=g.today<g.to?g.today:g.to;
  if(from<=to)eachDate(from,to,k=>{if(!(p.marks&&p.marks[k]))c.missing++;});
  c.worked=c.present+c.overtime+0.5*c.half_day;
  return c;
}
function sheetSummary(g){const rows=g.people.map(p=>({p:p,c:guardCounts(p,g)}));return {rows:rows,missing:rows.reduce((a,r)=>a+r.c.missing,0)};}

function viewSheet(){
  const sh=S.sheet;
  const h=`<div class="row" style="margin-bottom:.8rem;flex-wrap:nowrap"><button class="btn grow ${sh.mode==='day'?'pri':''}" data-smode="day">Daily marking</button><button class="btn grow ${sh.mode==='month'?'pri':''}" data-smode="month">Month sheet</button></div>`;
  if(sh.fail)return h+`<div class="banner bad">${esc(sh.fail)} <button class="btn sm" data-act="retrysheet">Try again</button></div>`;
  return h+(sh.mode==='day'?viewSheetDay():viewSheetMonth());
}
function viewSheetDay(){
  const sh=S.sheet,d=sh.day,adm=isAdmin();
  let h=`<div class="card"><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-dshift="-1" aria-label="Previous day">‹</button><input type="date" class="grow" data-sdate="1" value="${esc(sh.date||'')}" max="${esc(S.todayKey||'')}" aria-label="Date"><button class="btn sm" data-dshift="1" aria-label="Next day">›</button><button class="btn sm" data-dshift="today">Today</button></div></div>`;
  if(!d)return h+'<div class="card muted"><span class="spin"></span> Loading…</div>';
  const locked=d.locked&&!adm,g=S.cfg.graceMin==null?10:S.cfg.graceMin;
  const all=d.people,marked=all.filter(p=>p.status).length;
  let list=all;
  if(sh.site)list=list.filter(p=>sh.site==='__none'?!p.site:p.site===sh.site);
  if(sh.unmarked)list=list.filter(p=>!p.status);
  h+=`<div class="card"><div class="row"><b class="grow">Marked ${marked} of ${all.length}</b><button class="btn sm pri" data-act="fillci" ${locked?'disabled':''}>Fill from check-ins</button></div>
  <p class="muted small" style="margin:.4rem 0 0">“Fill from check-ins” marks Present for everyone who checked in and has no mark yet. You can change any mark.</p>
  <div class="row" style="margin-top:.7rem"><select class="grow" data-ssite="1" aria-label="Site filter" style="min-height:44px"><option value="">All sites</option>${S.cfg.sites.map(s=>`<option value="${esc(s.name)}" ${sh.site===s.name?'selected':''}>${esc(s.name)}</option>`).join('')}<option value="__none" ${sh.site==='__none'?'selected':''}>No site assigned</option></select>
  <label class="row" style="gap:.4rem"><input type="checkbox" data-sunm="1" ${sh.unmarked?'checked':''}><span class="small">Not marked only</span></label></div></div>`;
  if(locked)h+=`<div class="banner warn">This month's sheet is ${d.monthStatus==='approved'?'approved':'submitted'} and locked. Ask admin to return it if you need to change something.</div>`;
  if(sh.loading)h+='<p class="muted"><span class="spin"></span> Refreshing…</p>';
  if(!all.length)return h+'<div class="card muted">No employees yet.</div>';
  if(!list.length)return h+'<div class="card muted">Nobody matches this filter.</div>';
  h+=list.map(p=>{
    const ev=p.inAt?`✓ In ${fmtT(p.inAt)}${p.lateMin>g?' · <b>Late '+p.lateMin+'m</b>':''}${p.outAt?' · Out '+fmtT(p.outAt):(p.open?' · <b>on duty</b>':'')}${p.inside===false?' · <span class="chip bad">Off site</span>':''}`:'<span class="muted">No check-in</span>';
    return `<div class="card" style="padding:.8rem"><div class="row" style="flex-wrap:nowrap;gap:.6rem"><div class="avatar">${esc((p.name||'?')[0].toUpperCase())}</div>
    <div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="small muted">${esc(p.empCode)}${p.site?' · '+esc(p.site):''}${p.shiftStart?' · 🕒 '+p.shiftStart+'–'+p.shiftEnd:''}</div></div>
    <div class="thumbs">${p.inPhoto?thumb({photo:p.inPhoto,t:p.inAt},'IN',p.name):''}${p.outPhoto?thumb({photo:p.outPhoto,t:p.outAt},'OUT',p.name):''}</div></div>
    <div class="small" style="margin-top:.45rem">${ev}</div>
    <div class="stgrid">${ST.map(x=>`<button class="stb ${x[0]}${p.status===x[0]?' on':''}" data-st="${esc(p.id)}|${x[0]}" aria-pressed="${p.status===x[0]}" ${locked?'disabled':''}>${x[1]}</button>`).join('')}</div></div>`;
  }).join('');
  return h;
}
function viewSheetMonth(){
  const sh=S.sheet,g=sh.grid,adm=isAdmin(),isFO=S.user.role==='field_officer';
  let h=`<div class="card"><label class="f" for="sm2" style="margin-top:0">Month</label><input type="month" id="sm2" data-smonth="1" value="${esc(sh.month)}" max="${esc((S.todayKey||dkeyLocal()).slice(0,7))}"></div>`;
  if(!g)return h+'<div class="card muted"><span class="spin"></span> Loading…</div>';
  const sum=sheetSummary(g),st=g.sheet.status,sd=g.sheet;
  const txt={open:'Open',submitted:'Submitted',approved:'Approved',returned:'Returned'}[st],cls={open:'',submitted:'warn',approved:'ok',returned:'bad'}[st];
  const when=t=>t?new Date(t).toLocaleString():'';
  let b=`<div class="card"><div class="row"><h3 class="grow" style="margin:0">${esc(monthLabel(g.month))}</h3><span class="chip ${cls}">${txt}</span></div>`;
  if(st==='open')b+='<p class="small muted">Mark every day in “Daily marking”, then submit this sheet to admin.</p>';
  if(st==='submitted')b+=`<p class="small muted">Submitted by ${esc(sd.submittedBy||'field officer')} on ${esc(when(sd.submittedAt))}.${sd.officerNote?' Note: “'+esc(sd.officerNote)+'”':''}</p>`;
  if(st==='approved')b+=`<p class="small muted">Approved${sd.reviewedBy?' by '+esc(sd.reviewedBy):''} on ${esc(when(sd.reviewedAt))}.${sd.adminNote?' Note: “'+esc(sd.adminNote)+'”':''}</p>`;
  if(st==='returned')b+=`<p class="small muted">Returned by admin${sd.adminNote?': “'+esc(sd.adminNote)+'”':'.'} Make the corrections, then submit again.</p>`;
  if(sum.missing>0&&(st==='open'||st==='returned'))b+=`<p class="small" style="color:var(--bad)">${sum.missing} day${sum.missing===1?'':'s'} not marked yet. Every day must be marked before submitting.</p>`;
  b+='<div class="row" style="margin-top:.6rem">';
  if(isFO&&(st==='open'||st==='returned'))b+=`<button class="btn pri grow" data-act="submitsheet" ${sum.missing>0?'disabled':''}>Submit to admin</button>`;
  if(adm&&st==='submitted')b+='<button class="btn pri grow" data-act="approvesheet">Approve</button><button class="btn grow bad" data-act="returnsheet">Return</button>';
  if(adm&&st==='approved')b+='<button class="btn grow bad" data-act="returnsheet">Reopen for corrections</button>';
  b+='<button class="btn grow" data-act="exportsheet">⬇ Download CSV</button></div></div>';
  h+=b;
  h+=`<div class="card"><h3>Summary</h3><p class="muted small">P present · OT overtime · HD half day · L leave · WO weekly off · A absent · Worked = P + OT + ½ HD. Tap a name to see the days.</p><div style="overflow-x:auto"><table class="t"><tr><th>Name</th><th>P</th><th>OT</th><th>HD</th><th>L</th><th>WO</th><th>A</th><th>Not marked</th><th>Worked</th></tr>`+
    (sum.rows.length?sum.rows.map(r=>`<tr data-gdrill="${esc(r.p.id)}" style="cursor:pointer"><td>${esc(r.p.name)}<div class="small muted">${esc(r.p.empCode)}</div></td><td>${r.c.present}</td><td>${r.c.overtime}</td><td>${r.c.half_day}</td><td>${r.c.leave}</td><td>${r.c.weekly_off}</td><td>${r.c.absent}</td><td>${r.c.missing?'<b style="color:var(--bad)">'+r.c.missing+'</b>':'0'}</td><td>${r.c.worked}</td></tr>`).join(''):'<tr><td colspan="9" class="muted">No employees yet.</td></tr>')+'</table></div></div>';
  return h;
}
function openDrill(uid){
  const g=S.sheet.grid,p=g&&g.people.find(x=>x.id===uid);if(!p)return;
  const to=g.today<g.to?g.today:g.to;let rows='';
  eachDate(g.from,to,k=>{const s=p.marks[k],ci=p.ci.indexOf(k)>=0;
    rows+=`<button class="emp" data-gojump="${k}"><div class="grow"><b>${fmtD(k)}</b></div>${ci?'<span class="chip ok" style="margin-right:.4rem">Checked in</span>':''}<span class="chip ${s?STCLS[s]:'bad'}">${s?STNAME[s]:'Not marked'}</span></button>`;});
  openModal(`<h3>${esc(p.name)}</h3><p class="muted small">${esc(p.empCode)} · tap a day to open it for editing</p>${rows||'<p class="muted">No days yet.</p>'}<button class="btn pri" style="width:100%;margin-top:.8rem" data-mclose>Close</button>`);
}
async function loadSheetDay(){
  const sh=S.sheet;if(!sh.date)sh.date=S.todayKey||dkeyLocal();
  sh.loading=true;sh.fail='';draw();
  try{
    const d=await rpc('pf_sheet_day',{p_date:sh.date});
    await signPhotos(d.people.map(p=>({checkIn:p.inPhoto?{photo:p.inPhoto}:null,checkOut:p.outPhoto?{photo:p.outPhoto}:null})));
    sh.day=d;S.todayKey=d.today;
  }catch(e){sh.fail='Could not load: '+friendly(e);}
  sh.loading=false;draw();
}
async function loadSheetMonth(){
  const sh=S.sheet;sh.grid=null;sh.fail='';draw();
  try{sh.grid=await rpc('pf_sheet_month',{p_month:sh.month});S.todayKey=sh.grid.today;}catch(e){sh.fail='Could not load: '+friendly(e);}
  draw();
}
async function setMark(uid,st){
  const d=S.sheet.day,p=d&&d.people.find(x=>x.id===uid);if(!p)return;
  const prev=p.status||null,next=prev===st?null:st;
  p.status=next;S.sheet.grid=null;draw();
  try{await rpc('pf_set_marks',{p_date:S.sheet.date,p_items:[{u:uid,s:next}]});}
  catch(e){p.status=prev;draw();toast(friendly(e));}
}
async function fillFromCheckins(){
  const d=S.sheet.day;if(!d)return;
  const items=d.people.filter(p=>!p.status&&p.inAt).map(p=>({u:p.id,s:'present'}));
  if(!items.length){toast('Nothing to fill: everyone who checked in is already marked');return;}
  await rpc('pf_set_marks',{p_date:S.sheet.date,p_items:items});
  items.forEach(i=>{const p=d.people.find(x=>x.id===i.u);if(p)p.status='present';});
  S.sheet.grid=null;draw();toast(items.length+' marked Present from check-ins');
}
function exportSheet(){
  const g=S.sheet.grid;if(!g)return;
  const days=[];eachDate(g.from,g.to,k=>days.push(k));
  const rows=[['Attendance sheet',g.month,'Status',g.sheet.status],[],
    ['Employee ID','Name','Site'].concat(days.map(k=>+k.slice(8))).concat(['Present','Overtime','Half day','Leave','Weekly off','Absent','Not marked','Days worked'])];
  g.people.forEach(p=>{const c=guardCounts(p,g);
    rows.push([p.empCode,p.name,p.site||''].concat(days.map(k=>STCODE[p.marks[k]]||'')).concat([c.present,c.overtime,c.half_day,c.leave,c.weekly_off,c.absent,c.missing,c.worked]));});
  rows.push([],['Codes: P present, OT overtime, HD half day, L leave, WO weekly off, A absent']);
  const csv='\ufeff'+rows.map(r=>r.map(v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\n');
  downloadBlob(new Blob([csv],{type:'text/csv'}),'attendance_sheet_'+g.month+'.csv');
}

/* ---------- events ---------- */
document.addEventListener('submit',async e=>{
  e.preventDefault();
  const id=e.target.id;
  try{
    if(id==='loginForm'){
      const btn=$('#loginBtn');btn.disabled=true;S.loginErr='';$('#loginErr').textContent='';
      try{
        const r=await sb.auth.signInWithPassword({email:emailFor($('#lc').value),password:$('#lp').value});
        if(r.error)throw new Error(friendly(r.error));
        await startSession(r.data.user);
      }catch(er){S.loginErr=friendly(er);$('#loginErr').textContent=S.loginErr;btn.disabled=false;}
    }else if(id==='setupForm'){
      const er=$('#setupErr'),code=$('#si').value.trim();
      if(!CODE_RE.test(code)){er.textContent='Admin ID must be letters or numbers.';return;}
      if($('#sp').value.length<8){er.textContent='Password must be at least 8 characters.';return;}
      const r=await sb.auth.signUp({email:emailFor(code),password:$('#sp').value,options:{data:{invite:$('#sc').value.trim(),emp_code:code.toUpperCase(),name:$('#sn2').value.trim()}}});
      if(r.error){er.textContent=/Database error|closed/i.test(r.error.message)?'The setup code is wrong, or setup was already completed.':friendly(r.error);return;}
      if(!r.data.session){er.textContent='Account created but you were not signed in. In Supabase, turn OFF "Confirm email" (see the guide), then sign in.';return;}
      S.setup=false;await startSession(r.data.user);
    }else if(id==='pwForm'||id==='pwForm2'){
      const m=id==='pwForm';
      const cur=m?$('#p0').value:$('#a0').value,nw=m?$('#p1').value:$('#a1').value,err=m?$('#pwErr'):$('#pw2Err');
      if(nw.length<6){err.textContent='New password must be at least 6 characters.';return;}
      if(m&&nw!==$('#p2').value){err.textContent='The new passwords do not match.';return;}
      if(nw===cur){err.textContent='Choose a password different from the current one.';return;}
      try{
        const chk=await sb.auth.signInWithPassword({email:emailFor(S.user.empCode),password:cur});
        if(chk.error){err.textContent='Your current password is not correct.';return;}
        const up=await sb.auth.updateUser({password:nw});
        if(up.error)throw new Error(friendly(up.error));
        await rpc('pf_clear_must_change');
        S.user.mustChange=false;toast('Password updated');
        if(m)await afterLogin();else{$('#a0').value='';$('#a1').value='';err.textContent='';}
      }catch(er){err.textContent=friendly(er);}
    }
  }catch(err){toast(friendly(err));}
});
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-tab],[data-act],[data-emp],[data-lb],[data-delsite],[data-reset],[data-toggle],[data-closeid],[data-dlcsv],[data-shift],[data-st],[data-smode],[data-dshift],[data-gdrill],[data-gojump],[data-openmonth]');
  if(!t)return;
  const d=t.dataset;
  try{
    if(d.tab){enterTab(d.tab);return;}
    if(d.emp){S.flt.user=d.emp;S.tab='recs';draw();window.scrollTo(0,0);if(!S.users)await loadUsers();loadRecs();return;}
    if(d.lb){$('#lbImg').src=S.photos[d.lb]||'';$('#lbCap').textContent=d.cap||'';$('#lb').hidden=false;return;}
    if(d.shift){
      const u=(S.users||[]).find(x=>x.id===d.shift);if(!u)return;
      openModal(`<h3>Shift: ${esc(u.name)}</h3><p class="muted small">Night shifts work too, for example 20:00 to 08:00.</p>
      <label class="f" for="shs">Starts</label><input type="time" id="shs" value="${u.shiftStart||'08:00'}">
      <label class="f" for="she">Ends</label><input type="time" id="she" value="${u.shiftEnd||'20:00'}">
      <p class="formerr" id="shErr2"></p><div class="row" style="margin-top:.6rem"><button class="btn grow" data-act="clearshift" data-id="${esc(u.id)}">No shift</button><button class="btn pri grow" data-act="saveshift" data-id="${esc(u.id)}">Save</button></div>`);return;}
    if(d.st){const q=d.st.split('|');await setMark(q[0],q[1]);return;}
    if(d.smode){S.sheet.mode=d.smode;S.sheet.fail='';draw();await (d.smode==='month'?loadSheetMonth():loadSheetDay());return;}
    if(d.dshift){const sh=S.sheet,cur=sh.date||S.todayKey||dkeyLocal();let nd=d.dshift==='today'?(S.todayKey||dkeyLocal()):dateAdd(cur,+d.dshift);if(S.todayKey&&nd>S.todayKey)nd=S.todayKey;sh.date=nd;await loadSheetDay();return;}
    if(d.gdrill){openDrill(d.gdrill);return;}
    if(d.gojump){closeModal();S.sheet.date=d.gojump;S.sheet.mode='day';S.sheet.day=null;await enterTab('sheet');return;}
    if(d.openmonth){S.sheet.month=d.openmonth;S.sheet.mode='month';S.sheet.grid=null;await enterTab('sheet');return;}
    if(d.delsite){if(!confirm('Remove this site?'))return;await rpc('pf_admin_site_delete',{p_id:+d.delsite});await loadConfig();draw();return;}
    if(d.reset){
      if(!confirm('Reset this employee\'s password? They will be signed out.'))return;
      const pw=genPw();await rpc('pf_admin_reset_password',{p_user:d.reset,p_pw:pw});
      openModal(`<h3>New temporary password</h3><p class="muted">Give this to the employee. They must change it at first sign-in.</p><div class="pw">${esc(pw)}</div><button class="btn pri" style="width:100%" data-mclose>Done</button>`);return;}
    if(d.toggle){
      const act=d.active==='1';
      if(act&&!confirm('Deactivate this employee? They will no longer be able to use the app.'))return;
      await rpc('pf_admin_set_active',{p_user:d.toggle,p_active:!act});await loadUsers();draw();toast(act?'Employee deactivated':'Employee activated');return;}
    if(d.closeid){
      const def=new Date(),dtl=dkeyLocal(def)+'T'+pad(def.getHours())+':'+pad(def.getMinutes());
      openModal(`<h3>Close shift</h3><p class="muted small">Set the check-out time for this open shift. It will be marked “Closed by admin”.</p>
      <label class="f" for="cdt">Check-out time</label><input type="datetime-local" id="cdt" value="${dtl}">
      <p class="formerr" id="cErr"></p><div class="row" style="margin-top:.6rem"><button class="btn grow" data-mclose>Cancel</button><button class="btn pri grow" data-act="doclose" data-id="${esc(d.closeid)}">Close shift</button></div>`);return;}
    if(d.dlcsv){
      const rows=JSON.parse(decodeURIComponent(d.dlcsv));
      const csv='\ufeffEmployee ID,Name,Temporary password\n'+rows.map(r=>[r.empCode,r.name,r.tempPassword].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
      downloadBlob(new Blob([csv],{type:'text/csv'}),'new_employee_passwords.csv');return;}
    const a=d.act;
    if(a==='in'||a==='out')openSheet(a);
    else if(a==='showsetup'){S.setup=true;draw();}
    else if(a==='hidesetup'){S.setup=false;draw();}
    else if(a==='logout'){try{await sb.auth.signOut();}catch(_){}S.user=null;S.loginErr='';S.photos={};closeSheet();draw();}
    else if(a==='refresh'){await loadToday();draw();}
    else if(a==='search')loadRecs();
    else if(a==='export')exportCsv();
    else if(a==='purge')await purgePhotos();
    else if(a==='fillci')await fillFromCheckins();
    else if(a==='retrysheet'){S.sheet.fail='';await (S.sheet.mode==='month'?loadSheetMonth():loadSheetDay());}
    else if(a==='exportsheet')exportSheet();
    else if(a==='submitsheet'){
      openModal(`<h3>Submit ${esc(monthLabel(S.sheet.month))}</h3><p class="muted small">After you submit, this sheet is locked until admin returns it.</p>
      <label class="f" for="snote">Note to admin (optional)</label><textarea id="snote" maxlength="500"></textarea><p class="formerr" id="snErr"></p>
      <div class="row" style="margin-top:.6rem"><button class="btn grow" data-mclose>Cancel</button><button class="btn pri grow" data-act="dosubmit">Submit</button></div>`);
    }
    else if(a==='dosubmit'){
      try{await rpc('pf_sheet_submit',{p_month:S.sheet.month,p_note:($('#snote').value||'').trim()||null});closeModal();toast('Sheet submitted to admin');await loadSheetMonth();}
      catch(x){$('#snErr').textContent=friendly(x);}
    }
    else if(a==='approvesheet'){
      if(!confirm('Approve the sheet for '+monthLabel(S.sheet.month)+'?'))return;
      await rpc('pf_sheet_review',{p_month:S.sheet.month,p_action:'approve',p_note:null});toast('Sheet approved');await loadSheetMonth();
    }
    else if(a==='returnsheet'){
      openModal(`<h3>Return for corrections</h3><p class="muted small">The field officer can edit and submit again.</p>
      <label class="f" for="rnote">What should be corrected? (optional)</label><textarea id="rnote" maxlength="500"></textarea><p class="formerr" id="rnErr"></p>
      <div class="row" style="margin-top:.6rem"><button class="btn grow" data-mclose>Cancel</button><button class="btn pri grow" data-act="doreturn">Return sheet</button></div>`);
    }
    else if(a==='doreturn'){
      try{await rpc('pf_sheet_review',{p_month:S.sheet.month,p_action:'return',p_note:($('#rnote').value||'').trim()||null});closeModal();toast('Sheet returned');await loadSheetMonth();}
      catch(x){$('#rnErr').textContent=friendly(x);}
    }
    else if(a==='sumshow')await loadSummary();
    else if(a==='sumcsv')sumCsv();
    else if(a==='saveshift'){
      try{await rpc('pf_admin_set_shift',{p_user:d.id,p_start:$('#shs').value,p_end:$('#she').value});closeModal();await loadUsers();draw();toast('Shift saved');}
      catch(x){$('#shErr2').textContent=friendly(x);}
    }
    else if(a==='clearshift'){await rpc('pf_admin_set_shift',{p_user:d.id,p_start:null,p_end:null});closeModal();await loadUsers();draw();toast('Shift cleared');}
    else if(a==='applyshift'){
      if(!S.bsh.start||!S.bsh.end){toast('Set the start and end time');return;}
      const n=await rpc('pf_admin_set_shift_bulk',{p_site:S.bsh.site?+S.bsh.site:null,p_start:S.bsh.start,p_end:S.bsh.end});
      await loadUsers();draw();toast('Shift set for '+n+' employee'+(n===1?'':'s'));
    }
    else if(a==='savegrace'){
      const g=parseInt(S.graceEdit==null?S.cfg.graceMin:S.graceEdit,10);
      if(!(g>=0&&g<=120)){toast('Enter a number from 0 to 120');return;}
      await rpc('pf_admin_set_grace',{p_min:g});S.cfg.graceMin=g;S.graceEdit=null;draw();toast('Saved');
    }
    else if(a==='doclose'){
      const v=$('#cdt').value;if(!v){$('#cErr').textContent='Pick a time.';return;}
      try{await rpc('pf_admin_close_shift',{p_id:+d.id,p_out:new Date(v).toISOString()});closeModal();toast('Shift closed');loadRecs();}
      catch(er){$('#cErr').textContent=friendly(er);}
    }
    else if(a==='adduser'){
      const f=S.nu,er=$('#nuErr');er.textContent='';
      try{
        const invite=await rpc('pf_admin_invite');
        const tmp=await createAccount(f,invite);
        S.nu={empCode:'',name:'',designation:'',role:'employee',siteId:f.siteId};
        await loadUsers();draw();
        openModal(`<h3>Account created</h3><p><b>${esc(f.name)}</b> · ${esc(String(f.empCode).toUpperCase())}</p><p class="muted">Give them this temporary password. They must change it at first sign-in.</p><div class="pw">${esc(tmp)}</div><button class="btn pri" style="width:100%" data-mclose>Done</button>`);
      }catch(x){er.textContent=friendly(x);}
    }
    else if(a==='bulkadd'){
      const invite=await rpc('pf_admin_invite');
      const lines=S.bulk.lines.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if(!lines.length){toast('Enter at least one line');return;}
      const created=[],skipped=[];let stopped=false;
      t.disabled=true;t.textContent='Creating…';
      for(const line of lines){
        const p=line.split(',').map(s=>s.trim());
        if(stopped){skipped.push({line,reason:'Not attempted (rate limit)'});continue;}
        try{
          const tmp=await createAccount({empCode:p[0],name:p[1],designation:p[2]||'',siteId:S.bulk.siteId},invite);
          created.push({empCode:p[0].toUpperCase(),name:p[1],tempPassword:tmp});
        }catch(x){skipped.push({line,reason:x.message});if(x.rate)stopped=true;}
        await new Promise(r=>setTimeout(r,400));
      }
      S.bulk.lines=skipped.map(s=>s.line).join('\n');await loadUsers();draw();
      let m=`<h3>${created.length} account${created.length===1?'':'s'} created</h3>`;
      if(created.length)m+=`<p class="muted small">Save these temporary passwords now. They are shown only once.</p><table class="t"><tr><th>ID</th><th>Name</th><th>Password</th></tr>${created.map(c=>`<tr><td>${esc(c.empCode)}</td><td>${esc(c.name)}</td><td><b>${esc(c.tempPassword)}</b></td></tr>`).join('')}</table>
        <button class="btn" style="width:100%;margin-top:.8rem" data-dlcsv="${encodeURIComponent(JSON.stringify(created))}">⬇ Download as CSV</button>`;
      if(skipped.length)m+=`<p class="formerr" style="min-height:0;margin-top:.8rem"><b>Not created (kept in the box so you can retry):</b><br>${skipped.map(s=>esc(s.line)+' — '+esc(s.reason)).join('<br>')}</p>`;
      openModal(m+`<button class="btn pri" style="width:100%;margin-top:.8rem" data-mclose>Done</button>`);
    }
    else if(a==='usehere'){
      const er=$('#siteErr');er.style.color='var(--fg-soft)';er.textContent='Getting location…';
      if(!navigator.geolocation){er.style.color='var(--bad)';er.textContent='Location not supported.';return;}
      navigator.geolocation.getCurrentPosition(p=>{S.siteForm.lat=p.coords.latitude.toFixed(6);S.siteForm.lng=p.coords.longitude.toFixed(6);draw();},
        ()=>{er.style.color='var(--bad)';er.textContent='Could not get location.';},{enableHighAccuracy:true,timeout:15000});
    }
    else if(a==='addsite'){
      const f=S.siteForm,er=$('#siteErr');er.style.color='var(--bad)';
      try{await rpc('pf_admin_site_add',{p_name:f.name,p_lat:parseFloat(f.lat),p_lng:parseFloat(f.lng),p_radius:parseInt(f.radius,10)});
        S.siteForm={name:'',lat:'',lng:'',radius:150};await loadConfig();draw();toast('Site added');}
      catch(x){er.textContent=friendly(x);}
    }
  }catch(err){toast(friendly(err));}
});
document.addEventListener('input',e=>{
  const t=e.target,d=t.dataset;
  if(d.sf)S.siteForm[d.sf]=t.value;
  if(d.nu)S.nu[d.nu]=t.value;
  if(d.bulk)S.bulk[d.bulk]=t.value;
  if(d.purge)S.purgeDays=t.value;
  if(d.bsh)S.bsh[d.bsh]=t.value;
  if(d.sum)S.sumMonth=t.value;
  if(d.grace)S.graceEdit=t.value;
  if(d.flt)S.flt[d.flt]=t.value;
});
document.addEventListener('change',async e=>{
  const t=e.target,d=t.dataset;
  try{
    if(d.sdate){if(t.value){S.sheet.date=t.value;await loadSheetDay();}}
    if(d.smonth){if(t.value){S.sheet.month=t.value;await loadSheetMonth();}}
    if(d.ssite!=null){S.sheet.site=t.value;draw();}
    if(d.sunm!=null){S.sheet.unmarked=t.checked;draw();}
    if(t.id==='blk'){await rpc('pf_admin_set_block',{p_block:t.checked});S.cfg.blockOutside=t.checked;toast(t.checked?'Check-in blocked off site':'Off-site check-in allowed');}
    if(d.nu==='role'){if(t.value==='field_officer')S.nu.siteId='';draw();}
    if(d.urole){await rpc('pf_admin_set_role',{p_user:d.urole,p_role:t.value});await loadUsers();draw();toast('Role updated');}
    if(d.usite){await rpc('pf_admin_set_site',{p_user:d.usite,p_site:t.value?+t.value:null});await loadUsers();toast('Site updated');}
  }catch(err){toast(friendly(err));}
});
$('#shClose').onclick=closeSheet;
$('#btnShutter').onclick=capture;
$('#btnRetake').onclick=()=>{setReview(false);startCam();};
$('#btnSubmit').onclick=submitMark;
$('#btnLocRetry').onclick=startLoc;
$('#btnFile').onclick=()=>$('#fileIn').click();
$('#fileIn').onchange=e=>{fromFile(e.target.files[0]);e.target.value='';};
$('#lbClose').onclick=()=>$('#lb').hidden=true;
$('#lb').onclick=e=>{if(e.target.id==='lb')$('#lb').hidden=true;};
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&S.user&&!S.user.mustChange&&$('#sheet').hidden){
    if(S.tab==='mark')Promise.all([loadConfig(),loadStatus()]).then(draw);
    if(S.tab==='today')loadToday().then(draw);
    if(S.tab==='sheet'&&S.sheet.mode==='day'&&S.sheet.day&&!S.sheet.loading)loadSheetDay();
  }
});

/* ---------- boot ---------- */
(async function(){
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
  const c=window.PF_CONFIG;
  if(!c||!c.SUPABASE_URL||/PASTE/.test(c.SUPABASE_URL)||!c.SUPABASE_ANON_KEY||/PASTE/.test(c.SUPABASE_ANON_KEY)){
    S.booting=false;S.fatal='Open config.js and paste your Supabase Project URL and anon key, then upload the app again.';draw();return;
  }
  if(!window.supabase||!window.supabase.createClient){S.booting=false;S.fatal='Could not load the Supabase library. Check your internet connection and reload.';draw();return;}
  sb=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&S.user){S.user=null;draw();}});
  try{
    const r=await sb.auth.getSession();
    if(r.data&&r.data.session)await startSession(r.data.session.user);
  }catch(e){S.loginErr=friendly(e);}
  S.booting=false;draw();
})();
