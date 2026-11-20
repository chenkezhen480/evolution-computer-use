import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { browserCandidates, findBrowser, launchArgs, launchBrowser, runningPort } from '../src/browser/edge.ts';
import { Faults } from '../src/shared/faults.ts';
import type { Cdp } from '../src/browser/cdp.ts';

test('Edge is looked for before Chrome, machine-wide before per-user', () => {
  const list = browserCandidates({ 'PROGRAMFILES(X86)': 'X86', PROGRAMFILES: 'PF', LOCALAPPDATA: 'LA' });
  assert.equal(list.length, 6);
  assert.match(list[0]!, /X86.*Microsoft.*Edge.*msedge\.exe$/);
  assert.match(list[2]!, /LA.*msedge\.exe$/);
  assert.match(list[3]!, /X86.*Google.*chrome\.exe$/);
  assert.equal(findBrowser(list, path => path === list[4]), list[4]);
  assert.equal(findBrowser(list, () => false), undefined);
});

test('her browser runs on its own profile, with no origin allowed to the debugging port', () => {
  const args = launchArgs('D:/w/browser');
  assert.ok(args.includes('--user-data-dir=D:/w/browser'));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.ok(!args.some(arg => arg.startsWith('--remote-allow-origins')));
  assert.ok(!args.some(arg => arg.startsWith('--headless')));
  assert.ok(args.includes('--disable-extensions'), 'an extension synced in from the partner opens its own windows and edits her pages');
  assert.ok(args.includes('--disable-sync'), 'the partner\'s bookmarks, autofill and extensions stay out of her browser');
});

test('a port file is trusted only while the browser answers on it', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'computer-edge-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(await runningPort(dir), 0);
  writeFileSync(join(dir, 'DevToolsActivePort'), '9333\n/devtools/browser/x');
  const answering = (async () => new Response('{}')) as typeof fetch;
  assert.equal(await runningPort(dir, answering), 9333);
  const silent = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
  assert.equal(await runningPort(dir, silent), 0);
  assert.equal(existsSync(join(dir, 'DevToolsActivePort')), false);
});

test('a browser that cannot be started is reported, not waited for', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'computer-edge-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(launchBrowser(join(dir, 'missing.exe'), dir, 2000), /浏览器没能启动/);
});

test('with no Windows at all, the usual Linux and macOS places are looked in, and the PATH too', () => {
  const list = browserCandidates({ PATH: '/usr/local/bin:/opt/x/bin' });
  assert.ok(list.length > 0);
  assert.ok(list.some(path => /google-chrome/.test(path)), 'a Chrome on the PATH is a browser');
  assert.ok(list.some(path => /Applications.*Chrome.*app/.test(path)), 'macOS puts its browsers under /Applications');
  assert.ok(list.every(path => path.startsWith('/')), 'every candidate is an absolute path');
});

test('a browser that no longer works is skipped for the next one', async () => {
  const asked: string[] = [];
  const launched = await (async () => {
    // The first candidate refuses to start, as the Debian chromium snap stub does with exit code 1.
    const page = await import('../src/browser/browser.ts');
    const browser = page.createBrowser({
      profileDir: '/tmp/unused-profile', faults: new Faults(),
      find: () => ['/usr/bin/chromium-browser', '/usr/local/bin/google-chrome'],
      running: async () => 0,
      launch: async binary => { asked.push(binary); if (binary.includes('chromium-browser')) throw new Error('浏览器进程启动后就退出了'); return 9333; },
      targets: async () => [{ id: 't', type: 'page', url: 'about:blank', title: '', webSocketDebuggerUrl: 'ws://x' }],
      connect: async () => ({ send: async () => ({ result: { value: { url: 'u', title: 't', controls: [], text: '' } } }), on: () => () => {}, close() {}, closed: false } as unknown as Cdp),
    });
    return await browser.run(async page => page.brief());
  })();
  assert.deepEqual(asked, ['/usr/bin/chromium-browser', '/usr/local/bin/google-chrome'], 'the second candidate is tried after the first fails');
  assert.match(launched, /^t · u/);
});

test('headless and no-sandbox are arguments only in the mode that asks for them', () => {
  const plain = launchArgs('D:/w/browser');
  assert.ok(!plain.some(arg => arg.startsWith('--headless')));
  assert.ok(!plain.includes('--no-sandbox'));
  const headless = launchArgs('D:/w/browser', { headless: true, noSandbox: true });
  assert.ok(headless.includes('--headless=new'));
  assert.ok(headless.includes('--no-sandbox'));
  assert.ok(headless.includes('--disable-dev-shm-usage'));
});
