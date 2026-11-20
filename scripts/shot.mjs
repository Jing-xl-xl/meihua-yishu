#!/usr/bin/env node
/**
 * 设计验收截图工具（P0 起用）
 *
 * 用途：headless Chrome + CDP，支持「导航 → 执行 JS（填表/点按钮/localStorage）→ 截图」，
 *      用于逐屏设计验收，避免人工反复点。
 *
 * 用法：
 *   node scripts/shot.mjs --url http://localhost:5173/ --out shot.png
 *   node scripts/shot.mjs --url http://localhost:5173/ --out cast.png \
 *     --script "localStorage.setItem('meihua.personId', 'xxx'); location.reload();" --wait 2500
 *
 * 参数：--url --out --script --wait(ms, 默认1500) --width(1280) --height(800) --chrome <path>
 * 依赖：Chrome（macOS 默认路径），Node 22+（全局 WebSocket / fetch）。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const url = arg('url', 'http://localhost:5173/');
const out = arg('out', 'shot.png');
const scripts = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--script' && argv[i + 1]) scripts.push(argv[i + 1]);
  if (argv[i] === '--script-file' && argv[i + 1]) {
    scripts.push(readFileSync(argv[i + 1], 'utf-8'));
  }
}
const waitMs = Number(arg('wait', '1500'));
const downloadDir = arg('download', '');
const width = Number(arg('width', '1280'));
const height = Number(arg('height', '800'));
const chrome =
  arg('chrome') ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'dsh-shot-'));

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return;
    } catch {
      /* not ready */
    }
    await sleep(150);
  }
  throw new Error('Chrome debugger 未就绪');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
}

try {
  await waitForDebugger();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (downloadDir) {
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
  }
  await cdp.send('Page.navigate', { url });
  await sleep(waitMs);

  for (const script of scripts) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: script,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      console.error('script 异常:', JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    }
    if (argv.includes('--print') && r.result?.result) {
      console.log(
        typeof r.result.result.value === 'string'
          ? r.result.result.value
          : JSON.stringify(r.result.result.value),
      );
    }
    await sleep(waitMs);
  }

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const data = shot.result?.data;
  if (!data) throw new Error('截图失败：无数据');
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`saved ${out}`);
  ws.close();
} finally {
  child.kill('SIGKILL');
}
