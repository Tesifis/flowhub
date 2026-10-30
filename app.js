(()=>{'use strict';
const $=id=>document.getElementById(id), KEY='flowhub_v1_state',CFG='flowhub_sync_cfg';
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id'+Date.now()+Math.random();
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dayAdd=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d)};
const nowday=()=>localDay(new Date()),days=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const esc=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({tasks:[],lessons:[],habits:[],logs:[],theme:'dark'});
let state;try{state={...empty(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{state=empty()}
for(const k of ['tasks','lessons','habits','logs'])if(!Array.isArray(state[k]))state[k]=[];
let cfg;try{cfg=JSON.parse(localStorage.getItem(CFG)||'{}')}catch{cfg={}};
let token=null,userId=null,editTask=null,editHabit=null,logHabit=null,selectedDay=new Date().getDay(),syncBusy=false,dirty=false;
let selectedTaskTab='today';
function switchTaskTab(tab){
 if(!['today','upcoming','someday','done'].includes(tab))return;
 selectedTaskTab=tab;
 document.querySelectorAll('[data-task-tab]').forEach(button=>{
   const active=button.dataset.taskTab===tab;
   button.classList.toggle('is-selected',active);
   button.setAttribute('aria-selected',String(active));
   button.tabIndex=active?0:-1;
 });
 document.querySelectorAll('[data-task-panel]').forEach(panel=>{panel.hidden=panel.dataset.taskPanel!==tab});
}
document.querySelector('.task-tabs').addEventListener('click',event=>{
 const button=event.target.closest('[data-task-tab]');
 if(button)switchTaskTab(button.dataset.taskTab);
});
document.querySelector('.task-tabs').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...document.querySelectorAll('[data-task-tab]')];
 const current=tabs.findIndex(t=>t.dataset.taskTab===selectedTaskTab);
 const target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 event.preventDefault();switchTaskTab(tabs[target].dataset.taskTab);tabs[target].focus();
});

