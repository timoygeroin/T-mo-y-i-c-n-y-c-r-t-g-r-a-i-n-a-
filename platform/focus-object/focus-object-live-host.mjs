import http from 'node:http';
import fs from 'node:fs';
import { mountFocusObjectSurface, interactWithFocusObjectSurface } from './focus-object-surface.mjs';
import { persistDurableFocusObject, recoverDurableFocusObject } from './focus-object.mjs';

export const canonicalFocusObject = {
  objectId: 'focus:first-product',
  intent: 'Ship the first MondayID Focus Object interaction',
  state: 'ready to ship',
  delta: 'three verified checks, one unresolved blocker',
  evidence: [
    { id: 'E1', claim: 'canonical state exists', status: 'verified' },
    { id: 'E2', claim: 'semantic interaction compiles', status: 'verified' },
    { id: 'E3', claim: 'durable fingerprint survives recovery', status: 'verified' },
    { id: 'B1', claim: 'live user-host rendering is not yet independently observed', status: 'unresolved' },
  ],
  uncertainty: ['B1'],
};

const page = (focusObject) => {
  const mounted = mountFocusObjectSurface(focusObject);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MondayID Focus Object</title>
<style>body{font-family:system-ui;background:#0b0c10;color:#f5f7fb;display:grid;place-items:center;min-height:100vh;margin:0}.focus-object{width:min(720px,90vw);padding:28px;border:1px solid #333;border-radius:24px;background:#14161d}.focus-object header{display:flex;gap:18px;align-items:center}.focus-object button{background:#202532;color:#fff;border:1px solid #46506a;border-radius:12px;padding:10px 14px}.blocker{color:#ff9b9b}.delta{color:#b6bfd3}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}#interaction-receipt{margin-top:18px;padding:12px;background:#0d1017;border-radius:12px;white-space:pre-wrap}</style></head><body>
${mounted.html}
<pre id="interaction-receipt" aria-live="polite">No interaction yet</pre>
<script>
const root = document.querySelector('.focus-object');
const receipt = document.querySelector('#interaction-receipt');
async function send(action) {
  const response = await fetch('/interact', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action})});
  if (!response.ok) throw new Error('interaction failed');
  const data = await response.json();
  root.dataset.lastOperation = data.semanticOperation;
  root.dataset.resultingFingerprint = data.receipt.resultingFingerprint;
  receipt.textContent = JSON.stringify(data, null, 2);
}
document.querySelector('[data-action="confidence"]').addEventListener('click', () => send('confidence'));
for (const button of document.querySelectorAll('[data-operation]')) button.addEventListener('click', () => send(button.dataset.operation));
</script></body></html>`;
};

export function loadFocusObject({ stateFile, seed = canonicalFocusObject } = {}) {
  if (!stateFile) return seed;
  if (fs.existsSync(stateFile)) return recoverDurableFocusObject(stateFile);
  persistDurableFocusObject(stateFile, seed);
  return recoverDurableFocusObject(stateFile);
}

export function createFocusObjectLiveHost({ focusObject, stateFile } = {}) {
  let activeFocusObject = focusObject ?? loadFocusObject({ stateFile });
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, {'content-type':'text/html; charset=utf-8'});
      res.end(page(activeFocusObject));
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      const mounted = mountFocusObjectSurface(activeFocusObject);
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({status:'ok', fingerprint:mounted.fingerprint, uncertainty:[...activeFocusObject.uncertainty], durable:Boolean(stateFile), releaseAllowed:mounted.releaseGate.allowed}));
      return;
    }
    if (req.method === 'POST' && req.url === '/interact') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { action, evidenceResolution } = JSON.parse(raw || '{}');
      try {
        const result = interactWithFocusObjectSurface({
          focusObject: activeFocusObject,
          surfaceAction: action,
          evidenceResolution,
        });
        activeFocusObject = result.canonicalFocusObject;
        if (stateFile) persistDurableFocusObject(stateFile, activeFocusObject);
        res.writeHead(200, {'content-type':'application/json'});
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, {'content-type':'application/json'});
        res.end(JSON.stringify({error:String(error?.message || error)}));
      }
      return;
    }
    res.writeHead(404); res.end('not found');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4173);
  const stateFile = process.env.FOCUS_OBJECT_STATE_FILE || undefined;
  createFocusObjectLiveHost({ stateFile }).listen(port, '127.0.0.1', () => console.log(`MONDAYID_FOCUS_LIVE_HOST http://127.0.0.1:${port}`));
}
