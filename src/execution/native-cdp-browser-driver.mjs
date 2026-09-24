import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function firstExecutable(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

function allowedUrl(raw, { allowedDomains, allowData }) {
  const parsed = new URL(raw);
  if (parsed.protocol === 'data:') return allowData;
  if (parsed.protocol === 'about:') return raw === 'about:blank';
  if (!['http:','https:'].includes(parsed.protocol)) return false;
  if (!allowedDomains.length) return true;
  return allowedDomains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain));
}

function jsString(value) {
  return JSON.stringify(String(value));
}

export class NativeCdpBrowserDriver {
  constructor({
    executableCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ],
    allowedDomains = [],
    allowData = true,
    launchTimeoutMs = 12_000,
    rpcTimeoutMs = 8_000,
    headless = true
  } = {}) {
    this.executableCandidates = executableCandidates;
    this.allowedDomains = [...allowedDomains];
    this.allowData = allowData;
    this.launchTimeoutMs = launchTimeoutMs;
    this.rpcTimeoutMs = rpcTimeoutMs;
    this.headless = headless;
    this.process = null;
    this.profileDir = null;
    this.socket = null;
    this.sessionId = null;
    this.sequence = 0;
    this.pending = new Map();
    this.browserWebSocketUrl = null;
    this.executable = null;
  }

  async boot() {
    if (this.socket && this.sessionId) {
      return { ok:true, state:'READY', executable:this.executable };
    }
    if (typeof WebSocket !== 'function') {
      throw new Error('NATIVE_CDP_WEBSOCKET_UNAVAILABLE');
    }

    const executable = await firstExecutable(this.executableCandidates);
    if (!executable) throw new Error('NATIVE_CDP_BROWSER_EXECUTABLE_MISSING');
    this.executable = executable;
    this.profileDir = await mkdtemp(join(tmpdir(), 'mondayid-cdp-'));

    const args = [
      this.headless ? '--headless=new' : '',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      '--user-data-dir=' + this.profileDir,
      'about:blank'
    ].filter(Boolean);

    const child = spawn(executable, args, {
      stdio:['ignore','ignore','pipe'],
      detached:true
    });
    child.unref();
    this.process = child;

    const browserWs = await new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error('NATIVE_CDP_LAUNCH_TIMEOUT:' + stderr.slice(-1200))), this.launchTimeoutMs);
      child.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.once('exit', code => {
        if (!this.browserWebSocketUrl) {
          clearTimeout(timer);
          reject(new Error('NATIVE_CDP_BROWSER_EXITED:' + code + ':' + stderr.slice(-1200)));
        }
      });
    });

    this.browserWebSocketUrl = browserWs;
    await this.connect(browserWs);

    const target = await this.rpc('Target.createTarget', { url:'about:blank' });
    const attached = await this.rpc('Target.attachToTarget', { targetId:target.targetId, flatten:true });
    this.sessionId = attached.sessionId;
    await this.rpc('Page.enable', {}, this.sessionId);
    await this.rpc('Runtime.enable', {}, this.sessionId);

    return {
      ok:true,
      state:'READY',
      executable,
      browserWebSocket:'native-cdp',
      profileIsolation:true
    };
  }

  async connect(url) {
    this.socket = new WebSocket(url);
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('NATIVE_CDP_WEBSOCKET_TIMEOUT')),this.rpcTimeoutMs);
      this.socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      this.socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('NATIVE_CDP_WEBSOCKET_ERROR'));},{once:true});
    });

    this.socket.addEventListener('message', event => {
      let message;
      try { message=JSON.parse(String(event.data)); } catch { return; }
      if (!message.id || !this.pending.has(message.id)) return;
      const pending=this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error('CDP_' + message.error.code + ':' + message.error.message));
      else pending.resolve(message.result);
    });

    this.socket.addEventListener('close', () => {
      for (const [id,pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('NATIVE_CDP_SOCKET_CLOSED'));
        this.pending.delete(id);
      }
    });
  }

  rpc(method, params = {}, sessionId = null) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('NATIVE_CDP_NOT_CONNECTED'));
    }
    const id=++this.sequence;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('NATIVE_CDP_RPC_TIMEOUT:' + method));
      }, this.rpcTimeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
    });
  }

  async evaluate(expression) {
    await this.boot();
    const out=await this.rpc('Runtime.evaluate',{
      expression,
      returnByValue:true,
      awaitPromise:true,
      userGesture:true
    },this.sessionId);
    if (out.exceptionDetails) {
      throw new Error('NATIVE_CDP_EVALUATION_FAILED:' + (out.exceptionDetails.text || 'exception'));
    }
    return out.result?.value;
  }

  async waitReady(timeoutMs = 8_000) {
    const started=Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const state=await this.evaluate('document.readyState');
        if (state === 'complete' || state === 'interactive') return state;
      } catch {}
      await sleep(50);
    }
    throw new Error('NATIVE_CDP_DOCUMENT_READY_TIMEOUT');
  }

  async perform(step = {}) {
    await this.boot();
    try {
      switch (step.type) {
        case 'open': {
          if (!allowedUrl(String(step.url || ''), this)) {
            return {ok:false,code:'BROWSER_URL_NOT_ALLOWED',url:step.url || null};
          }
          await this.rpc('Page.navigate',{url:String(step.url)},this.sessionId);
          await this.waitReady(step.timeoutMs || 8_000);
          return {ok:true,type:'open',url:await this.evaluate('location.href')};
        }
        case 'click': {
          const selector=jsString(step.selector);
          const value=await this.evaluate('(()=>{const el=document.querySelector(' + selector + '); if(!el) return {ok:false,reason:"not-found"}; el.click(); return {ok:true};})()');
          return {ok:value?.ok === true,type:'click',selector:step.selector,value};
        }
        case 'fill': {
          const selector=jsString(step.selector);
          const value=jsString(step.value ?? '');
          const out=await this.evaluate('(()=>{const el=document.querySelector(' + selector + '); if(!el) return {ok:false,reason:"not-found"}; el.focus(); el.value=' + value + '; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); return {ok:true,value:el.value};})()');
          return {ok:out?.ok === true,type:'fill',selector:step.selector,value:out?.value ?? null};
        }
        case 'press': {
          const key=String(step.key || '');
          if (!key) return {ok:false,code:'BROWSER_KEY_REQUIRED'};
          await this.rpc('Input.dispatchKeyEvent',{type:'keyDown',key},this.sessionId);
          await this.rpc('Input.dispatchKeyEvent',{type:'keyUp',key},this.sessionId);
          return {ok:true,type:'press',key};
        }
        case 'evaluate': {
          const value=await this.evaluate(String(step.expression || 'undefined'));
          return {ok:true,type:'evaluate',value};
        }
        case 'wait': {
          const ms=Math.min(Math.max(Number(step.ms) || 0,0),10_000);
          await sleep(ms);
          return {ok:true,type:'wait',ms};
        }
        case 'screenshot': {
          const shot=await this.rpc('Page.captureScreenshot',{format:'png',fromSurface:true},this.sessionId);
          return {ok:true,type:'screenshot',mimeType:'image/png',base64:shot.data};
        }
        default:
          return {ok:false,code:'BROWSER_STEP_UNSUPPORTED',type:step.type || null};
      }
    } catch (error) {
      return {ok:false,code:'BROWSER_DRIVER_ERROR',type:step.type || null,error:String(error)};
    }
  }

  async observe(probe = {}) {
    await this.boot();
    try {
      switch (probe.type) {
        case 'url':
          return {ok:true,type:'url',value:await this.evaluate('location.href')};
        case 'title':
          return {ok:true,type:'title',value:await this.evaluate('document.title')};
        case 'text': {
          const selector=probe.selector ? jsString(probe.selector) : null;
          const expression=selector
            ? 'document.querySelector(' + selector + ')?.innerText ?? null'
            : 'document.body?.innerText ?? ""';
          const value=await this.evaluate(expression);
          return {ok:value !== null,type:'text',selector:probe.selector || null,value};
        }
        case 'value': {
          const selector=jsString(probe.selector);
          const value=await this.evaluate('document.querySelector(' + selector + ')?.value ?? null');
          return {ok:value !== null,type:'value',selector:probe.selector,value};
        }
        case 'exists': {
          const selector=jsString(probe.selector);
          const value=await this.evaluate('Boolean(document.querySelector(' + selector + '))');
          return {ok:true,type:'exists',selector:probe.selector,value};
        }
        case 'evaluate':
          return {ok:true,type:'evaluate',value:await this.evaluate(String(probe.expression || 'undefined'))};
        default:
          return {ok:false,code:'BROWSER_PROBE_UNSUPPORTED',type:probe.type || null,value:null};
      }
    } catch (error) {
      return {ok:false,code:'BROWSER_OBSERVE_ERROR',type:probe.type || null,error:String(error),value:null};
    }
  }

  async close() {
    try { this.socket?.close(); } catch {}
    this.socket=null;
    this.sessionId=null;
    for (const [id,pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('NATIVE_CDP_DRIVER_CLOSED'));
      this.pending.delete(id);
    }
    if (this.process?.pid) {
      try { process.kill(-this.process.pid,'SIGKILL'); } catch {}
    }
    this.process=null;
    if (this.profileDir) {
      await rm(this.profileDir,{recursive:true,force:true}).catch(()=>{});
    }
    this.profileDir=null;
    return {ok:true,state:'CLOSED'};
  }
}

export function createNativeCdpBrowserDriver(options = {}) {
  return new NativeCdpBrowserDriver(options);
}