const toast=(msg)=>{const x=$('toast');x.textContent=msg;x.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.remove('show'),3000)};
function save(){localStorage.setItem(KEY,JSON.stringify(state));dirty=true;render();scheduleSync()}
function changeTheme(){const mode=state.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):state.theme;document.documentElement.dataset.theme=mode;$('themeSelect').value=state.theme;}
$('themeSelect').onchange=e=>{state.theme=e.target.value;save()};
function scheduleStatus(lessons,d){const today=d===new Date().getDay(),t=new Date().toTimeString().slice(0,5);if(!today)return '';if(lessons.start<=t&&t<lessons.end)return 'Сейчас идёт';if(lessons.start>t)return 'Далее';return ''}
function render(){changeTheme();const dt=new Date();$('date').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(dt);const open=state.tasks.filter(t=>!t.deleted&&!t.done);$('hello').textContent='Главная';
$('days').innerHTML=[1,2,3,4,5,6,0].map(d=>`<button data-day="${d}" class="${d===selectedDay?'active':''} ${d===dt.getDay()?'current':''}">${days[d]}</button>`).join('');
const nowMin=dt.getHours()*60+dt.getMinutes();
const upcomingLessons=[];
for(let offset=0;offset<7;offset++){
 const date=new Date(dt);date.setDate(dt.getDate()+offset);
 for(const l of state.lessons.filter(x=>!x.deleted&&Number(x.day)===date.getDay())){
  const [hr,min]=String(l.start||'').split(':').map(Number);
  const [endHr,endMin]=String(l.end||'').split(':').map(Number);
  const begins=hr*60+min,ends=endHr*60+endMin;
  if(!Number.isFinite(begins)||!Number.isFinite(ends))continue;
  if(offset===0&&ends<=nowMin)continue;
  upcomingLessons.push({lesson:l,offset,begins,now:offset===0&&begins<=nowMin});
 }
}
upcomingLessons.sort((a,b)=>a.offset-b.offset||a.begins-b.begins);
const next=upcomingLessons[0];
$('nextLessonKicker').textContent=next?(next.now?'Сейчас идёт':next.offset===0?'Следующая пара':next.offset===1?'Завтра':'Ближайшая пара'):'Расписание';
$('nextLessonName').textContent=next?next.lesson.name:'Пар нет';
$('nextLessonMeta').textContent=next?(next.offset===0?'Сегодня':next.offset===1?'Завтра':days[(dt.getDay()+next.offset)%7])+' · '+next.lesson.start+'–'+next.lesson.end+(next.lesson.room?' · '+next.lesson.room:''):'На ближайшую неделю занятий нет';
const lessons=state.lessons.filter(x=>!x.deleted&&x.day===selectedDay).sort((a,b)=>a.start.localeCompare(b.start));
$('scheduleList').innerHTML=lessons.length?lessons.map(l=>`<div class="lesson ${scheduleStatus(l,selectedDay)==='Сейчас идёт'?'now':''}"><div class="lesson-time">${esc(l.start)}<br>${esc(l.end)}</div><div><div class="lesson-name">${esc(l.name)}</div><div class="lesson-room">${esc(l.room)}</div>${scheduleStatus(l,selectedDay)?`<div class="lesson-status">${scheduleStatus(l,selectedDay)}</div>`:''}</div></div>`).join(''):'<div class="empty">На этот день пары не добавлены</div>';
const today=nowday(), active=state.tasks.filter(t=>!t.deleted&&!t.done),done=state.tasks.filter(t=>!t.deleted&&t.done).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));const todayTasks=active.filter(t=>t.due&&t.due<=today),up=active.filter(t=>t.due&&t.due>today).sort((a,b)=>a.due.localeCompare(b.due)),none=active.filter(t=>!t.due);$('todayCount').textContent=todayTasks.length;
const tasksHtml=a=>a.length?a.map(t=>`<article class="task"><input class="task-check" type="checkbox" data-check="${t.id}" ${t.done?'checked':''} aria-label="Выполнить ${esc(t.name)}"><div class="task-info"><div class="task-name">${esc(t.name)}</div>${t.note?`<div class="task-note">${esc(t.note)}</div>`:''}${t.due?`<div class="task-due">${esc(t.due)}</div>`:''}</div><button class="task-edit" aria-label="Изменить дело" data-edit="${t.id}">✎</button></article>`).join(''):'<div class="empty">Пока ничего нет</div>';
const dailyTasks=state.tasks.filter(t=>!t.deleted&&t.due&&t.due<=today);
const completedDaily=dailyTasks.filter(t=>t.done).length;
const activeHabits=state.habits.filter(h=>!h.deleted);
const completedHabits=activeHabits.filter(h=>valueFor(h.id,today)>=Math.max(1,Number(h.target)||1)).length;
function setRing(id,progress,completed,total){
 const pct=total?Math.round(progress):0;
 $(id).style.setProperty('--progress',pct+'%');
 $(id).setAttribute('aria-label',pct+'% выполнено');
 $(id+'Value').textContent='';
 $(id+'Details').textContent=completed+' из '+total;
}
setRing('taskRing',dailyTasks.length?100*completedDaily/dailyTasks.length:0,completedDaily,dailyTasks.length);
setRing('habitRing',activeHabits.length?100*activeHabits.reduce((sum,h)=>sum+Math.min(1,valueFor(h.id,today)/Math.max(1,Number(h.target)||1)),0)/activeHabits.length:0,completedHabits,activeHabits.length);
const tomorrow=dayAdd(today,1);
const nearTasks=active.filter(t=>t.due&&t.due<=tomorrow).sort((a,b)=>a.due.localeCompare(b.due));
$('homeTaskCount').textContent=nearTasks.length;
$('homeTaskList').innerHTML=nearTasks.length?nearTasks.slice(0,5).map(t=>`<div class="home-task"><input class="task-check" type="checkbox" data-home-check="${esc(t.id)}" aria-label="Выполнить ${esc(t.name)}"><div class="near-task-details"><span class="home-task-name">${esc(t.name)}</span><small>${t.due<today?'Просрочено':t.due===today?'Сегодня':'Завтра'}</small></div></div>`).join(''):'<div class="home-empty">На сегодня и завтра задач нет</div>';
$('todayList').innerHTML=tasksHtml(todayTasks);$('upcomingList').innerHTML=tasksHtml(up);$('somedayList').innerHTML=tasksHtml(none);$('doneCount').textContent=done.length;$('doneList').innerHTML=tasksHtml(done);renderHabits();$('syncBadge').textContent=userId?'Облачная синхронизация подключена · офлайн доступ':'Данные на устройстве · офлайн доступ';}
function renderHabits(){const today=nowday(),habits=state.habits.filter(h=>!h.deleted);$('habitCount').textContent=habits.length;
$('habitList').innerHTML=habits.length?habits.map(h=>{const v=valueFor(h.id,today),pct=Math.min(100,Math.round(v/h.target*100));return `<div class="habit"><div class="habit-top"><div><div class="habit-name">${esc(h.name)}</div><div class="habit-sub">${v} / ${h.target} ${h.unit==='done'?'выполнено':esc(h.unit)} сегодня</div></div><div class="habit-actions"><button data-log="${h.id}" aria-label="Отметить ${esc(h.name)}">＋</button><button data-habit-edit="${h.id}" aria-label="Изменить ${esc(h.name)}">✎</button></div></div><div class="habit-progress"><span style="width:${pct}%"></span></div></div>`}).join(''):'<div class="empty">Добавь первую привычку, например «Чтение».</div>';
const monday=new Date();const dow=(monday.getDay()+6)%7;monday.setDate(monday.getDate()-dow);const start=localDay(monday);$('weeklyStats').innerHTML=habits.length?habits.map(h=>{let total=0,daysDone=0;for(let i=0;i<7;i++){const date=dayAdd(start,i);if(date>today)break;const v=valueFor(h.id,date);total+=v;if(v>=h.target)daysDone++}return `<div class="stat-row"><span>${esc(h.name)} · ${daysDone} дн.</span><strong>${total} ${h.unit==='done'?'раз':esc(h.unit)}</strong></div>`}).join(''):'<div class="hint">Здесь появятся итоги недели.</div>';
const dates=Array.from({length:28},(_,i)=>dayAdd(today,i-27));$('activityGrid').innerHTML=dates.map(date=>{const count=habits.filter(h=>valueFor(h.id,date)>=h.target).length;const lvl=count===0?0:count>=3?3:count===2?2:1;return `<div class="activity-day level${lvl} ${date===today?'today':''}" data-day="${date.slice(-2)}" title="${date}: ${count} привычек выполнено" aria-label="${date}: ${count} привычек выполнено"></div>`}).join('');}
function valueFor(id,date){return state.logs.filter(x=>!x.deleted&&x.habitId===id&&x.date===date).reduce((v,x)=>v+Number(x.amount||0),0)}
$('days').onclick=e=>{let b=e.target.closest('[data-day]');if(b){selectedDay=Number(b.dataset.day);render()}};
$('add').onclick=()=>openTask();$('todayList').parentElement.addEventListener('click',taskClicked);$('upcomingList').addEventListener('click',taskClicked);$('somedayList').addEventListener('click',taskClicked);$('doneList').addEventListener('click',taskClicked);
function taskClicked(e){const b=e.target.closest('[data-edit]');if(b)openTask(b.dataset.edit)};
for(const id of ['todayList','upcomingList','somedayList','doneList'])$(id).addEventListener('change',e=>{const x=e.target.closest('[data-check]');if(!x)return;const t=state.tasks.find(t=>t.id===x.dataset.check);if(t){t.done=x.checked;t.updatedAt=Date.now();save()}});
function openTask(id){editTask=id||null;const t=state.tasks.find(x=>x.id===id);$('taskTitle').textContent=t?'Изменить дело':'Новое дело';$('taskName').value=t?.name||'';$('taskNote').value=t?.note||'';const due=t?.due||nowday();$('taskWhen').value=t?(!t.due?'none':t.due===nowday()?'today':t.due===dayAdd(nowday(),1)?'tomorrow':'date'):'today';$('taskDate').value=due;$('dateInputWrap').hidden=$('taskWhen').value!=='date';$('deleteTask').hidden=!t;$('taskDialog').showModal()}
$('taskWhen').onchange=()=>$('dateInputWrap').hidden=$('taskWhen').value!=='date';$('taskForm').onsubmit=e=>{e.preventDefault();const name=$('taskName').value.trim();if(!name)return;const w=$('taskWhen').value,due=w==='none'?null:w==='today'?nowday():w==='tomorrow'?dayAdd(nowday(),1):$('taskDate').value;if(w==='date'&&!due){toast('Выбери дату');return}const t=state.tasks.find(t=>t.id===editTask);const fields={name,note:$('taskNote').value,due,updatedAt:Date.now()};if(t)Object.assign(t,fields);else state.tasks.push({id:uid(),done:false,...fields});$('taskDialog').close();save()};
$('deleteTask').onclick=()=>{const t=state.tasks.find(t=>t.id===editTask);if(t){t.deleted=true;t.updatedAt=Date.now();$('taskDialog').close();save()}};
$('editSchedule').onclick=()=>{$('lessonDay').value=selectedDay;renderLessonEdit();$('scheduleDialog').showModal()};
function renderLessonEdit(){const day=Number($('lessonDay').value);$('editLessons').innerHTML=state.lessons.filter(x=>!x.deleted&&x.day===day).sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`<div class="edit-lesson"><span>${esc(l.start)} ${esc(l.name)}</span><button data-delete-lesson="${l.id}" aria-label="Удалить пару">✕</button></div>`).join('')};$('lessonDay').onchange=renderLessonEdit;
$('lessonForm').onsubmit=e=>{e.preventDefault();const start=$('lessonStart').value,end=$('lessonEnd').value;if(end<=start){toast('Конец должен быть позже начала');return}state.lessons.push({id:uid(),day:Number($('lessonDay').value),name:$('lessonName').value.trim(),start,end,room:$('lessonRoom').value.trim(),updatedAt:Date.now()});$('lessonName').value='';$('lessonRoom').value='';renderLessonEdit();save()};
$('editLessons').onclick=e=>{const b=e.target.closest('[data-delete-lesson]');if(b){const t=state.lessons.find(x=>x.id===b.dataset.deleteLesson);if(t){t.deleted=true;t.updatedAt=Date.now();renderLessonEdit();save()}}};$('clearLessons').onclick=()=>{if(!confirm('Удалить все пары этого дня?'))return;const day=Number($('lessonDay').value);state.lessons.filter(l=>l.day===day&&!l.deleted).forEach(l=>{l.deleted=true;l.updatedAt=Date.now()});renderLessonEdit();save()};
$('addHabit').onclick=()=>openHabit();$('habitList').onclick=e=>{const ed=e.target.closest('[data-habit-edit]'),log=e.target.closest('[data-log]');if(ed)openHabit(ed.dataset.habitEdit);if(log)openLog(log.dataset.log)};
function openHabit(id){editHabit=id||null;const h=state.habits.find(h=>h.id===id);$('habitTitle').textContent=h?'Изменить привычку':'Новая привычка';$('habitName').value=h?.name||'';$('habitUnit').value=h?.unit||'страниц';$('habitTarget').value=h?.target||10;$('deleteHabit').hidden=!h;$('habitDialog').showModal()};
$('habitUnit').onchange=()=>{if($('habitUnit').value==='done')$('habitTarget').value=1};
$('habitForm').onsubmit=e=>{e.preventDefault();const name=$('habitName').value.trim(),unit=$('habitUnit').value,target=unit==='done'?1:Number($('habitTarget').value);if(!name||!Number.isInteger(target)||target<1||target>100000)return;const h=state.habits.find(h=>h.id===editHabit);const fields={name,unit,target,updatedAt:Date.now()};if(h)Object.assign(h,fields);else state.habits.push({id:uid(),...fields});$('habitDialog').close();save()};
$('deleteHabit').onclick=()=>{const h=state.habits.find(h=>h.id===editHabit);if(h){h.deleted=true;h.updatedAt=Date.now();$('habitDialog').close();save()}};
function openLog(id){logHabit=id;const h=state.habits.find(h=>h.id===id);$('habitLogTitle').textContent=h?.name||'Привычка';$('habitLogDate').value=nowday();$('habitLogAmount').value=h?.unit==='done'?1:Math.max(1,h?.target||1);$('habitLogDialog').showModal()};
$('habitLogForm').onsubmit=e=>{e.preventDefault();const date=$('habitLogDate').value,amount=Number($('habitLogAmount').value),h=state.habits.find(x=>x.id===logHabit);if(!date||!h||!Number.isInteger(amount)||amount<0||amount>100000)return;const existing=state.logs.find(x=>x.habitId===logHabit&&x.date===date&&!x.deleted);if(existing){existing.amount=amount;existing.updatedAt=Date.now()}else state.logs.push({id:uid(),habitId:logHabit,date,amount,updatedAt:Date.now()});$('habitLogDialog').close();save()};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
$('settings').onclick=()=>{$('supabaseUrl').value=cfg.url||'';$('supabaseKey').value=cfg.key||'';$('settingsDialog').showModal()};
$('exportData').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download=`flowhub-${nowday()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
$('importData').onchange=async e=>{try{const text=await e.target.files[0].text(),obj=JSON.parse(text);if(!['tasks','lessons','habits','logs'].every(k=>Array.isArray(obj[k])))throw Error('Неподходящий формат');if(!confirm('Объединить данные из файла с текущими?'))return;mergeState(obj);save();toast('Данные импортированы')}catch(err){toast('Ошибка импорта: '+err.message)}finally{e.target.value=''}};
function mergeState(remote){for(const key of ['tasks','lessons','habits','logs']){const map=new Map(state[key].map(x=>[x.id,x]));for(const x of remote[key]||[]){if(!x.id)continue;const old=map.get(x.id);if(!old||Number(x.updatedAt||0)>Number(old.updatedAt||0))map.set(x.id,x)}state[key]=Array.from(map.values())}}
function status(msg){$('syncStatus').textContent=msg}
function readCfg(){const url=$('supabaseUrl').value.trim().replace(/\/$/,'');const key=$('supabaseKey').value.trim();if(!/^https:\/\/[\w.-]+\.supabase\.co$/.test(url)||!key){throw Error('Укажи адрес Supabase и публичный ключ')}cfg={url,key};localStorage.setItem(CFG,JSON.stringify(cfg))}
async function req(path,opts={}){const r=await fetch(cfg.url+'/auth/v1/'+path,{...opts,headers:{'apikey':cfg.key,'Content-Type':'application/json',...opts.headers}});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.msg||data.error_description||data.message||'Ошибка '+r.status);return data}
async function db(method,body){const r=await fetch(cfg.url+'/rest/v1/flowhub_state?user_id=eq.'+encodeURIComponent(userId),{method,headers:{apikey:cfg.key,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body&&JSON.stringify(body)});const data=await r.json().catch(()=>[]);if(!r.ok)throw Error(data.message||'Ошибка базы '+r.status);return data}
async function auth(mode){try{readCfg();const email=$('email').value.trim(),password=$('password').value;if(!email||!password)throw Error('Введи email и пароль');status('Подключение…');const result=await req(mode==='signup'?'signup':'token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});if(!result.access_token){status('Подтверди email, затем войди.');return}token=result.access_token;userId=result.user?.id;sessionStorage.setItem('fh_session',JSON.stringify({token,userId,refresh:result.refresh_token,expires:Date.now()+result.expires_in*1000}));$('logout').hidden=false;status('Вы вошли. Синхронизация включена.');await sync();render()}catch(e){status(e.message)}}
$('signup').onclick=()=>auth('signup');$('login').onclick=()=>auth('login');$('logout').onclick=()=>{token=null;userId=null;sessionStorage.removeItem('fh_session');$('logout').hidden=true;status('Вы вышли');render()};
async function sync(){if(syncBusy||!userId||!token||!navigator.onLine)return;syncBusy=true;try{const rows=await db('GET');if(rows.length){mergeState(rows[0].data||{});localStorage.setItem(KEY,JSON.stringify(state));render()}await db('POST',[{user_id:userId,data:{tasks:state.tasks,lessons:state.lessons,habits:state.habits,logs:state.logs}}]);dirty=false;status('Синхронизировано: '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}catch(e){status('Синхронизация: '+e.message)}finally{syncBusy=false}}
let syncTimeout;function scheduleSync(){if(!userId)return;clearTimeout(syncTimeout);syncTimeout=setTimeout(sync,1800)};
$('syncNow').onclick=async()=>{try{readCfg();if(!userId)throw Error('Сначала войди');await sync()}catch(e){status(e.message)}};
try{const ss=JSON.parse(sessionStorage.getItem('fh_session')||'null');if(ss&&ss.expires>Date.now()+20000){token=ss.token;userId=ss.userId;$('logout').hidden=false;status('Авторизован')}}catch{}
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});setInterval(()=>{if(!document.hidden){render();sync()}},60000);
if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

function activateView(view){
 for(const n of ['home','tasks','schedule','notes','more','habits']){const id='view'+n[0].toUpperCase()+n.slice(1);const el=$(id);if(el)el.hidden=n!==view;}
 document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{activateView(b.dataset.view)}));
$('navAdd').addEventListener('click',()=>openTask());
$('moreNotes').addEventListener('click',()=>activateView('notes'));

$('quickTasks').addEventListener('click',()=>activateView('tasks'));
$('homeAllTasks').addEventListener('click',()=>activateView('tasks'));
$('homeAllHabits').addEventListener('click',()=>activateView('habits'));$('nextLesson').addEventListener('click',()=>activateView('schedule'));
$('homeTaskList').addEventListener('change',e=>{const x=e.target.closest('[data-home-check]');if(!x)return;const t=state.tasks.find(t=>t.id===x.dataset.homeCheck&&!t.deleted);if(t){t.done=x.checked;t.updatedAt=Date.now();save();}});

$('moreSettings').addEventListener('click',()=>$('settings').click());
$('scheduleCalendar').onclick=()=>{selectedDay=new Date().getDay();render()};
$('scheduleMenu').onclick=()=>$('editSchedule').click();
$('taskMenu').onclick=()=>$('navAdd').click();
function filterVisibleTasks(){const q=$('taskSearchInput').value.trim().toLocaleLowerCase('ru');document.querySelectorAll('#viewTasks .task').forEach(el=>{el.hidden=q&&!el.textContent.toLocaleLowerCase('ru').includes(q)})}
$('taskSearchButton').onclick=()=>{const wrap=$('taskSearchWrap');wrap.hidden=!wrap.hidden;if(wrap.hidden){$('taskSearchInput').value='';filterVisibleTasks()}else $('taskSearchInput').focus()};
$('taskSearchInput').addEventListener('input',filterVisibleTasks);
$('notesSearch').onclick=()=>toast('Поиск появится вместе с редактором заметок');
$('notesMenu').onclick=()=>toast('Раздел заметок ещё в разработке');

render();if(userId)sync();
})();
