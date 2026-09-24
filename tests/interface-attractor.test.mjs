import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVerifiedCandidateSurface } from '../src/interface.mjs';

const fulfilled = result => ({
  ok:true,
  revision:'r1',
  results:[result],
  frontier:{blocked:[]},
  intents:{i:{id:'i',status:'fulfilled'}}
});

test('user-visible candidate releases only after runtime and steering verification', () => {
  const surface=renderVerifiedCandidateSurface(fulfilled({
    ok:true,
    action:{id:'a1'},
    result:{
      text:'Monday continuation',
      evidence:{releaseVerdict:{ok:true}}
    },
    steering:{ok:true,hits:[]},
    verification:{ok:true,mode:'readback'}
  }));
  assert.equal(surface.released,true);
  assert.equal(surface.state,'VERIFIED');
  assert.equal(surface.message,'Monday continuation');
});

test('user-visible emitter cannot bypass a Monday attractor veto', () => {
  const surface=renderVerifiedCandidateSurface(fulfilled({
    ok:true,
    action:{id:'a1'},
    result:{text:'How can I help you?'},
    steering:{ok:false,hits:['GENERIC_HELPDESK_RESET']},
    verification:{ok:true}
  }));
  assert.equal(surface.released,false);
  assert.equal(surface.code,'MONDAY_SURFACE_ATTRACTOR_VETO');
});

test('human surface refuses text while any intent remains active', () => {
  const cycle=fulfilled({
    ok:true,
    action:{id:'a1'},
    result:{text:'candidate'},
    steering:{ok:true,hits:[]},
    verification:{ok:true}
  });
  cycle.intents.i.status='active';
  const surface=renderVerifiedCandidateSurface(cycle);
  assert.equal(surface.released,false);
  assert.equal(surface.code,'MONDAY_SURFACE_NOT_VERIFIED');
});
