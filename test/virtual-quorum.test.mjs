import test from 'node:test';
import assert from 'node:assert/strict';
import {assessQuorum} from '../src/virtual-quorum.mjs';
test('does not substitute archive for image',()=>{const q=assessQuorum({request:'send image',desiredEffect:'image delivered',candidates:[{id:'zip',effect:'archive created'}],observations:[{candidateId:'zip',verified:true,kind:'effect'}]});assert.equal(q.status,'UNRESOLVED');});
test('verified effect closes exact goal',()=>{const q=assessQuorum({request:'send image',desiredEffect:'image delivered',candidates:[{id:'photo',effect:'image delivered'}],observations:[{candidateId:'photo',verified:true,kind:'effect'}]});assert.equal(q.status,'VERIFIED_EFFECT');});
test('verified counterexample vetoes self reported success',()=>{const q=assessQuorum({request:'win',desiredEffect:'contest won',candidates:[{id:'run',effect:'contest won'}],observations:[{candidateId:'run',verified:true,kind:'effect'},{candidateId:'run',verified:true,kind:'counterexample'}]});assert.equal(q.status,'UNRESOLVED');});
test('no proof does not close',()=>{assert.equal(assessQuorum({request:'win',desiredEffect:'contest won',candidates:[{id:'run',effect:'contest won'}]}).terminal,false);});
