import { Sandbox } from '@vercel/sandbox';
import { createHash } from 'node:crypto';

const SYSTEM_DEPS = [
  'nss','nspr','libxkbcommon','atk','at-spi2-atk','at-spi2-core','libXcomposite',
  'libXdamage','libXrandr','libXfixes','libXcursor','libXi','libXtst','libXScrnSaver',
  'libXext','mesa-libgbm','libdrm','mesa-libGL','mesa-libEGL','cups-libs','alsa-lib',
  'pango','cairo','gtk3','dbus-libs'
];

function id(prefix, value) {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16)}`;
}

async function stdout(result) {
  return (await result.stdout()).trim();
}

export class MondayBrowserOrgan {
  constructor({ name = 'mondayid-browser-organ', allowedDomains = [], timeout = 120000 } = {}) {
    this.name = name;
    this.allowedDomains = allowedDomains;
    this.timeout = timeout;
    this.sandbox = null;
    this.stepIndex = 0;
    this.sessionId = null;
  }

  async boot() {
    const networkPolicy = this.allowedDomains.length
      ? { mode: 'custom', allowedDomains: this.allowedDomains }
      : { mode: 'allow-all' };

    this.sandbox = await Sandbox.getOrCreate({
      name: this.name,
      runtime: 'node24',
      timeout: this.timeout,
      networkPolicy,
      onCreate: async (sbx) => {
        await sbx.runCommand('sh', ['-c', `sudo dnf clean all >/dev/null 2>&1; sudo dnf install -y --skip-broken ${SYSTEM_DEPS.join(' ')} >/dev/null 2>&1; sudo ldconfig >/dev/null 2>&1`]);
        await sbx.runCommand('npm', ['install', '-g', 'agent-browser']);
        await sbx.runCommand('npx', ['agent-browser', 'install']);
      }
    });

    const session = this.sandbox.currentSession();
    this.sessionId = session?.sessionId ?? this.name;
    return { status: 'ready', sessionId: this.sessionId, organ: this.name };
  }

  async run(action, args = []) {
    if (!this.sandbox) await this.boot();
    const preUrl = await this.safeUrl();
    const requested = { action, args };
    const result = await this.sandbox.runCommand('agent-browser', [action, ...args]);
    const output = await stdout(result);
    const postUrl = await this.safeUrl();
    this.stepIndex += 1;
    return {
      receiptId: id('browser-receipt', { sessionId: this.sessionId, step: this.stepIndex, requested, postUrl, output }),
      sessionId: this.sessionId,
      stepIndex: this.stepIndex,
      requestedAction: requested,
      preUrl,
      postUrl,
      observableResult: output,
      timestamp: new Date().toISOString()
    };
  }

  async open(url) { return this.run('open', [url]); }
  async snapshot() { return this.run('snapshot', ['-i']); }
  async click(ref) { return this.run('click', [ref]); }
  async fill(ref, value) { return this.run('fill', [ref, value]); }
  async select(ref, option) { return this.run('select', [ref, option]); }
  async press(key) { return this.run('press', [key]); }
  async getText(ref = 'body') { return this.run('get', ['text', ref]); }
  async getUrl() { return this.run('get', ['url']); }

  async screenshot() {
    if (!this.sandbox) await this.boot();
    const result = await this.sandbox.runCommand('agent-browser', ['screenshot', '--json']);
    const parsed = JSON.parse(await stdout(result));
    const path = parsed?.data?.path;
    if (!path) throw new Error('agent-browser did not return screenshot path');
    const b64 = await this.sandbox.runCommand('base64', ['-w', '0', path]);
    this.stepIndex += 1;
    return {
      receiptId: id('browser-screenshot', { sessionId: this.sessionId, step: this.stepIndex, path }),
      sessionId: this.sessionId,
      stepIndex: this.stepIndex,
      screenshotBase64: await stdout(b64),
      timestamp: new Date().toISOString()
    };
  }

  async safeUrl() {
    try {
      const result = await this.sandbox.runCommand('agent-browser', ['get', 'url']);
      return await stdout(result);
    } catch {
      return null;
    }
  }

  async stop() {
    if (!this.sandbox) return { status: 'already_stopped' };
    await this.sandbox.stop();
    this.sandbox = null;
    return { status: 'stopped', organ: this.name };
  }
}

export function createBrowserCapability(options = {}) {
  const organ = new MondayBrowserOrgan(options);
  return {
    id: 'browser.organ.v1',
    platform: 'Vercel Sandbox',
    provides: ['browser_open','browser_snapshot','browser_click','browser_fill','browser_select','browser_press','browser_read','browser_screenshot'],
    risk: 'medium',
    mutates: true,
    async execute({ intent = {}, args = {} } = {}) {
      const operation = intent.operation ?? args.operation;
      switch (operation) {
        case 'open': return organ.open(args.url);
        case 'snapshot': return organ.snapshot();
        case 'click': return organ.click(args.ref);
        case 'fill': return organ.fill(args.ref, args.value);
        case 'select': return organ.select(args.ref, args.option);
        case 'press': return organ.press(args.key);
        case 'read': return organ.getText(args.ref);
        case 'screenshot': return organ.screenshot();
        default: throw new Error(`Unsupported browser operation: ${operation}`);
      }
    }
  };
}
