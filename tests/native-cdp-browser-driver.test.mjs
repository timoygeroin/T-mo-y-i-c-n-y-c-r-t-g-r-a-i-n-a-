import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

import { createNativeCdpBrowserDriver } from '../src/execution/native-cdp-browser-driver.mjs';
import { createBrowserComputerReceptor } from '../src/execution/browser-computer-receptor.mjs';

const candidates=[
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];

async function browserAvailable() {
  for (const candidate of candidates) {
    try { await access(candidate); return true; } catch {}
  }
  return false;
}

test('native CDP driver owns browser navigation, interaction and independent observation', async (t) => {
  if (!(await browserAvailable()) || typeof WebSocket !== 'function') {
    t.skip('native Chromium/WebSocket primitive unavailable on this host');
    return;
  }

  const driver=createNativeCdpBrowserDriver({executableCandidates:candidates});
  try {
    const html='<title>Monday Browser</title><input id="name"><div id="status">ready</div>';
    const opened=await driver.perform({type:'open',url:'data:text/html,'+encodeURIComponent(html)});
    assert.equal(opened.ok,true);

    const filled=await driver.perform({type:'fill',selector:'#name',value:'Monday'});
    assert.equal(filled.ok,true);
    assert.equal(filled.value,'Monday');

    const mutated=await driver.perform({
      type:'evaluate',
      expression:'document.querySelector("#status").textContent=document.querySelector("#name").value+"-owned"; document.querySelector("#status").textContent'
    });
    assert.equal(mutated.ok,true);
    assert.equal(mutated.value,'Monday-owned');

    const observation=await driver.observe({type:'text',selector:'#status'});
    assert.deepEqual(observation,{ok:true,type:'text',selector:'#status',value:'Monday-owned'});
  } finally {
    await driver.close();
  }
});

test('browser receptor verifies through a separate CDP observation', async (t) => {
  if (!(await browserAvailable()) || typeof WebSocket !== 'function') {
    t.skip('native Chromium/WebSocket primitive unavailable on this host');
    return;
  }

  const driver=createNativeCdpBrowserDriver({executableCandidates:candidates});
  const receptor=createBrowserComputerReceptor({driver,name:'mondayid-native-browser'});
  try {
    const html='<title>Proof</title><div id="receipt">initial</div>';
    const action={
      domain:'host',
      effect:'produce and independently read browser effect',
      routeCandidate:{
        kind:'browser',
        steps:[
          {type:'open',url:'data:text/html,'+encodeURIComponent(html)},
          {type:'evaluate',expression:'document.querySelector("#receipt").textContent="browser-verified"'}
        ],
        verification:{
          probe:{type:'text',selector:'#receipt'},
          acceptance:{equals:'browser-verified',ok:true}
        }
      }
    };

    assert.equal(receptor.supports(action),true);
    const result=await receptor.execute(action);
    assert.equal(result.ok,true);
    const verification=await receptor.verify(result,action);
    assert.equal(verification.ok,true);
    assert.equal(verification.mode,'independent-browser-readback');
    assert.equal(verification.observation.value,'browser-verified');
  } finally {
    await driver.close();
  }
});

test('native browser driver rejects a navigation outside configured domains', async (t) => {
  if (!(await browserAvailable()) || typeof WebSocket !== 'function') {
    t.skip('native Chromium/WebSocket primitive unavailable on this host');
    return;
  }
  const driver=createNativeCdpBrowserDriver({executableCandidates:candidates,allowedDomains:['example.com'],allowData:false});
  try {
    const blocked=await driver.perform({type:'open',url:'https://example.org/'});
    assert.equal(blocked.ok,false);
    assert.equal(blocked.code,'BROWSER_URL_NOT_ALLOWED');
  } finally {
    await driver.close();
  }
});
