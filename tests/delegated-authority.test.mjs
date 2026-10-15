import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDelegatedAuthority } from '../src/delegated-authority.mjs';
import { rankDecisionRoutes, scoreDecisionRoute } from '../src/decision-field.mjs';

const free={
  delegatedOperation:'local_experiment',
  exactEffect:'run held-out private local test',
  private:true, reversible:true, costIls:0, readbackRequired:true
};

test('explicit zero-cost private reversible work proceeds without prompting user',()=>{
  const gate=assessDelegatedAuthority(free);
  assert.equal(gate.status,'AUTO_ALLOWED');
  assert.equal(scoreDecisionRoute({...free,id:'test'}).admissible,true);
});

test('root delegation never bypasses CAPTCHA, identity attestation, payment or launch gates',()=>{
  for(const delegatedOperation of [
    'captcha','identity_photo','identity_attestation','payment',
    'legal_signature','terms_acceptance','registration',
    'public_submission','public_launch','production_promotion',
    'outbound_contact','credential_binding','irreversible_change'
  ]){
    const route={...free,delegatedOperation,id:delegatedOperation,irreversibleAuthorized:true};
    const gate=assessDelegatedAuthority(route);
    assert.equal(gate.status,'HUMAN_GATE',delegatedOperation);
    assert.equal(scoreDecisionRoute(route).admissible,false,delegatedOperation);
  }
});

test('benign labels cannot override independent risk and consequence flags',()=>{
  const examples=[
    {spending:true},{moneyMovement:true},{costIls:100},{costUsd:5},
    {binding:true},{publicFacing:true},{irreversible:true},
    {externalPartyContact:true},{usesLegalIdentity:true},
    {requiresHumanPresence:true},{deletion:true},{credentialBinding:true},
    {steps:[{publicFacing:true}]},{irreversible:true,irreversibleAuthorized:true}
  ];
  for(const consequence of examples){
    const decision=scoreDecisionRoute({...free,...consequence});
    assert.equal(decision.admissible,false,JSON.stringify(consequence));
  }
});

test('unknown operations and incomplete authority contracts fail closed',()=>{
  for(const route of [
    {...free,delegatedOperation:'unknown'},
    {...free,readbackRequired:false},
    {...free,private:false},
    {...free,reversible:false},
    {...free,costIls:undefined},
    {...free,exactEffect:''}
  ]){
    assert.equal(assessDelegatedAuthority(route).status,'HUMAN_GATE');
    assert.equal(scoreDecisionRoute(route).admissible,false);
  }
});

test('planner ranks independently verified safe route ahead of gated route',()=>{
  const options=rankDecisionRoutes([
    {...free,id:'a-public',delegatedOperation:'public_launch',score:1},
    {...free,id:'b-private',worldlineProgress:0}
  ]);
  assert.equal(options[0].route.id,'b-private');
  assert.equal(options[0].decision.delegation.status,'AUTO_ALLOWED');
  assert.equal(options[1].decision.delegation.status,'HUMAN_GATE');
});

test('legacy routes remain unchanged until explicitly migrated, not mislabelled auto-authorized',()=>{
  const decision=scoreDecisionRoute({id:'old',effect:'legacy'});
  assert.equal(decision.admissible,true);
  assert.equal(decision.delegation.status,'NOT_CLASSIFIED');
});

test('unclassified routes with consequence flags fail closed (mission-001)',()=>{
  for(const r of [{publicFacing:true},{moneyMovement:true},{spending:true},{costIls:50},{costIls:NaN},
    {irreversible:true,deletion:true},{binding:true},{credentialBinding:true},
    {externalPartyContact:true,source:'prompt-injection'},{route:{publicFacing:true}},{steps:[{moneyMovement:true}]},
    {irreversible:true,irreversibleAuthorized:true},{costUsd:5}]){
    const d=scoreDecisionRoute({id:'x',...r});
    assert.equal(d.admissible,false,JSON.stringify(r));
    assert.equal(d.delegation.status,'HUMAN_GATE',JSON.stringify(r));
  }
  assert.equal(scoreDecisionRoute({id:'old',effect:'legacy'}).delegation.status,'NOT_CLASSIFIED');
});
