import http from 'node:http';
import fs from 'node:fs';
import {
  applyInteraction,
  evaluateExpertiseFabric,
  fingerprintFocusObject,
  persistDurableFocusObject,
  recoverDurableFocusObject,
} from './focus-object.mjs';
import { canonicalFocusObject } from './focus-object-live-host.mjs';

const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function loadSecondaryFocusObject({ stateFile, seed = canonicalFocusObject } = {}) {
  if (!stateFile) return seed;
  if (fs.existsSync(stateFile)) return recoverDurableFocusObject(stateFile);
  persistDurableFocusObject(stateFile, seed);
  return recoverDurableFocusObject(stateFile);
}

export function renderSecondaryFocusObject(focusObject) {
  const fabric = evaluateExpertiseFabric(focusObject);
  if (!fabric.accepted) throw new Error(`EXPERTISE_HARD_FAIL:${fabric.hardFails.join(',')}`);
  const fingerprint = fingerprintFocusObject(focusObject);
  const confidence = Math.round(fabric.renderedConfidence * 100);
  const rows = focusObject.evidence.map((item) =>
    `<tr data-evidence-id="${esc(item.id)}"><td>${esc(item.id)}</td><td>${esc(item.status)}</td><td>${esc(item.claim)}</td></tr>`
  ).join('');
  const blockers = fabric.unresolvedEvidence.map((id) => `<li data-blocker-id="${esc(id)}">${esc(id)}</li>`).join('') || '<li>none</li>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MondayID Focus Object Secondary Host</title>
<style>body{margin:0;background:#f4f1ea;color:#171717;font:16px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.shell{max-width:860px;margin:6vh auto;padding:26px;border:2px solid #171717;background:#fff}.status{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}.confidence{border:2px solid #171717;background:#f7d774;padding:12px 16px;font:inherit;font-weight:800}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #777;padding:8px;text-align:left}.ops{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ops button{font:inherit;padding:10px;border:1px solid #171717;background:#e8edf2}#receipt{margin-top:18px;white-space:pre-wrap;background:#171717;color:#c9f7ca;padding:12px;min-height:48px}</style></head><body>
<main class="shell" data-secondary-host="true" data-focus-object-id="${esc(focusObject.objectId)}" data-fingerprint="${fingerprint}" data-confidence="${confidence}" data-certainty="${esc(fabric.phenotype.certaintyLabel)}">
<section class="status"><div><small>SECONDARY HOST · independent renderer</small><h1>${esc(focusObject.intent)}</h1><p>${esc(focusObject.delta)}</p></div><button class="confidence" data-secondary-action="confidence" aria-label="Inspect confidence secondary">${confidence}% ${esc(fabric.phenotype.certaintyLabel)}</button></section>
<table aria-label="Evidence ledger"><thead><tr><th>ID</th><th>Status</th><th>Claim</th></tr></thead><tbody>${rows}</tbody></table>
<section aria-label="Unresolved blockers"><h2>Blockers</h2><ul>${blockers}</ul></section>
<nav class="ops" aria-label="Semantic operations"><button data-secondary-operation="inspect">Inspect</button><button data-secondary-operation="reframe">Reframe</button><button data-secondary-operation="act">Act</button><button data-secondary-operation="challenge">Challenge</button></nav>
<pre id="receipt" aria-live="polite">No interaction yet</pre></main>
<script>
const root=document.querySelector('[data-secondary-host]'); const receipt=document.querySelector('#receipt');
async function send(action){const response=await fetch('/interact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});const data=await response.json();if(!response.ok)throw new Error(data.error||'interaction failed');root.dataset.lastOperation=data.semanticOperation;root.dataset.resultingFingerprint=data.receipt.resultingFingerprint;receipt.textContent=JSON.stringify(data,null,2);}
document.querySelector('[data-secondary-action="confidence"]').addEventListener('click',()=>send('confidence'));
for(const button of document.querySelectorAll('[data-secondary-operation]'))button.addEventListener('click',()=>send(button.dataset.secondaryOperation));
</script></body></html>`;
}

export function createFocusObjectSecondaryHost({ focusObject, stateFile } = {}) {
  const activeFocusObject = focusObject ?? loadSecondaryFocusObject({ stateFile });
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, {'content-type':'text/html; charset=utf-8'});
      res.end(renderSecondaryFocusObject(activeFocusObject));
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      const fabric = evaluateExpertiseFabric(activeFocusObject);
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({status:'ok',host:'secondary',fingerprint:fingerprintFocusObject(activeFocusObject),uncertainty:[...activeFocusObject.uncertainty],renderedConfidence:fabric.renderedConfidence,durable:Boolean(stateFile)}));
      return;
    }
    if (req.method === 'POST' && req.url === '/interact') {
      let raw=''; for await (const chunk of req) raw += chunk;
      const {action}=JSON.parse(raw||'{}');
      const event = action === 'confidence' ? {surfaceAction:'tap confident visual state'} : {semanticOperation:action};
      try {
        const result=applyInteraction({focusObject:activeFocusObject,userEvent:event,host:'standalone'});
        if(stateFile) persistDurableFocusObject(stateFile,activeFocusObject);
        res.writeHead(200,{'content-type':'application/json'});
        res.end(JSON.stringify(result));
      } catch(error) {
        res.writeHead(400,{'content-type':'application/json'});
        res.end(JSON.stringify({error:String(error?.message||error)}));
      }
      return;
    }
    res.writeHead(404); res.end('not found');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port=Number(process.env.PORT||4174);
  const stateFile=process.env.FOCUS_OBJECT_STATE_FILE||undefined;
  createFocusObjectSecondaryHost({stateFile}).listen(port,'127.0.0.1',()=>console.log(`MONDAYID_FOCUS_SECONDARY_HOST http://127.0.0.1:${port}`));
}
