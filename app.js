(()=>{'use strict';
const $=id=>document.getElementById(id), KEY='flowhub_v1_state',CFG='flowhub_sync_cfg';
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id'+Date.now()+Math.random();
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dayAdd=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d)};
const nowday=()=>localDay(new Date()),days=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const esc=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({tasks:[],lessons:[],habits:[],logs:[],notes:[],theme:'dark'});
let state;try{state={...empty(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{state=empty()}
for(const k of ['tasks','lessons','habits','logs','notes'])if(!Array.isArray(state[k]))state[k]=[];
let cfg;try{cfg=JSON.parse(localStorage.getItem(CFG)||'{}')}catch{cfg={}};
let token=null,userId=null,editTask=null,editHabit=null,logHabit=null,selectedDay=new Date().getDay(),syncBusy=false,dirty=false;
let selectedTaskTab='today',selectedHabitDate=nowday(),weekOffset=0,selectedNoteFilter='all',editingNote=null;
const mondayOf=date=>{const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());d.setDate(d.getDate()-((d.getDay()+6)%7));return d};
const weekKind=date=>{const anchor=Date.UTC(2026,9,26),m=mondayOf(date),diff=Math.round((Date.UTC(m.getFullYear(),m.getMonth(),m.getDate())-anchor)/604800000);return ((diff%2)+2)%2===0?'numerator':'denominator'};
const weekLabel=kind=>kind==='numerator'?'Числитель':'Знаменатель';
const matchesWeek=(lesson,date)=>!lesson.week||lesson.week==='all'||lesson.week===weekKind(date);
function moveWeek(delta){weekOffset+=delta;render()}

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
function changeTheme(){const mode=state.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):state.theme;document.documentElement.dataset.theme=mode;$('themeSelect').value=state.theme;document.querySelectorAll('[data-theme-choice]').forEach(b=>{const on=b.dataset.themeChoice===state.theme;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});}
$('themeSelect').onchange=e=>{state.theme=e.target.value;save()};
function scheduleStatus(lessons,d){const today=d===new Date().getDay(),t=new Date().toTimeString().slice(0,5);if(!today)return '';if(lessons.start<=t&&t<lessons.end)return 'Сейчас идёт';if(lessons.start>t)return 'Далее';return ''}
function render(){renderNotes();changeTheme();const dt=new Date();$('date').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(dt);const open=state.tasks.filter(t=>!t.deleted&&!t.done);$('hello').textContent='Главная';
const monday=mondayOf(dt);monday.setDate(monday.getDate()+weekOffset*7);
const viewedDate=new Date(monday);viewedDate.setDate(monday.getDate()+((selectedDay+6)%7));
const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
const dateFmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});
$('weekLabel').textContent=dateFmt.format(monday)+' — '+dateFmt.format(sunday)+' · '+weekLabel(weekKind(monday));
$('days').innerHTML=[1,2,3,4,5,6,0].map((d,i)=>{const date=new Date(monday);date.setDate(monday.getDate()+i);const current=localDay(date)===nowday();return `<button data-day="${d}" class="${d===selectedDay?'active':''} ${current?'current':''}"><span>${days[d]}</span><strong>${date.getDate()}</strong></button>`}).join('');
const nowMin=dt.getHours()*60+dt.getMinutes();
const upcomingLessons=[];
for(let offset=0;offset<14;offset++){
 const date=new Date(dt);date.setDate(dt.getDate()+offset);
 for(const l of state.lessons.filter(x=>!x.deleted&&Number(x.day)===date.getDay()&&matchesWeek(x,date))){
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
const lessons=state.lessons.filter(x=>!x.deleted&&Number(x.day)===selectedDay&&matchesWeek(x,viewedDate)).sort((a,b)=>a.start.localeCompare(b.start));
$('scheduleList').innerHTML=lessons.length?lessons.map(l=>`<div class="lesson ${(weekOffset===0&&localDay(viewedDate)===nowday()&&scheduleStatus(l,selectedDay)==='Сейчас идёт')?'now':''}"><div class="lesson-time">${esc(l.start)}<br>${esc(l.end)}</div><div><div class="lesson-name">${esc(l.name)}</div><div class="lesson-room">${esc(l.room)}</div>${weekOffset===0&&localDay(viewedDate)===nowday()&&scheduleStatus(l,selectedDay)?`<div class="lesson-status">${scheduleStatus(l,selectedDay)}</div>`:''}</div></div>`).join(''):'<div class="empty">На этот день пары не добавлены</div>';
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
$('todayList').innerHTML=tasksHtml(todayTasks);$('upcomingList').innerHTML=tasksHtml(up);$('somedayList').innerHTML=tasksHtml(none);$('doneCount').textContent=done.length;$('doneList').innerHTML=tasksHtml(done);renderHabits();$('moreAccountStatus').textContent=userId?'Авторизован':'Не выполнен вход';$('syncBadge').textContent=userId?'Облачная синхронизация подключена · офлайн доступ':'Данные на устройстве · офлайн доступ';}
const HABIT_ICONS={
book:'<path d="M12 6c-2.5-1.8-5.2-2-9-1.4v14.6c3.8-.6 6.5-.4 9 1.4 2.5-1.8 5.2-2 9-1.4V4.6c-3.8-.6-6.5-.4-9 1.4z"/><path d="M12 6v14.6"/>',
sport:'<path d="M6 8v8m-3-6v4m6-8v12m9-10v8m3-6v4m-6-8v12M3 12h18"/>',
water:'<path d="M12 2c-3 5-7 9-7 13a7 7 0 0 0 14 0c0-4-4-8-7-13z"/><path d="M9 17a3 3 0 0 0 3 3"/>',
language:'<path d="M4 6h13M10 3v3m5 0c-.3 5-4.1 9-9 12m1-9c.8 2.8 3.4 5.8 7 7"/><path d="m15 20 3-8 3 8m-5-2h4"/>',
study:'<path d="m3 9 9-5 9 5-9 5-9-5z"/><path d="M7 12v5c3 2 7 2 10 0v-5M21 9v7"/>',
music:'<path d="M9 18V5l11-2v13"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
health:'<path d="M12 21s-9-5.7-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.3-9 12-9 12z"/><path d="M12 8v7m-3.5-3.5h7"/>',
habit:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3.5 3.5L17 9"/>'
};
const HABIT_LABELS={book:'Книга',sport:'Спорт',water:'Вода',language:'Язык',study:'Учёба',music:'Музыка',health:'Здоровье',habit:'Другое'};
const habitSVG=icon=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(HABIT_ICONS[icon]||HABIT_ICONS.habit)+'</svg>';
function renderHabitIconChoices(){
 $('habitIconChoices').innerHTML=Object.keys(HABIT_ICONS).map(icon=>'<button type="button" class="habit-icon-choice '+($('habitIcon').value===icon?'is-selected':'')+'" data-icon-choice="'+icon+'" aria-pressed="'+($('habitIcon').value===icon)+'"><span class="habit-icon habit-icon-'+icon+'">'+habitSVG(icon)+'</span><span>'+HABIT_LABELS[icon]+'</span></button>').join('');
}
$('habitIconChoices').addEventListener('click',e=>{const b=e.target.closest('[data-icon-choice]');if(!b)return;$('habitIcon').value=b.dataset.iconChoice;renderHabitIconChoices()});
let activityMonthOffset=0;
function renderHabits(){const today=nowday(),habits=state.habits.filter(h=>!h.deleted);$('habitCount').textContent=habits.length;
const weekMonday=dayAdd(today,-((new Date().getDay()+6)%7));
$('habitWeek').innerHTML=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((label,i)=>{const date=dayAdd(weekMonday,i);return `<button type="button" data-habit-date="${date}" class="${date===selectedHabitDate?'selected':''}" ${date>today?'disabled':''} aria-pressed="${date===selectedHabitDate}" aria-label="${label}, ${date}">${label}</button>`}).join('');
$('habitList').innerHTML=habits.length?habits.map(h=>{const v=valueFor(h.id,selectedHabitDate),pct=Math.min(100,Math.round(v/h.target*100));const icon=h.icon||'habit';return `<div class="habit"><div class="habit-top"><div class="habit-identity"><span class="habit-icon habit-icon-${esc(icon)}" aria-hidden="true">${habitSVG(icon)}</span><div><div class="habit-name">${esc(h.name)}</div><div class="habit-sub">${v} / ${h.target} ${h.unit==='done'?'выполнено':esc(h.unit)} ${selectedHabitDate===today?'сегодня':'за выбранный день'}</div></div><div class="habit-actions"><button data-log="${h.id}" aria-label="Отметить ${esc(h.name)}">＋</button><button data-habit-edit="${h.id}" aria-label="Изменить ${esc(h.name)}">✎</button></div></div><div class="habit-progress"><span style="width:${pct}%"></span></div></div>`}).join(''):'<div class="empty">Добавь первую привычку, например «Чтение».</div>';
const monday=new Date();const dow=(monday.getDay()+6)%7;monday.setDate(monday.getDate()-dow);const start=localDay(monday);$('weeklyStats').innerHTML=habits.length?habits.map(h=>{let total=0,daysDone=0;for(let i=0;i<7;i++){const date=dayAdd(start,i);if(date>today)break;const v=valueFor(h.id,date);total+=v;if(v>=h.target)daysDone++}return `<div class="stat-row"><span>${esc(h.name)} · ${daysDone} дн.</span><strong>${total} ${h.unit==='done'?'раз':esc(h.unit)}</strong></div>`}).join(''):'<div class="hint">Здесь появятся итоги недели.</div>';
const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+activityMonthOffset);const year=base.getFullYear(),month=base.getMonth(),daysInMonth=new Date(year,month+1,0).getDate();const monthName=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(base);const first=new Date(year,month,1),firstDow=(first.getDay()+6)%7;let completed=0,activeDays=0;const cells=Array.from({length:daysInMonth},(_,i)=>{const date=localDay(new Date(year,month,i+1)),future=date>today,count=future?0:habits.filter(h=>valueFor(h.id,date)>=h.target).length;if(count)activeDays++;completed+=count;const ratio=habits.length?count/habits.length:0,lvl=count===0?0:ratio<.34?1:ratio<.75?2:3;return `<div class="activity-day level${lvl} ${date===today?'today':''} ${future?'future':''}" data-day="${i+1}" title="${date}: ${future?'Будущий день':count+' из '+habits.length+' привычек выполнено'}" aria-label="${date}: ${future?'Будущий день':count+' из '+habits.length+' привычек выполнено'}"></div>`});const headers=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span>${d}</span>`).join(''),blank=Array.from({length:firstDow},()=>'<span class="activity-spacer"></span>').join('');$('activityGrid').innerHTML=`<div class="activity-month-heading"><strong>${monthName}</strong><span>Листай влево или вправо</span></div><div class="activity-summary"><strong>${activeDays} <small>дней с прогрессом</small></strong><span>${completed} выполнений</span></div><div class="activity-weekdays">${headers}</div><div class="activity-calendar">${blank+cells.join('')}</div><div class="activity-legend"><span>Меньше</span><i class="level0"></i><i class="level1"></i><i class="level2"></i><i class="level3"></i><span>Больше</span></div>`;}
const activityEl=$('activityGrid');let activityGesture=null;activityEl.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;activityGesture={x:e.clientX,y:e.clientY}});activityEl.addEventListener('pointerup',e=>{if(!activityGesture)return;const dx=e.clientX-activityGesture.x,dy=e.clientY-activityGesture.y;activityGesture=null;if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.3)return;const step=dx<0?1:-1;if(activityMonthOffset+step>0)return;activityMonthOffset+=step;renderHabits()});activityEl.addEventListener('pointercancel',()=>activityGesture=null);
$('habitWeek').addEventListener('click',e=>{const b=e.target.closest('[data-habit-date]');if(b&&!b.disabled){selectedHabitDate=b.dataset.habitDate;renderHabits()}});
function valueFor(id,date){return state.logs.filter(x=>!x.deleted&&x.habitId===id&&x.date===date).reduce((v,x)=>v+Number(x.amount||0),0)}
$('weekPrev').onclick=()=>moveWeek(-1);$('weekNext').onclick=()=>moveWeek(1);
let swipeStart=null;const swipeArea=$('scheduleSwipe');swipeArea.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;swipeStart={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});swipeArea.addEventListener('touchend',e=>{if(!swipeStart||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-swipeStart.x,dy=e.changedTouches[0].clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.4)moveWeek(dx<0?1:-1)},{passive:true});swipeArea.addEventListener('touchcancel',()=>{swipeStart=null});
$('days').onclick=e=>{let b=e.target.closest('[data-day]');if(b){selectedDay=Number(b.dataset.day);render()}};
$('add').onclick=()=>openTask();$('todayList').parentElement.addEventListener('click',taskClicked);$('upcomingList').addEventListener('click',taskClicked);$('somedayList').addEventListener('click',taskClicked);$('doneList').addEventListener('click',taskClicked);
function taskClicked(e){const b=e.target.closest('[data-edit]');if(b)openTask(b.dataset.edit)};
for(const id of ['todayList','upcomingList','somedayList','doneList'])$(id).addEventListener('change',e=>{const x=e.target.closest('[data-check]');if(!x)return;const t=state.tasks.find(t=>t.id===x.dataset.check);if(t){t.done=x.checked;t.updatedAt=Date.now();save()}});
function openTask(id){editTask=id||null;const t=state.tasks.find(x=>x.id===id);$('taskTitle').textContent=t?'Изменить задачу':'Новая задача';$('taskName').value=t?.name||'';$('taskNote').value=t?.note||'';const due=t?.due||nowday();$('taskWhen').value=t?(!t.due?'none':t.due===nowday()?'today':t.due===dayAdd(nowday(),1)?'tomorrow':'date'):'today';$('taskDate').value=due;$('taskReminder').value=t?.reminderTime||'';$('dateInputWrap').hidden=$('taskWhen').value!=='date';$('reminderWrap').hidden=$('taskWhen').value==='none';$('deleteTask').hidden=!t;$('taskDialog').showModal()}
$('taskWhen').onchange=()=>{$('dateInputWrap').hidden=$('taskWhen').value!=='date';$('reminderWrap').hidden=$('taskWhen').value==='none'};$('taskForm').onsubmit=e=>{e.preventDefault();const name=$('taskName').value.trim();if(!name)return;const w=$('taskWhen').value,due=w==='none'?null:w==='today'?nowday():w==='tomorrow'?dayAdd(nowday(),1):$('taskDate').value;if(w==='date'&&!due){toast('Выбери дату');return}const t=state.tasks.find(t=>t.id===editTask);const reminderTime=due?$('taskReminder').value:'';const fields={name,note:$('taskNote').value,due,reminderTime,reminderSentAt:null,updatedAt:Date.now()};if(t)Object.assign(t,fields);else state.tasks.push({id:uid(),done:false,...fields});$('taskDialog').close();save()};
$('deleteTask').onclick=()=>{const t=state.tasks.find(t=>t.id===editTask);if(t){t.deleted=true;t.updatedAt=Date.now();$('taskDialog').close();save()}};
$('editSchedule').onclick=()=>{$('lessonDay').value=selectedDay;$('lessonWeek').value=weekKind(viewedWeekDate());renderLessonEdit();$('scheduleDialog').showModal()};
function viewedWeekDate(){const m=mondayOf(new Date());m.setDate(m.getDate()+weekOffset*7);return m}
function renderLessonEdit(){const day=Number($('lessonDay').value);$('editLessons').innerHTML=state.lessons.filter(x=>!x.deleted&&x.day===day).sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`<div class="edit-lesson"><span>${esc(l.start)} ${esc(l.name)} · ${l.week==='numerator'?'Числитель':l.week==='denominator'?'Знаменатель':'Каждую неделю'}</span><button data-delete-lesson="${l.id}" aria-label="Удалить пару">✕</button></div>`).join('')};$('lessonDay').onchange=renderLessonEdit;
$('lessonForm').onsubmit=e=>{e.preventDefault();const start=$('lessonStart').value,end=$('lessonEnd').value;if(end<=start){toast('Конец должен быть позже начала');return}state.lessons.push({id:uid(),day:Number($('lessonDay').value),week:$('lessonWeek').value,name:$('lessonName').value.trim(),start,end,room:$('lessonRoom').value.trim(),updatedAt:Date.now()});$('lessonName').value='';$('lessonRoom').value='';renderLessonEdit();save()};
$('editLessons').onclick=e=>{const b=e.target.closest('[data-delete-lesson]');if(b){const t=state.lessons.find(x=>x.id===b.dataset.deleteLesson);if(t){t.deleted=true;t.updatedAt=Date.now();renderLessonEdit();save()}}};$('clearLessons').onclick=()=>{if(!confirm('Удалить все пары этого дня?'))return;const day=Number($('lessonDay').value);state.lessons.filter(l=>l.day===day&&!l.deleted).forEach(l=>{l.deleted=true;l.updatedAt=Date.now()});renderLessonEdit();save()};
$('addHabit').onclick=()=>openHabit();$('habitList').onclick=e=>{const ed=e.target.closest('[data-habit-edit]'),log=e.target.closest('[data-log]');if(ed)openHabit(ed.dataset.habitEdit);if(log)openLog(log.dataset.log)};
function openHabit(id){editHabit=id||null;const h=state.habits.find(h=>h.id===id);$('habitTitle').textContent=h?'Изменить привычку':'Новая привычка';$('habitName').value=h?.name||'';$('habitUnit').value=h?.unit||'страниц';$('habitTarget').value=h?.target||10;$('habitIcon').value=h?.icon||'habit';renderHabitIconChoices();$('deleteHabit').hidden=!h;$('habitDialog').showModal()};
$('habitUnit').onchange=()=>{if($('habitUnit').value==='done')$('habitTarget').value=1};
$('habitForm').onsubmit=e=>{e.preventDefault();const name=$('habitName').value.trim(),unit=$('habitUnit').value,target=unit==='done'?1:Number($('habitTarget').value);if(!name||!Number.isInteger(target)||target<1||target>100000)return;const h=state.habits.find(h=>h.id===editHabit);const fields={name,unit,target,icon:$('habitIcon').value,updatedAt:Date.now()};if(h)Object.assign(h,fields);else state.habits.push({id:uid(),...fields});$('habitDialog').close();save()};
$('deleteHabit').onclick=()=>{const h=state.habits.find(h=>h.id===editHabit);if(h){h.deleted=true;h.updatedAt=Date.now();$('habitDialog').close();save()}};
function openLog(id){logHabit=id;const h=state.habits.find(h=>h.id===id);$('habitLogTitle').textContent=h?.name||'Привычка';$('habitLogDate').value=nowday();$('habitLogAmount').value=h?.unit==='done'?1:Math.max(1,h?.target||1);$('habitLogDialog').showModal()};
$('habitLogForm').onsubmit=e=>{e.preventDefault();const date=$('habitLogDate').value,amount=Number($('habitLogAmount').value),h=state.habits.find(x=>x.id===logHabit);if(!date||!h||!Number.isInteger(amount)||amount<0||amount>100000)return;const existing=state.logs.find(x=>x.habitId===logHabit&&x.date===date&&!x.deleted);if(existing){existing.amount=amount;existing.updatedAt=Date.now()}else state.logs.push({id:uid(),habitId:logHabit,date,amount,updatedAt:Date.now()});$('habitLogDialog').close();save()};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
$('settings').onclick=()=>{$('supabaseUrl').value=cfg.url||'';$('supabaseKey').value=cfg.key||'';$('settingsDialog').showModal()};
$('exportData').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download=`flowhub-${nowday()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
$('importData').onchange=async e=>{try{const text=await e.target.files[0].text(),obj=JSON.parse(text);if(!['tasks','lessons','habits','logs'].every(k=>Array.isArray(obj[k])))throw Error('Неподходящий формат');if(!confirm('Объединить данные из файла с текущими?'))return;mergeState(obj);save();toast('Данные импортированы')}catch(err){toast('Ошибка импорта: '+err.message)}finally{e.target.value=''}};
function mergeState(remote){for(const key of ['tasks','lessons','habits','logs','notes']){const map=new Map(state[key].map(x=>[x.id,x]));for(const x of remote[key]||[]){if(!x.id)continue;const old=map.get(x.id);if(!old||Number(x.updatedAt||0)>Number(old.updatedAt||0))map.set(x.id,x)}state[key]=Array.from(map.values())}}
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

function activateView(view){
 for(const n of ['home','tasks','schedule','notes','more','habits']){const id='view'+n[0].toUpperCase()+n.slice(1);const el=$(id);if(el)el.hidden=n!==view;}
 document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{activateView(b.dataset.view)}));
$('navAdd').addEventListener('click',()=>$('addChoiceDialog').showModal());
$('choiceTask').addEventListener('click',()=>{$('addChoiceDialog').close();openTask()});
$('choiceNote').addEventListener('click',()=>{$('addChoiceDialog').close();openNote()});
$('moreSchedule').addEventListener('click',()=>activateView('schedule'));
$('moreHabits').addEventListener('click',()=>activateView('habits'));

$('quickTasks').addEventListener('click',()=>activateView('tasks'));
$('homeAllTasks').addEventListener('click',()=>activateView('tasks'));
$('homeAllHabits').addEventListener('click',()=>activateView('habits'));$('nextLesson').addEventListener('click',()=>activateView('schedule'));
$('homeTaskList').addEventListener('change',e=>{const x=e.target.closest('[data-home-check]');if(!x)return;const t=state.tasks.find(t=>t.id===x.dataset.homeCheck&&!t.deleted);if(t){t.done=x.checked;t.updatedAt=Date.now();save();}});

document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{state.theme=b.dataset.themeChoice;save()}));
$('moreAccount').onclick=()=>$('settings').click();
$('moreNotifications').onclick=()=>{updateReminderPermission();$('reminderDialog').showModal()};
$('moreBackup').onclick=()=>$('dataDialog').showModal();
$('importDataButton').onclick=()=>$('importData').click();
$('scheduleCalendar').onclick=()=>{weekOffset=0;selectedDay=new Date().getDay();render()};
$('scheduleMenu').onclick=()=>$('editSchedule').click();
$('taskMenu').onclick=()=>openTask();
function filterVisibleTasks(){const q=$('taskSearchInput').value.trim().toLocaleLowerCase('ru');document.querySelectorAll('#viewTasks .task').forEach(el=>{el.hidden=q&&!el.textContent.toLocaleLowerCase('ru').includes(q)})}
$('taskSearchButton').onclick=()=>{const wrap=$('taskSearchWrap');wrap.hidden=!wrap.hidden;if(wrap.hidden){$('taskSearchInput').value='';filterVisibleTasks()}else $('taskSearchInput').focus()};
$('taskSearchInput').addEventListener('input',filterVisibleTasks);
function renderNotes(){const q=$('noteSearchInput').value.trim().toLocaleLowerCase('ru');const names={study:'Учёба',personal:'Личное',list:'Списки'};const found=state.notes.filter(n=>!n.deleted&&(selectedNoteFilter==='all'||n.category===selectedNoteFilter)&&(!q||(n.title+' '+n.body+' '+(n.checklist||[]).map(x=>x.text).join(' ')).toLocaleLowerCase('ru').includes(q))).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(b.updatedAt||0)-(a.updatedAt||0));$('notesList').innerHTML=found.length?found.map(n=>'<button type="button" class="note-card" data-note-open="'+esc(n.id)+'"><span class="note-card-meta">'+(n.pinned?'📌 · ':'')+(names[n.category]||'Личное')+'</span><strong>'+esc(n.title||'Без названия')+'</strong><span class="note-card-body">'+esc((n.category==='list'&&n.checklist?.length?n.checklist.map(x=>(x.done?'☑ ':'☐ ')+x.text).join('\n'):n.body||'').slice(0,160))+'</span></button>').join(''):'<div class="empty">Заметок пока нет. Нажми «+», чтобы создать.</div>'}
let noteDraftItems=[];
function renderNoteChecklist(n){noteDraftItems=(n?.checklist||[]).map(x=>({...x}));if(n?.category==='list'&&!noteDraftItems.length&&n?.body){noteDraftItems=n.body.split('\n').filter(Boolean).map(text=>({id:uid(),text,done:false}))}renderChecklistFields()}
function renderChecklistFields(){const isList=$('noteCategory').value==='list';$('noteTextField').hidden=isList;$('noteChecklistField').hidden=!isList;$('noteChecklistItems').innerHTML=noteDraftItems.map((it,i)=>'<div class="checklist-edit-row"><input type="checkbox" data-check-done="'+i+'" '+(it.done?'checked':'')+' aria-label="Отметить пункт"><input data-check-text="'+i+'" value="'+esc(it.text||'')+'" placeholder="Пункт списка"><button type="button" data-check-remove="'+i+'" aria-label="Удалить пункт">×</button></div>').join('')}
$('noteCategory').onchange=()=>{if($('noteCategory').value==='list'&&!noteDraftItems.length&&$('noteBody').value.trim()){noteDraftItems=$('noteBody').value.split('\n').filter(Boolean).map(text=>({id:uid(),text,done:false}))}renderChecklistFields()};
$('noteAddItem').onclick=()=>{noteDraftItems.push({id:uid(),text:'',done:false});renderChecklistFields();$('noteChecklistItems').querySelector('[data-check-text]:last-of-type')?.focus()};
$('noteChecklistItems').oninput=e=>{const i=e.target.dataset.checkText;if(i!==undefined)noteDraftItems[Number(i)].text=e.target.value};
$('noteChecklistItems').onchange=e=>{const i=e.target.dataset.checkDone;if(i!==undefined)noteDraftItems[Number(i)].done=e.target.checked};
$('noteChecklistItems').onclick=e=>{const i=e.target.dataset.checkRemove;if(i!==undefined){noteDraftItems.splice(Number(i),1);renderChecklistFields()}};
function openNote(id){editingNote=id||null;const n=state.notes.find(x=>x.id===id&&!x.deleted);$('noteTitle').textContent=n?'Редактировать заметку':'Новая заметка';$('noteName').value=n?.title||'';$('noteBody').value=n?.body||'';$('noteCategory').value=n?.category||'study';$('notePinned').checked=!!n?.pinned;renderNoteChecklist(n);$('noteDelete').hidden=!n;$('noteDialog').showModal()}
$('notesList').onclick=e=>{const b=e.target.closest('[data-note-open]');if(b)openNote(b.dataset.noteOpen)};
document.querySelectorAll('[data-note-filter]').forEach(b=>b.onclick=()=>{selectedNoteFilter=b.dataset.noteFilter;document.querySelectorAll('[data-note-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderNotes()});
$('notesSearch').onclick=()=>{const input=$('noteSearchInput'),wrap=$('noteSearchWrap');wrap.classList.toggle('open');if(wrap.classList.contains('open'))input.focus();else{input.value='';renderNotes()}};
$('noteSearchInput').oninput=renderNotes;
$('notesMenu').onclick=()=>openNote();
$('noteForm').onsubmit=e=>{e.preventDefault();const title=$('noteName').value.trim(),body=$('noteBody').value.trim();const isList=$('noteCategory').value==='list';const checklist=isList?noteDraftItems.filter(x=>x.text.trim()).map(x=>({...x,text:x.text.trim()})):[];if(!title&&!body&&!checklist.length){toast('Заполни заголовок или содержание');return}const n=state.notes.find(x=>x.id===editingNote);const data={title,body,checklist:isList?checklist:[],category:$('noteCategory').value,pinned:$('notePinned').checked,updatedAt:Date.now()};if(n)Object.assign(n,data);else state.notes.push({id:uid(),...data});$('noteDialog').close();save()};
$('noteDelete').onclick=()=>{const n=state.notes.find(x=>x.id===editingNote);if(n){n.deleted=true;n.updatedAt=Date.now();$('noteDialog').close();save()}};


function updateReminderPermission(){const supported='Notification' in window&&window.isSecureContext;const permission='Notification' in window?Notification.permission:'unsupported';const local=location.protocol==='file:';const message=!supported?'Уведомления недоступны в этом окружении. Открой FlowHub по HTTPS.':permission==='granted'?'Уведомления разрешены браузером.':permission==='denied'?'Уведомления заблокированы. Проверь разрешения сайта в браузере.':local?'Для локального файла разрешение может не сохраняться. Открой FlowHub по HTTPS.':'Разрешение пока не выдано (статус браузера: '+permission+').';$('reminderPermission').textContent=message;$('enableReminders').disabled=!supported||permission==='granted'||permission==='denied';return permission;}
$('enableReminders').onclick=async()=>{if(!('Notification' in window)||!window.isSecureContext){updateReminderPermission();return}try{const result=await Notification.requestPermission();updateReminderPermission();if(result!=='granted')toast('Браузер вернул статус: '+result+'. Попробуй через HTTPS')}catch(err){toast('Не удалось запросить разрешение: '+err.message)}};
$('testReminder').onclick=async()=>{const p=updateReminderPermission();if(p!=='granted'){toast('Статус уведомлений: '+p+'. Проверь разрешение сайта или открой через HTTPS');return}try{if(location.protocol!=='file:'&&'serviceWorker' in navigator){const reg=await navigator.serviceWorker.ready;await reg.showNotification('FlowHub',{body:'Проверка напоминаний работает',tag:'flowhub-test-'+Date.now()})}else{new Notification('FlowHub',{body:'Проверка напоминаний работает'})}toast('Тестовое уведомление отправлено')}catch(err){toast('Ошибка уведомления: '+err.message)}};
const reminderSeen=new Set();
function checkReminders(){const now=new Date(),today=nowday(),currentTime=now.toTimeString().slice(0,5);for(const task of state.tasks){if(task.deleted||task.done||!task.due||!task.reminderTime||task.due!==today||task.reminderTime>currentTime)continue;const key=task.id+'|'+task.due+'|'+task.reminderTime;if(reminderSeen.has(key)||task.reminderSentAt===key)continue;reminderSeen.add(key);task.reminderSentAt=key;localStorage.setItem(KEY,JSON.stringify(state));if('Notification' in window&&Notification.permission==='granted'){new Notification('FlowHub · Напоминание',{body:task.name,tag:'flowhub-task-'+task.id})}else toast('Напоминание: '+task.name)}}
setInterval(checkReminders,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders()});checkReminders();

render();if(userId)sync();
})();
