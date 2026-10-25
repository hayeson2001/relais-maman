import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,validState,validDate,createRequest,planRequest,completeRequest,metrics,today,classify} from '../dist/core.mjs';

const input={womanId:'ama',appointmentId:'ap-ama',text:'Je travaille au marché toute la matinée et je voudrais changer le rendez-vous.',consent:true};
test('full care loop: consent, need, plan, human confirmation, metrics, immutable input',()=>{
  const initial=seed();const received=createRequest(initial,input);const id=received.requests[0].id;
  assert.equal(initial.requests.length,2);assert.equal(received.requests.length,3);assert.equal(received.requests[0].status,'new');
  const planned=planRequest(received,id,{date:today(),time:'10:30',action:'Créneau fictif convenu avec la mère et le centre.',cost:'À vérifier'});
  assert.equal(received.requests[0].status,'new');assert.equal(planned.requests[0].status,'planned');
  const complete=completeRequest(planned,id,{date:today(),source:'centre',verified:true});
  assert.equal(complete.requests[0].status,'completed');assert.equal(complete.requests[0].history.length,3);
  assert.equal(complete.appointments.find(a=>a.id==='ap-ama').status,'completed');
  assert.deepEqual(metrics(complete),{total:3,new:1,planned:1,completed:1,rate:33});assert.ok(validState(complete));
});
test('request cannot be sent without consent or for another woman’s appointment',()=>{
  assert.throws(()=>createRequest(seed(),{...input,consent:false}),/accord/);
  assert.throws(()=>createRequest(seed(),{...input,appointmentId:'ap-abiba'}),/rendez-vous/);
});
test('an active appointment request cannot be duplicated',()=>{
  const s=createRequest(seed(),input);assert.throws(()=>createRequest(s,input),/déjà ouverte/);
});
test('empty and oversized messages rejected',()=>{
  for(const text of ['   ','a'.repeat(1001)])assert.throws(()=>createRequest(seed(),{...input,text}));
});
test('care cannot be confirmed directly or without human verification',()=>{
  const s=createRequest(seed(),input),id=s.requests[0].id;
  assert.throws(()=>completeRequest(s,id,{date:today(),source:'centre',verified:true}),/d’abord/);
  const p=planRequest(s,id,{date:today(),time:'09:00',action:'Action fictive'});
  assert.throws(()=>completeRequest(p,id,{date:today(),source:'centre',verified:false}),/vérifiée/);
  assert.throws(()=>completeRequest(p,id,{date:today(),source:'ai',verified:true}),/vérifiée/);
});
test('future-dated care, past plans and invalid calendar dates rejected',()=>{
  const s=createRequest(seed(),input),id=s.requests[0].id;
  const p=planRequest(s,id,{date:today(),time:'09:00',action:'Action fictive'});
  assert.throws(()=>completeRequest(p,id,{date:'2099-01-01',source:'centre',verified:true}),/date/);
  assert.throws(()=>planRequest(s,id,{date:'2000-01-01',time:'09:00',action:'Action fictive'}),/date/);
  assert.throws(()=>planRequest(s,id,{date:today(),time:'25:90',action:'Action fictive'}),/heure/);
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-02-28'),true);
});
test('confirmed care cannot be reopened, duplicated, or confirmed twice',()=>{
  const s=createRequest(seed(),input),id=s.requests[0].id;
  const p=planRequest(s,id,{date:today(),time:'09:00',action:'Action fictive'});
  const c=completeRequest(p,id,{date:today(),source:'asc',verified:true});
  assert.throws(()=>planRequest(c,id,{date:today(),time:'09:00',action:'Autre action'}),/terminé/);
  assert.throws(()=>completeRequest(c,id,{date:today(),source:'asc',verified:true}));
  assert.throws(()=>createRequest(c,input),/rendez-vous/);
});
test('health cue takes precedence over selected logistics and blocks logistics planning',()=>{
  const s=createRequest(seed(),{...input,text:'Je saigne et je ne peux pas payer le taxi',category:'cost'}),r=s.requests[0];
  assert.equal(r.category,'health');assert.equal(r.classification.source,'safety-rule');
  assert.throws(()=>planRequest(s,r.id,{date:today(),time:'09:00',action:'Attendre un taxi'}),/prise en charge humaine/);
});
test('unknown language and meaningless text trigger abstention',()=>{
  for(const text of ['akpe na mi','xyz qqq zzz','bonjour'])assert.equal(classify(text).label,'human');
});
test('all model outputs require human review and do not prescribe care',()=>{
  for(const text of ['Je cherche un taxi pour le trajet au dispensaire','Je ne peux pas payer les frais de soins','Je travaille au marché toute la matinée','Je ne comprends pas les documents écrits','Mon bébé est malade']){
    assert.equal(classify(text).review,true);assert.equal(Object.hasOwn(classify(text),'diagnosis'),false);
  }
});
test('incompatible local state and orphan requests rejected',()=>{
  assert.equal(validState(null),false);assert.equal(validState({schema:1,demo:false}),false);
  const s=seed();s.requests[0].womanId='absent';assert.equal(validState(s),false);
  const t=seed();t.requests[0].consent=false;assert.equal(validState(t),false);
  const u=seed();delete u.requests[0].classification;assert.equal(validState(u),false);
  const v=seed();v.requests[0].history=[null];assert.equal(validState(v),false);
  const w=seed();w.women.push(null);assert.equal(validState(w),false);
});
