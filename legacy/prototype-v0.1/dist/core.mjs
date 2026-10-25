import {training} from './training.mjs';

export const STORE_KEY = 'relais-maman-demo-v1';
export const labels = {transport:'Déplacement',cost:'Coût des soins',time:'Disponibilité',understanding:'Compréhension',human:'À écouter',health:'Message de santé'};
export const statuses = {new:'À écouter',planned:'Solution organisée',completed:'Soin confirmé'};
const stop = new Set('je tu il elle nous vous ils elles le la les un une des de du au aux à et ou mais pour mon ma mes ce cette ces se en est sont ai pas ne que qui peut plus très me moi avec dans par on'.split(' '));
export const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const tokens = s => normalize(s).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(t=>t.length>2&&!stop.has(t));

export function train(data) {
  const vocabulary=new Set(), classes={}; let total=0;
  for(const [label,examples] of Object.entries(data)) {
    const counts={};let count=0;total+=examples.length;
    for(const example of examples) for(const token of tokens(example)){vocabulary.add(token);counts[token]=(counts[token]||0)+1;count++;}
    classes[label]={counts,count,documents:examples.length};
  }
  return {vocabulary,classes,total};
}
const model=train(training);
// Conservative routing cue only: this is not symptom triage or a medical model.
export function healthCue(s) {
  const n=normalize(s);
  return /saign|respir|convuls|inconscien|evanoui|fievre|douleur|vomis|malade|suicid|violence|frappe|maltrait|medicament|allerg|symptome/.test(n);
}
export function classify(text, fitted=model) {
  if(healthCue(text)) return {label:'health',source:'safety-rule',review:true,score:null,recognized:0};
  const ts=tokens(text),known=ts.filter(t=>fitted.vocabulary.has(t));
  if(known.length<2)return {label:'human',source:'abstention',review:true,score:null,recognized:known.length};
  const scores=Object.entries(fitted.classes).map(([label,c])=>({label,log:Math.log(c.documents/fitted.total)+known.reduce((sum,t)=>sum+Math.log(((c.counts[t]||0)+1)/(c.count+fitted.vocabulary.size)),0)}));
  const max=Math.max(...scores.map(s=>s.log));const denominator=scores.reduce((a,s)=>a+Math.exp(s.log-max),0);
  const ranked=scores.map(s=>({label:s.label,score:Math.exp(s.log-max)/denominator})).sort((a,b)=>b.score-a.score);
  const abstain=ranked[0].score<.62 || ranked[0].score-ranked[1].score<.18;
  return {label:abstain?'human':ranked[0].label,suggestion:ranked[0].label,source:abstain?'abstention':'naive-bayes',review:true,score:ranked[0].score,recognized:known.length};
}
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lome'});
export function seed() {
  return {schema:1,demo:true,updatedAt:new Date().toISOString(),
    women:[
      {id:'ama',name:'Ama K.',initials:'AK',occupation:'Revendeuse',area:'Maritime · zone fictive',child:'Koffi · 4 mois',language:'Français · démonstration'},
      {id:'abiba',name:'Abiba T.',initials:'AT',occupation:'Agricultrice',area:'Maritime · zone fictive',child:'Grossesse · suivi',language:'Français · démonstration'},
      {id:'akou',name:'Akou D.',initials:'AD',occupation:'Couturière',area:'Maritime · zone fictive',child:'Adjo · 8 mois',language:'Français · démonstration'}
    ],
    appointments:[
      {id:'ap-ama',womanId:'ama',title:'Votre suivi après la naissance',kind:'mère',date:'2026-10-28',time:'08:30',facility:'Centre partenaire A · fictif',status:'scheduled'},
      {id:'ap-koffi',womanId:'ama',title:'Le rendez-vous de Koffi',kind:'enfant',date:'2026-10-29',time:'09:00',facility:'Centre partenaire A · fictif',status:'scheduled'},
      {id:'ap-abiba',womanId:'abiba',title:'Consultation de suivi',kind:'mère',date:'2026-10-28',time:'10:00',facility:'Centre partenaire B · fictif',status:'scheduled'},
      {id:'ap-akou',womanId:'akou',title:'Visite de suivi mère-enfant',kind:'enfant',date:'2026-10-29',time:'08:00',facility:'Centre partenaire A · fictif',status:'scheduled'}
    ],
    requests:[
      {id:'req-abiba',womanId:'abiba',appointmentId:'ap-abiba',text:"Je n'ai pas de transport depuis mon village.",category:'transport',classification:classify("Je n'ai pas de transport depuis mon village."),status:'new',consent:true,createdAt:'2026-10-25T08:00:00.000Z',history:[{at:'2026-10-25T08:00:00.000Z',text:'Demande fictive reçue ; accord de partage donné.'}]},
      {id:'req-akou',womanId:'akou',appointmentId:'ap-akou',text:'Je voudrais connaître les frais de la consultation.',category:'cost',classification:classify('Je voudrais connaître les frais de la consultation.'),status:'planned',consent:true,createdAt:'2026-10-25T08:15:00.000Z',plan:{date:'2026-10-29',time:'08:00',action:'Vérifier les frais avec le centre et les expliquer à Akou.',cost:'À vérifier auprès du centre'},history:[{at:'2026-10-25T08:15:00.000Z',text:'Demande fictive reçue.'},{at:'2026-10-25T09:00:00.000Z',text:'Action organisée par l’agent · exemple fictif.'}]}
    ]};
}
export function validState(s) {
  try {
    const short=(x,n=200)=>typeof x==='string'&&x.length<=n;
    const time=x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x||'');
    const instant=x=>short(x,40)&&!Number.isNaN(Date.parse(x));
    if(!s||s.schema!==1||s.demo!==true||!Array.isArray(s.women)||!Array.isArray(s.appointments)||!Array.isArray(s.requests))return false;
    if(!s.women.length||s.women.length>20||s.appointments.length>100||s.requests.length>200)return false;
    if([s.women,s.appointments,s.requests].some(items=>new Set(items.map(x=>x?.id)).size!==items.length))return false;
    return s.women.every(w=>w&&['id','name','initials','occupation','area','child','language'].every(k=>short(w[k])))&&
      s.appointments.every(a=>a&&short(a.id)&&short(a.title)&&short(a.facility)&&validDate(a.date)&&time(a.time)&&['scheduled','completed'].includes(a.status)&&['mère','enfant'].includes(a.kind)&&s.women.some(w=>w.id===a.womanId))&&
      s.requests.every(r=>r&&short(r.id)&&s.women.some(w=>w.id===r.womanId)&&s.appointments.some(a=>a.id===r.appointmentId&&a.womanId===r.womanId)&&Object.hasOwn(statuses,r.status)&&Object.hasOwn(labels,r.category)&&instant(r.createdAt)&&Array.isArray(r.history)&&r.history.length<=100&&r.history.every(h=>h&&instant(h.at)&&short(h.text,1000))&&short(r.text,1000)&&r.consent===true&&r.classification&&short(r.classification.source,40)&&(r.status==='new'||(r.plan&&short(r.plan.action,600)&&short(r.plan.cost,120)&&validDate(r.plan.date)&&time(r.plan.time)))&&(r.status!=='completed'||(r.confirmation&&validDate(r.confirmation.date)&&['centre','asc'].includes(r.confirmation.source))));
  }catch{return false;}
}
export function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
function copy(s){if(!validState(s))throw Error('Les données locales sont invalides. Réinitialisez la démonstration.');return structuredClone(s);}
export function createRequest(s,{womanId,appointmentId,text,category,consent},now=new Date()) {
  if(!consent)throw Error('Votre accord est nécessaire pour transmettre cette demande.');
  if(!text?.trim()||text.trim().length>1000)throw Error('Expliquez votre besoin en quelques mots (1 000 caractères maximum).');
  const next=copy(s);const appointment=next.appointments.find(a=>a.id===appointmentId&&a.womanId===womanId);
  if(!appointment||appointment.status==='completed')throw Error('Choisissez un rendez-vous encore à suivre.');
  if(next.requests.some(r=>r.appointmentId===appointmentId&&r.status!=='completed'))throw Error('Une demande est déjà ouverte pour ce rendez-vous. Votre agent peut la retrouver.');
  const classification=classify(text);
  const chosen=Object.hasOwn(labels,category)&&category!=='health'&&category!=='human'?category:null;
  const label=classification.label==='health'?'health':chosen||classification.label;
  const at=now.toISOString();
  next.requests.unshift({id:'req-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)),womanId,appointmentId,text:text.trim(),category:label,classification:{...classification,...(chosen&&classification.label!=='health'?{source:'explicit-choice'}:{})},status:'new',consent:true,createdAt:at,history:[{at,text:'Demande reçue avec accord de partage ; vérification humaine attendue.'}]});
  next.updatedAt=at;return next;
}
export function planRequest(s,id,{date,time,action,cost},now=new Date()) {
  const next=copy(s),r=next.requests.find(r=>r.id===id);
  if(!r||r.status==='completed')throw Error('Ce suivi est déjà terminé ou introuvable.');
  if(r.category==='health')throw Error('Un message de santé demande une prise en charge humaine directe ; il ne peut pas être planifié ici.');
  if(!validDate(date)||date<today()||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('Indiquez une date à partir d’aujourd’hui et une heure valide.');
  if(!action?.trim()||action.trim().length>600)throw Error('Décrivez l’action convenue, en 600 caractères maximum.');
  if((cost||'').length>120)throw Error('Précisez les frais en 120 caractères maximum.');
  r.status='planned';r.plan={date,time,action:action.trim(),cost:cost?.trim()||'À vérifier auprès du centre'};
  const a=next.appointments.find(a=>a.id===r.appointmentId);a.date=date;a.time=time;
  const at=now.toISOString();r.history.push({at,text:'Action et créneau enregistrés par l’agent ; réalisation du soin à confirmer.'});next.updatedAt=at;return next;
}
export function completeRequest(s,id,{date,source,verified},now=new Date()) {
  const next=copy(s),r=next.requests.find(r=>r.id===id);
  if(!r||r.status!=='planned')throw Error('Organisez d’abord une solution pour ce suivi.');
  if(!verified||!['centre','asc'].includes(source))throw Error('La réalisation du soin doit être vérifiée auprès du centre ou d’un agent.');
  if(!validDate(date)||date>today()||date<r.createdAt.slice(0,10))throw Error('La date du soin doit être comprise entre la demande et aujourd’hui.');
  r.status='completed';r.confirmation={date,source};next.appointments.find(a=>a.id===r.appointmentId).status='completed';
  const at=now.toISOString();r.history.push({at,text:`Soin confirmé par ${source==='centre'?'le centre partenaire':'l’agent communautaire'} · date déclarée : ${date}.`});next.updatedAt=at;return next;
}
export function metrics(s){const completed=s.requests.filter(r=>r.status==='completed').length;return {total:s.requests.length,new:s.requests.filter(r=>r.status==='new').length,planned:s.requests.filter(r=>r.status==='planned').length,completed,rate:s.requests.length?Math.round(completed/s.requests.length*100):0};}
