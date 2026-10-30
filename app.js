(()=>{'use strict';
const $=id=>document.getElementById(id), KEY='flowhub_v1_state',CFG='flowhub_sync_cfg';
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id'+Date.now()+Math.random();
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dayAdd=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d)};
const nowday=()=>localDay(new Date()),days=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const esc=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({tasks:[],lessons:[],habits:[],logs:[],notes:[],theme:'dark',weekAnchor:null});
let state;try{state={...empty(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{state=empty()}
for(const k of ['tasks','lessons','habits','logs','notes'])if(!Array.isArray(state[k]))state[k]=[];
let cfg;try{cfg=JSON.parse(localStorage.getItem(CFG)||'{}')}catch{cfg={}};
let token=null,userId=null,editTask=null,editHabit=null,logHabit=null,selectedDay=new Date().getDay(),syncBusy=false,dirty=false;
const toast=(msg)=>{const x=$('toast');x.textContent=msg;x.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.remove('show'),3000)};
function save(){localStorage.setItem(KEY,JSON.stringify(state));dirty=true;render();scheduleSync()}
function changeTheme(){const mode=state.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):state.theme;document.documentElement.dataset.theme=mode;$('themeSelect').value=state.theme;$('theme').textContent=mode==='dark'?'☀':'☾';}
$('theme').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';save()};$('themeSelect').onchange=e=>{state.theme=e.target.value;save()};
function mondayOf(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()-(x.getDay()+6)%7);return x}
function selectedWeek(date=new Date()){const a=state.weekAnchor;if(a&&a.date){const delta=Math.round((mondayOf(date)-mondayOf(new Date(a.date+'T12:00:00')))/604800000);return delta%2===0?a.type:(a.type==='numerator'?'denominator':'numerator')}const mon=mondayOf(date),start=mondayOf(new Date(mon.getFullYear(),0,4));const n=Math.round((mon-start)/604800000);return n%2===0?'numerator':'denominator'}
const weekName=x=>x==='numerator'?'Числитель':'Знаменатель';
const validLesson=(l,week)=>!l.deleted&&(!l.week||l.week==='all'||l.week===week);
function scheduleStatus(lessons,d){const today=d===new Date().getDay(),t=new Date().toTimeString().slice(0,5);if(!today)return '';if(lessons.start<=t&&t<lessons.end)return 'Сейчас идёт';if(lessons.start>t)return 'Далее';return ''}
let activeView='home',taskFilter='today';
function showView(view){
 if(!['home','tasks','habits','notes'].includes(view))return;
 activeView=view;
 for(const section of document.querySelectorAll('[data-view]'))section.hidden=section.dataset.view!==view;
 for(const tab of document.querySelectorAll('[data-nav]')){const selected=tab.dataset.nav===view;tab.classList.toggle('active',selected);if(selected)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 window.scrollTo({top:0,behavior:'instant'});
}
document.querySelector('.bottom-nav').addEventListener('click',e=>{const tab=e.target.closest('[data-nav]');if(tab)showView(tab.dataset.nav)});
function render(){changeTheme();const dt=new Date();$('date').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(dt);const open=state.tasks.filter(t=>!t.deleted&&!t.done);$('summary').textContent=`${open.filter(t=>t.due===nowday()).length} дел на сегодня · ${state.habits.filter(h=>!h.deleted).length} привычек`;
$('weekLabel').textContent=weekName(selectedWeek());$('days').innerHTML=[1,2,3,4,5,6,0].map(d=>`<button data-day="${d}" class="${d===selectedDay?'active':''} ${d===dt.getDay()?'current':''}">${days[d]}</button>`).join('');
const lessons=state.lessons.filter(x=>validLesson(x,selectedWeek())&&x.day===selectedDay).sort((a,b)=>a.start.localeCompare(b.start));
$('scheduleList').innerHTML=lessons.length?lessons.map(l=>`<div class="lesson ${scheduleStatus(l,selectedDay)==='Сейчас идёт'?'now':''}"><div class="lesson-time">${esc(l.start)}<br>${esc(l.end)}</div><div><div class="lesson-name">${esc(l.name)}</div><div class="lesson-room">${esc(l.room)}</div>${scheduleStatus(l,selectedDay)?`<div class="lesson-status">${scheduleStatus(l,selectedDay)}</div>`:''}</div></div>`).join(''):'<div class="empty">На этот день пары не добавлены</div>';
const today=nowday(), active=state.tasks.filter(t=>!t.deleted&&!t.done),done=state.tasks.filter(t=>!t.deleted&&t.done).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));const todayTasks=active.filter(t=>t.due&&t.due<=today),up=active.filter(t=>t.due&&t.due>today).sort((a,b)=>a.due.localeCompare(b.due)),none=active.filter(t=>!t.due);$('todayCount').textContent=todayTasks.length;
const priorityRank=t=>t.priority==='high'?0:t.priority==='low'?2:1;const sortedTasks=a=>[...a].sort((x,y)=>priorityRank(x)-priorityRank(y)||(x.due||'').localeCompare(y.due||''));const tasksHtml=a=>a.length?sortedTasks(a).map(t=>`<article class="task"><input class="task-check" type="checkbox" data-check="${t.id}" ${t.done?'checked':''} aria-label="Выполнить ${esc(t.name)}"><div class="task-info"><div class="task-name">${esc(t.name)}${t.priority==='high'?' <span class="priority-label high">Важно</span>':t.priority==='low'?' <span class="priority-label low">Низкий</span>':''}</div>${t.note?`<div class="task-note">${esc(t.note)}</div>`:''}${t.due?`<div class="task-due">${esc(t.due)}</div>`:''}</div><button class="task-edit" aria-label="Изменить дело" data-edit="${t.id}">✎</button></article>`).join(''):'<div class="empty">Пока ничего нет</div>';
$('todayList').innerHTML=tasksHtml(todayTasks);$('upcomingList').innerHTML=tasksHtml(up);$('somedayList').innerHTML=tasksHtml(none);$('doneCount').textContent=done.length;$('doneList').innerHTML=tasksHtml(done);const buckets={today:todayTasks,upcoming:up,none};$('filteredTaskList').innerHTML=tasksHtml(buckets[taskFilter]);$('taskOverview').textContent=active.length+' активных · '+done.length+' выполнено';renderHabits();renderDashboard();renderNotes();$('syncBadge').textContent=userId?'Облачная синхронизация подключена · офлайн доступ':'Данные на устройстве · офлайн доступ';}
function renderDashboard(){
 const now=new Date(), t=now.toTimeString().slice(0,5),today=nowday();
 const lessons=state.lessons.filter(l=>validLesson(l,selectedWeek(now))&&l.day===now.getDay()).sort((a,b)=>a.start.localeCompare(b.start));
 const current=lessons.find(l=>l.start<=t&&t<l.end),next=lessons.find(l=>l.start>t),lesson=current||next;
 $('nextLesson').innerHTML=lesson?'<span class="next-tag">'+(current?'Сейчас идёт':'Скоро начнётся')+'</span><strong>'+esc(lesson.name)+'</strong><span class="next-meta">'+esc(lesson.start+' – '+lesson.end)+(lesson.room?' · '+esc(lesson.room):'')+'</span>':'<strong>На сегодня пар больше нет</strong><span class="next-meta">Можно заняться своими делами</span>';
 const tasks=state.tasks.filter(x=>!x.deleted&&x.due&&x.due<=today),done=tasks.filter(x=>x.done).length;
 const habits=state.habits.filter(x=>!x.deleted),habitsDone=habits.filter(x=>valueFor(x.id,today)>=x.target).length;
 $('homeTaskText').textContent=done+' из '+tasks.length;$('homeHabitText').textContent=habitsDone+' из '+habits.length;
 $('homeTaskRing').style.setProperty('--progress',(tasks.length?done/tasks.length*100:0)+'%');
 $('homeHabitRing').style.setProperty('--progress',(habits.length?habitsDone/habits.length*100:0)+'%');
 const remaining=tasks.filter(x=>!x.done);
 $('homeTodayList').innerHTML=remaining.length?remaining.slice(0,5).map(x=>'<article class="task"><input class="task-check" type="checkbox" data-check="'+esc(x.id)+'" aria-label="Выполнить '+esc(x.name)+'"><div class="task-info"><div class="task-name">'+esc(x.name)+'</div>'+(x.note?'<div class="task-note">'+esc(x.note)+'</div>':'')+'</div><button class="task-edit" data-edit="'+esc(x.id)+'" aria-label="Редактировать">✎</button></article>').join(''):'<div class="empty">Все дела на сегодня выполнены</div>';
}
$('openAllTasks').onclick=()=>showView('tasks');
$('homeTodayList').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openTask(b.dataset.edit)});
$('homeTodayList').addEventListener('change',e=>{const c=e.target.closest('[data-check]');if(!c)return;const t=state.tasks.find(x=>x.id===c.dataset.check);if(t){t.done=c.checked;t.updatedAt=Date.now();save()}});
function renderHabits(){const today=nowday(),habits=state.habits.filter(h=>!h.deleted);$('habitCount').textContent=habits.length;
$('habitList').innerHTML=habits.length?habits.map(h=>{const v=valueFor(h.id,today),pct=Math.min(100,Math.round(v/h.target*100));return `<div class="habit"><div class="habit-top"><div><div class="habit-name">${esc(h.name)}</div><div class="habit-sub">${v} / ${h.target} ${h.unit==='done'?'выполнено':esc(h.unit)} сегодня</div></div><div class="habit-actions"><button data-quick-habit="${h.id}" class="habit-quick ${v>=h.target?'is-done':''}" aria-label="${v>=h.target?'Снять отметку':'Отметить выполнение'} ${esc(h.name)}">${v>=h.target?'✓':'+1'}</button><button data-log="${h.id}" aria-label="Ввести значение ${esc(h.name)}">⋯</button><button data-habit-edit="${h.id}" aria-label="Изменить ${esc(h.name)}">✎</button></div></div><div class="habit-progress"><span style="width:${pct}%"></span></div></div>`}).join(''):'<div class="empty">Добавь первую привычку, например «Чтение».</div>';
$('habitOverview').textContent=habits.filter(h=>valueFor(h.id,today)>=h.target).length+' из '+habits.length+' привычек выполнено сегодня';const monday=new Date();const dow=(monday.getDay()+6)%7;monday.setDate(monday.getDate()-dow);const start=localDay(monday);$('weeklyStats').innerHTML=habits.length?habits.map(h=>{let total=0,daysDone=0;for(let i=0;i<7;i++){const date=dayAdd(start,i);if(date>today)break;const v=valueFor(h.id,date);total+=v;if(v>=h.target)daysDone++}return `<div class="stat-row"><span>${esc(h.name)} · ${daysDone} дн.</span><strong>${total} ${h.unit==='done'?'раз':esc(h.unit)}</strong></div>`}).join(''):'<div class="hint">Здесь появятся итоги недели.</div>';
const weekDone=habits.reduce((sum,h)=>sum+Array.from({length:7},(_,i)=>dayAdd(start,i)).filter(d=>d<=today&&valueFor(h.id,d)>=h.target).length,0);$('habitWeekSummary').textContent=weekDone+' выполнений за неделю';const dates=Array.from({length:28},(_,i)=>dayAdd(today,i-27));const monthDone=dates.reduce((sum,d)=>sum+habits.filter(h=>valueFor(h.id,d)>=h.target).length,0);$('habitMonthSummary').textContent=monthDone+' выполнений за последние 28 дней';$('activityGrid').innerHTML=dates.map(date=>{const count=habits.filter(h=>valueFor(h.id,date)>=h.target).length;const lvl=count===0?0:count>=3?3:count===2?2:1;return `<div class="activity-day level${lvl} ${date===today?'today':''}" data-day="${date.slice(-2)}" title="${date}: ${count} привычек выполнено" aria-label="${date}: ${count} привычек выполнено"></div>`}).join('');}
function valueFor(id,date){return state.logs.filter(x=>!x.deleted&&x.habitId===id&&x.date===date).reduce((v,x)=>v+Number(x.amount||0),0)}
$('days').onclick=e=>{let b=e.target.closest('[data-day]');if(b){selectedDay=Number(b.dataset.day);render()}};
$('add').onclick=()=>openTask();$('todayList').parentElement.addEventListener('click',taskClicked);$('upcomingList').addEventListener('click',taskClicked);$('somedayList').addEventListener('click',taskClicked);$('doneList').addEventListener('click',taskClicked);$('filteredTaskList').addEventListener('click',taskClicked);
$('quickTaskForm').onsubmit=e=>{e.preventDefault();const name=$('quickTaskName').value.trim();if(!name)return;state.tasks.push({id:uid(),name,note:'',due:taskFilter==='today'?nowday():taskFilter==='upcoming'?dayAdd(nowday(),1):null,priority:'normal',done:false,updatedAt:Date.now()});$('quickTaskName').value='';save()};
for(const b of document.querySelectorAll('[data-task-filter]'))b.onclick=()=>{taskFilter=b.dataset.taskFilter;for(const x of document.querySelectorAll('[data-task-filter]'))x.classList.toggle('active',x===b);render()};
function taskClicked(e){const b=e.target.closest('[data-edit]');if(b)openTask(b.dataset.edit)};
for(const id of ['todayList','upcomingList','somedayList','filteredTaskList','doneList'])$(id).addEventListener('change',e=>{const x=e.target.closest('[data-check]');if(!x)return;const t=state.tasks.find(t=>t.id===x.dataset.check);if(t){t.done=x.checked;t.updatedAt=Date.now();save()}});
function openTask(id){editTask=id||null;const t=state.tasks.find(x=>x.id===id);$('taskTitle').textContent=t?'Изменить дело':'Новое дело';$('taskName').value=t?.name||'';$('taskNote').value=t?.note||'';$('taskPriority').value=t?.priority||'normal';const due=t?.due||nowday();$('taskWhen').value=t?(!t.due?'none':t.due===nowday()?'today':t.due===dayAdd(nowday(),1)?'tomorrow':'date'):'today';$('taskDate').value=due;$('dateInputWrap').hidden=$('taskWhen').value!=='date';$('deleteTask').hidden=!t;$('taskDialog').showModal()}
$('taskWhen').onchange=()=>$('dateInputWrap').hidden=$('taskWhen').value!=='date';$('taskForm').onsubmit=e=>{e.preventDefault();const name=$('taskName').value.trim();if(!name)return;const w=$('taskWhen').value,due=w==='none'?null:w==='today'?nowday():w==='tomorrow'?dayAdd(nowday(),1):$('taskDate').value;if(w==='date'&&!due){toast('Выбери дату');return}const t=state.tasks.find(t=>t.id===editTask);const fields={name,note:$('taskNote').value,due,priority:$('taskPriority').value,updatedAt:Date.now()};if(t)Object.assign(t,fields);else state.tasks.push({id:uid(),done:false,...fields});$('taskDialog').close();save()};
$('deleteTask').onclick=()=>{const t=state.tasks.find(t=>t.id===editTask);if(t){t.deleted=true;t.updatedAt=Date.now();$('taskDialog').close();save()}};
$('switchWeek').onclick=()=>{state.weekAnchor={date:nowday(),type:selectedWeek()==='numerator'?'denominator':'numerator'};save()};
$('editSchedule').onclick=()=>{$('lessonDay').value=selectedDay;renderLessonEdit();$('scheduleDialog').showModal()};
function renderLessonEdit(){const day=Number($('lessonDay').value);$('editLessons').innerHTML=state.lessons.filter(x=>!x.deleted&&x.day===day).sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`<div class="edit-lesson"><span>${esc(l.start)} ${esc(l.name)} · ${l.week==='numerator'?'Ч':l.week==='denominator'?'З':'Каждую'}</span><button data-delete-lesson="${l.id}" aria-label="Удалить пару">✕</button></div>`).join('')};$('lessonDay').onchange=renderLessonEdit;
$('lessonForm').onsubmit=e=>{e.preventDefault();const start=$('lessonStart').value,end=$('lessonEnd').value;if(end<=start){toast('Конец должен быть позже начала');return}state.lessons.push({id:uid(),day:Number($('lessonDay').value),name:$('lessonName').value.trim(),week:$('lessonWeek').value,start,end,room:$('lessonRoom').value.trim(),updatedAt:Date.now()});$('lessonName').value='';$('lessonRoom').value='';renderLessonEdit();save()};
$('editLessons').onclick=e=>{const b=e.target.closest('[data-delete-lesson]');if(b){const t=state.lessons.find(x=>x.id===b.dataset.deleteLesson);if(t){t.deleted=true;t.updatedAt=Date.now();renderLessonEdit();save()}}};$('clearLessons').onclick=()=>{if(!confirm('Удалить все пары этого дня?'))return;const day=Number($('lessonDay').value);state.lessons.filter(l=>l.day===day&&!l.deleted).forEach(l=>{l.deleted=true;l.updatedAt=Date.now()});renderLessonEdit();save()};
$('addBulkLessons').onclick=()=>{
 const input=$('bulkLessons').value.trim();if(!input){toast('Введи хотя бы одну пару');return}
 const lines=input.split(/\n/).map(x=>x.trim()).filter(Boolean),parsed=[],errors=[];
 for(let i=0;i<lines.length;i++){
  const parts=lines[i].split('|').map(x=>x.trim()),match=/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/.exec(parts[0]||'');
  if(!match||!parts[1]||parts.length>3){errors.push(i+1);continue}
  const start=match[1].padStart(5,'0'),end=match[2].padStart(5,'0');
  if(start>=end||Number(start.slice(0,2))>23||Number(end.slice(0,2))>23||Number(start.slice(3))>59||Number(end.slice(3))>59||parts[1].length>100||(parts[2]||'').length>100){errors.push(i+1);continue}
  parsed.push({start,end,name:parts[1],room:parts[2]||''})
 }
 if(errors.length){toast('Проверь строки: '+errors.join(', '));return}
 const day=Number($('lessonDay').value),week=$('lessonWeek').value;
 for(const l of parsed)state.lessons.push({...l,id:uid(),day,week,updatedAt:Date.now()});
 $('bulkLessons').value='';renderLessonEdit();save();toast('Добавлено пар: '+parsed.length)
};
$('copyLessons').onclick=()=>{
 const from=Number($('lessonDay').value),to=Number($('copyLessonDay').value),week=$('lessonWeek').value;
 if(from===to){toast('Выбери другой день');return}
 const source=state.lessons.filter(x=>!x.deleted&&x.day===from&&(!x.week||x.week===week||week==='all'));
 if(!source.length){toast('На исходном дне нет подходящих пар');return}
 if(!confirm('Скопировать '+source.length+' пар? Существующие пары останутся.'))return;
 const ts=Date.now();for(const l of source){const {id,deleted,updatedAt,...other}=l;state.lessons.push({...other,id:uid(),day:to,updatedAt:ts})}
 renderLessonEdit();save();toast('Скопировано пар: '+source.length)
};
$('addHabit').onclick=()=>openHabit();$('habitList').onclick=e=>{const ed=e.target.closest('[data-habit-edit]'),log=e.target.closest('[data-log]');if(ed)openHabit(ed.dataset.habitEdit);if(log)openLog(log.dataset.log);const quick=e.target.closest('[data-quick-habit]');if(quick)quickHabit(quick.dataset.quickHabit)};
function quickHabit(id){const h=state.habits.find(x=>x.id===id&&!x.deleted);if(!h)return;const day=nowday(),value=valueFor(id,day),desired=value>=h.target?0:Math.min(h.target,value+(h.unit==='done'?1:1));const entries=state.logs.filter(x=>x.habitId===id&&x.date===day&&!x.deleted);const first=entries[0];if(first){first.amount=desired;first.updatedAt=Date.now();for(const extra of entries.slice(1)){extra.deleted=true;extra.updatedAt=Date.now()}}else state.logs.push({id:uid(),habitId:id,date:day,amount:desired,updatedAt:Date.now()});save()}
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
let editingNote=null;
const noteSafe=n=>Array.isArray(n.items)?n.items:[];
function renderNotes(){
 const q=$('notesSearch').value.trim().toLocaleLowerCase('ru-RU');
 const arr=state.notes.filter(n=>!n.deleted).filter(n=>[n.title,n.body,(n.tags||[]).join(' '),...noteSafe(n).map(i=>i.text)].join(' ').toLocaleLowerCase('ru-RU').includes(q)).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(b.updatedAt||0)-(a.updatedAt||0));
 $('notesList').innerHTML=arr.length?arr.map(n=>{
 const tags=(Array.isArray(n.tags)?n.tags:[]).map(t=>'<span class="note-tag">'+esc(t)+'</span>').join('');
 const content=n.type==='checklist'?'<div class="note-preview">'+noteSafe(n).slice(0,6).map(i=>'<label class="note-check-row"><input type="checkbox" data-note-check="'+esc(n.id)+'" data-item-id="'+esc(i.id)+'" '+(i.done?'checked':'')+'><span class="'+(i.done?'note-strike':'')+'">'+esc(i.text)+'</span></label>').join('')+'</div>':'<p class="note-preview">'+esc(n.body||'')+'</p>';
 return '<article class="note-card"><button class="note-open" type="button" data-note-edit="'+esc(n.id)+'"><strong>'+(n.pinned?'♢ ':'')+esc(n.title||'Без названия')+'</strong></button>'+content+'<div class="note-tags">'+tags+'</div></article>'}).join(''):'<div class="empty">'+(q?'Ничего не найдено':'Заметок пока нет')+'</div>';
}
function openNote(id){
 editingNote=id||null;const n=state.notes.find(x=>x.id===id&&!x.deleted);
 $('noteTitle').textContent=n?'Изменить заметку':'Новая заметка';$('noteName').value=n?.title||'';
 $('noteType').value=n?.type||'text';$('noteBody').value=n?.type==='checklist'?noteSafe(n).map(i=>i.text).join('\n'):(n?.body||'');
 $('noteTags').value=(n?.tags||[]).join(', ');$('notePinned').checked=!!n?.pinned;$('deleteNote').hidden=!n;
 $('noteChecklistHint').hidden=$('noteType').value!=='checklist';$('noteDialog').showModal();
}
$('newNote').onclick=()=>openNote();
$('notesSearch').addEventListener('input',renderNotes);
$('noteType').onchange=()=>$('noteChecklistHint').hidden=$('noteType').value!=='checklist';
$('notesList').addEventListener('click',e=>{const b=e.target.closest('[data-note-edit]');if(b)openNote(b.dataset.noteEdit)});
$('notesList').addEventListener('change',e=>{const input=e.target.closest('[data-note-check]');if(!input)return;const n=state.notes.find(x=>x.id===input.dataset.noteCheck);const item=noteSafe(n).find(x=>x.id===input.dataset.itemId);if(item){item.done=input.checked;n.updatedAt=Date.now();save()}});
$('noteForm').onsubmit=e=>{
 e.preventDefault();const title=$('noteName').value.trim(),body=$('noteBody').value.trim(),type=$('noteType').value;
 if(!title&&!body){toast('Добавь название или содержание');return}
 const n=state.notes.find(x=>x.id===editingNote);
 let items=[];
 if(type==='checklist'){const prior=n?.type==='checklist'?noteSafe(n):[];const used=new Set();
 items=body.split('\n').map(x=>x.trim()).filter(Boolean).map(text=>{const existing=prior.find(x=>x.text===text&&!used.has(x.id));if(existing){used.add(existing.id);return existing}return {id:uid(),text,done:false}})}
 const fields={title,body:type==='text'?body:'',type,items,tags:$('noteTags').value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12),pinned:$('notePinned').checked,updatedAt:Date.now()};
 if(n)Object.assign(n,fields);else state.notes.push({id:uid(),...fields});
 $('noteDialog').close();save();
};
$('deleteNote').onclick=()=>{const n=state.notes.find(x=>x.id===editingNote);if(n&&confirm('Удалить заметку?')){n.deleted=true;n.updatedAt=Date.now();$('noteDialog').close();save()}};
function status(msg){$('syncStatus').textContent=msg}
function readCfg(){const url=$('supabaseUrl').value.trim().replace(/\/$/,'');const key=$('supabaseKey').value.trim();if(!/^https:\/\/[\w.-]+\.supabase\.co$/.test(url)||!key){throw Error('Укажи адрес Supabase и публичный ключ')}cfg={url,key};localStorage.setItem(CFG,JSON.stringify(cfg))}
async function req(path,opts={}){const r=await fetch(cfg.url+'/auth/v1/'+path,{...opts,headers:{'apikey':cfg.key,'Content-Type':'application/json',...opts.headers}});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.msg||data.error_description||data.message||'Ошибка '+r.status);return data}
async function db(method,body){const r=await fetch(cfg.url+'/rest/v1/flowhub_state?user_id=eq.'+encodeURIComponent(userId),{method,headers:{apikey:cfg.key,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body&&JSON.stringify(body)});const data=await r.json().catch(()=>[]);if(!r.ok)throw Error(data.message||'Ошибка базы '+r.status);return data}
async function auth(mode){try{readCfg();const email=$('email').value.trim(),password=$('password').value;if(!email||!password)throw Error('Введи email и пароль');status('Подключение…');const result=await req(mode==='signup'?'signup':'token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});if(!result.access_token){status('Подтверди email, затем войди.');return}token=result.access_token;userId=result.user?.id;sessionStorage.setItem('fh_session',JSON.stringify({token,userId,refresh:result.refresh_token,expires:Date.now()+result.expires_in*1000}));$('logout').hidden=false;status('Вы вошли. Синхронизация включена.');await sync();render()}catch(e){status(e.message)}}
$('signup').onclick=()=>auth('signup');$('login').onclick=()=>auth('login');$('logout').onclick=()=>{token=null;userId=null;sessionStorage.removeItem('fh_session');$('logout').hidden=true;status('Вы вышли');render()};
async function sync(){if(syncBusy||!userId||!token||!navigator.onLine)return;syncBusy=true;try{const rows=await db('GET');if(rows.length){mergeState(rows[0].data||{});localStorage.setItem(KEY,JSON.stringify(state));render()}await db('POST',[{user_id:userId,data:{tasks:state.tasks,lessons:state.lessons,habits:state.habits,logs:state.logs,notes:state.notes}}]);dirty=false;status('Синхронизировано: '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}catch(e){status('Синхронизация: '+e.message)}finally{syncBusy=false}}
let syncTimeout;function scheduleSync(){if(!userId)return;clearTimeout(syncTimeout);syncTimeout=setTimeout(sync,1800)};
$('syncNow').onclick=async()=>{try{readCfg();if(!userId)throw Error('Сначала войди');await sync()}catch(e){status(e.message)}};
try{const ss=JSON.parse(sessionStorage.getItem('fh_session')||'null');if(ss&&ss.expires>Date.now()+20000){token=ss.token;userId=ss.userId;$('logout').hidden=false;status('Авторизован')}}catch{}
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});setInterval(()=>{if(!document.hidden){render();sync()}},60000);
if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
showView('home');render();if(userId)sync();
})();
