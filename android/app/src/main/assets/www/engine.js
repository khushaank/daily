export const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
export function dateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function fromKey(k){return new Date(`${k}T12:00:00`);}
export function shift(k,n){const d=fromKey(k);d.setDate(d.getDate()+n);return dateKey(d);}
export function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(fromKey(v))&&dateKey(fromKey(v))===v;}
export function due(h,date){if(date<h.startDate||h.endDate&&date>h.endDate)return false;const day=DAYS[fromKey(date).getDay()];return h.repeat==='daily'||h.repeat==='weekdays'&&!['sat','sun'].includes(day)||Array.isArray(h.repeat)&&h.repeat.includes(day);}
export function completionKey(type,id,date){return `${type}|${id}|${date}`;}
export function toggleCompletion(state,type,id,date,today=dateKey()){
  if(!['t','h'].includes(type)||!validDate(date)||date>today)return null;
  const item=(type==='t'?state.tasks:state.habits).find(x=>x.id===id);
  if(!item||type==='t'&&date!==item.date||type==='h'&&!due(item,date))return null;
  const key=completionKey(type,id,date),done=!state.completions[key];
  if(done)state.completions[key]=true;else delete state.completions[key];
  return {item,key,done};
}
export function streak(h,completions,today=dateKey()){let n=0;let date=today;let grace=true;for(let i=0;i<3660&&date>=h.startDate;i++,date=shift(date,-1)){if(!due(h,date))continue;if(completions[completionKey('h',h.id,date)]){n++;grace=false;}else if(grace&&date===today){grace=false;}else break;}return n;}
const categories=['study','practice','review','personal'];
const icons=['book','walk','chess','sun','heart','spark'];
export function normalizePlan(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('The JSON must be an object with tasks and/or habits.');
  if(raw.version!==undefined&&raw.version!==1)throw Error('Use version: 1.');
  if(!Array.isArray(raw.tasks)&&!Array.isArray(raw.habits))throw Error('Add a tasks array, a habits array, or both.');
  if(raw.tasks!==undefined&&!Array.isArray(raw.tasks)||raw.habits!==undefined&&!Array.isArray(raw.habits))throw Error('tasks and habits must be arrays.');
  const used={tasks:new Set(),habits:new Set()};
  function entry(x,type,i){
    const label=`${type}[${i}]`;
    if(!x||typeof x!=='object'||Array.isArray(x))throw Error(`${label} must be an object.`);
    if(typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(x.id))throw Error(`${label}.id must use 1–80 letters, numbers, underscores, or hyphens.`);
    if(used[type].has(x.id))throw Error(`${label}: duplicate id "${x.id}".`);used[type].add(x.id);
    if(typeof x.title!=='string'||!x.title.trim()||x.title.length>160)throw Error(`${label}.title needs 1–160 characters.`);
    const base={id:x.id,title:x.title.trim()};
    if(type==='tasks'){
      if(!validDate(x.date))throw Error(`${label}.date must be a real date in YYYY-MM-DD format.`);
      if(x.minutes!==undefined&&(!Number.isInteger(x.minutes)||x.minutes<1||x.minutes>1440))throw Error(`${label}.minutes must be a whole number from 1 to 1440.`);
      if(x.time!==undefined&&(typeof x.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)))throw Error(`${label}.time must use 24-hour HH:MM format.`);
      if(x.category!==undefined&&!categories.includes(x.category))throw Error(`${label}.category: use study, practice, review, or personal.`);
      if(x.notes!==undefined&&(typeof x.notes!=='string'||x.notes.length>4000))throw Error(`${label}.notes must be text under 4000 characters.`);
      return {...base,date:x.date,minutes:x.minutes||25,category:x.category||'study',...(x.time?{time:x.time}:{}),notes:x.notes||''};
    }
    if(!validDate(x.startDate))throw Error(`${label}.startDate must be a real YYYY-MM-DD date.`);
    if(x.endDate!==undefined&&(!validDate(x.endDate)||x.endDate<x.startDate))throw Error(`${label}.endDate must be on or after startDate.`);
    if(!['daily','weekdays'].includes(x.repeat)&&!(Array.isArray(x.repeat)&&x.repeat.length>0&&x.repeat.every(d=>DAYS.includes(d))&&new Set(x.repeat).size===x.repeat.length))throw Error(`${label}.repeat: use daily, weekdays, or an array like ["mon", "wed", "fri"].`);
    if(x.icon!==undefined&&!icons.includes(x.icon))throw Error(`${label}.icon: use book, walk, chess, sun, heart, or spark.`);
    return {...base,startDate:x.startDate,repeat:x.repeat,icon:x.icon||'heart',...(x.endDate?{endDate:x.endDate}:{})};
  }
  if((raw.tasks?.length||0)>3000||(raw.habits?.length||0)>100)throw Error('Import up to 3,000 tasks and 100 habits at a time.');
  const plan={version:1,tasks:(raw.tasks||[]).map((x,i)=>entry(x,'tasks',i)),habits:(raw.habits||[]).map((x,i)=>entry(x,'habits',i))};
  if(raw.completions!==undefined){
    if(!raw.completions||typeof raw.completions!=='object'||Array.isArray(raw.completions))throw Error('Backup completions must be an object.');
    plan.completions={};
    for(const [key,value] of Object.entries(raw.completions)){
      const parts=key.split('|');if(parts.length!==3||!['t','h'].includes(parts[0])||!/^[a-zA-Z0-9_-]{1,80}$/.test(parts[1])||!validDate(parts[2])||value!==true)throw Error('A completion record in this backup is invalid.');
      plan.completions[key]=true;
    }
  }
  return plan;
}
export function mergeEntries(oldEntries,newEntries){const map=new Map(oldEntries.map(x=>[x.id,x]));newEntries.forEach(x=>map.set(x.id,x));return [...map.values()];}
export function orderTasks(tasks,completions){return [...tasks].sort((a,b)=>Number(!!completions[completionKey('t',a.id,a.date)])-Number(!!completions[completionKey('t',b.id,b.date)])||a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));}
export function tasksOn(tasks,completions,date,today){return orderTasks(tasks.filter(t=>t.date===date||date===today&&t.date<today&&!completions[completionKey('t',t.id,t.date)]),completions);}
