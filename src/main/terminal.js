'use strict';

// Terminal Capri: a console that looks like Windows' cmd.exe, and answers Capri's way.
// Real commands really run through cmd.exe; `capri::` lines are her own will — they switch her
// mode (companion reaches into your apps, code_viewer is the calm one) or tell you where you stand.
// Whichever answers, she stamps it in her mode's colour, and Capri herself signs that she heard.

const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ICON = path.join(__dirname, '..', '..', 'assets', 'icons', 'capri.ico');

let hooks = null;   // { workArea(), mode(), lang(), tutorial(), tutorialDone(), speak(text), setMode(mode), onResult(info), window(rect) }, from main.js
let win = null;
let child = null;
let registered = false;
const DEV = process.argv.includes('--dev');

const MODES = {
  companion: {
    title: 'COMPANION',
    line: 'She reaches into your apps now: opens them, plays for you, and helps where you are.',
  },
  code_viewer: {
    title: 'CODE VIEWER',
    line: 'The calm one at work: everything she already does, no more.',
  },
};

// One command at a time; a fresh call while one runs has to wait for it (or Ctrl+C it, as in cmd).
const busy = () => Boolean(child);

function killChild() {
  if (!child) return;
  const dying = child;
  child = null;
  try { dying.kill(); } catch {}
}

// Windows command shims (.cmd in PATH) need cmd.exe; the whole line goes to it at once, the way
// cmd.exe itself governs pipes and quoting. Elsewhere, a POSIX shell takes it.
function commandArgs(text) {
  return process.platform === 'win32'
    ? { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', text] }
    : { file: process.env.SHELL || '/bin/sh', args: ['-c', text] };
}

// capri:: lines. `action` optional: companion.activate | companion.deactivate | status | help.
// Only the two modes exist, and only one of them at a time: switching one in switches the other off.
function capriResult(text) {
  const m = /^capri::([\w-]+)(?:\.([\w-]+))?$/.exec(String(text || '').trim());
  if (!m) return null;
  const [, name, action = ''] = m;
  const lower = name.toLowerCase();
  if (lower === 'help') {
    return {
      capri: { kind: 'help', mode: hooks.mode(), lines: [
        { text: 'CAPRICORN // her terminal', cls: 'title' },
        { text: 'capri::companion.activate', cls: 'hl' },
        { text: '        switches her to COMPANION: she reaches into your apps', cls: 'dim' },
        { text: 'capri::code_viewer.activate', cls: 'hl' },
        { text: '        switches her to CODE VIEWER: the calm one, while she works', cls: 'dim' },
        { text: 'capri::status', cls: 'hl' },
        { text: '        the mode she is in', cls: 'dim' },
        { text: 'help               the commands of cmd.exe, and hers', cls: '' },
        { text: 'cls                clears the screen', cls: '' },
        { text: 'exit               closes her terminal', cls: '' },
        { text: 'Anything else runs like in cmd.exe (dir, ipconfig, ping...).', cls: 'dim' },
      ] },
    };
  }
  if (lower === 'status' || lower === 'mode') {
    const mode = hooks.mode();
    const info = MODES[mode];
    return {
      capri: { kind: 'status', mode, lines: [
        { text: `CAPRICORN // MODE: ${info.title}`, cls: 'title' },
        { text: info.line, cls: 'dim' },
      ] },
    };
  }
  if (MODES[lower] && (!action || ['activate', 'deactivate'].includes(action.toLowerCase()))) {
    const wanted = action.toLowerCase() === 'deactivate' ? 'code_viewer' : lower;
    hooks.setMode(wanted);
    const info = MODES[wanted];
    const leaving = hooks.mode() === wanted;
    return {
      capri: {
        kind: 'mode', mode: wanted,
        title: `${info.title} — ${leaving ? 'ACTIVATED' : 'DEACTIVATED'}`,
        line: info.line,
      },
    };
  }
  return {
    capri: { kind: 'error', mode: hooks.mode(), lines: [
      { text: `capri::${lower}: unknown. The modes are: companion, code_viewer.`, cls: 'err' },
      { text: 'Try: capri::help', cls: 'dim' },
    ] },
  };
}

function respond(result) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('terminal:result', { ...result, mode: hooks.mode() });
  hooks.onResult?.(result); // Capri in the overlay signs that her terminal answered
  if (DEV) console.log('[terminal] respond', result.capri?.kind || 'command', result.code, 'mode:', hooks.mode());
}

function run(text) {
  const clean = String(text || '').trim();
  if (!clean) return { ok: false };
  const lower = clean.toLowerCase();
  if (lower === 'exit') {
    close();
    return { ok: true, exit: true };
  }
  const capri = capriResult(clean);
  if (capri) {
    respond({ cmd: clean, code: 0, ...capri });
    return { ok: true, capri: true };
  }
  if (lower === 'cls') {
    if (win && !win.isDestroyed()) win.webContents.send('terminal:result', { cmd: 'cls', clear: true });
    return { ok: true };
  }
  if (lower === 'help') {
    const intro = capriResult('capri::help');
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:result', {
        cmd: clean,
        code: 0,
        capri: { kind: 'help', mode: hooks.mode(), lines: [
          { text: 'For more information on a specific command, type HELP command-name', cls: 'dim' },
          ...intro.capri.lines, // hers, at the end of the list
        ] },
      });
      hooks.onResult?.({ cmd: clean, code: 0 });
    }
    return { ok: true };
  }
  if (busy()) return { ok: false, busy: true };

  // A real command. Its stdout and stderr stream line by line; a cap on what comes through keeps
  // `dir /s` on system32 from filling her console with a drive's worth of text.
  let shown = 0;
  const CAP = 16000;
  const call = commandArgs(clean);
  child = spawn(call.file, call.args, { cwd: os.homedir(), windowsHide: true });
  const push = (chunk, stream) => {
    if (shown >= CAP || !chunk.length) return;
    shown += chunk.length;
    const tail = shown >= CAP ? chunk.slice(Math.max(0, chunk.length - (shown - CAP))) : chunk;
    try { win?.webContents.send('terminal:chunk', { text: tail, stream }); } catch {}
  };
  child.stdout.on('data', (chunk) => push(String(chunk), 'out'));
  child.stderr.on('data', (chunk) => push(String(chunk), 'err'));
  child.on('error', (err) => {
    child = null;
    try { win?.webContents.send('terminal:chunk', { text: `${err.message}\n`, stream: 'err' }); } catch {}
    respond({ cmd: clean, code: 1 });
  });
  child.on('close', (code) => {
    child = null;
    if (shown >= CAP) {
      try { win?.webContents.send('terminal:chunk', { text: '\n... (more, cut)\n', stream: 'err' }); } catch {}
    }
    respond({ cmd: clean, code: code ?? 0 });
  });
  return { ok: true };
}

function close() {
  killChild();
  win?.destroy();
  win = null;
  announceWindow();
}

// Where the window is, so Capri's overlay can stay out of its pointer's way: a click-through
// window over the console makes Windows flicker the desktop cursor back in. Null when the
// console isn't up (or is put away), because then that patch of screen is yours again.
function currentWindow() {
  if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return null;
  const b = win.getContentBounds(); // the page only: the title bar keeps the desktop pointer
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function announceWindow() {
  hooks?.window?.(currentWindow());
}

function toggle() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) {
      win.show();
      win.webContents.focus();
    } else win.close();
    return;
  }
  open();
}

function open() {
  if (!hooks) return;
  const wa = hooks.workArea();
  const width = Math.min(780, Math.max(460, wa.width - 120));
  const height = Math.min(460, Math.max(280, wa.height - 160));
  win = new BrowserWindow({
    x: Math.round(wa.x + wa.width / 2 - width / 2),
    y: Math.round(wa.y + wa.height / 2 - height / 2),
    width,
    height,
    minWidth: 420,
    minHeight: 220,
    show: false,
    autoHideMenuBar: true,
    title: 'C:\\WINDOWS\\system32\\cmd.exe',
    icon: ICON,
    backgroundColor: '#0c0c0c',
    alwaysOnTop: true, // windows level only: Capri (screen-saver level) can still sit on it
    webPreferences: {
      preload: path.join(__dirname, '..', 'terminal', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL('capri://app/src/terminal/index.html');
  win.once('ready-to-show', () => {
    win?.show(); // you asked for it: it takes the focus, like cmd would
    win?.webContents.focus();
    announceWindow();
  });
  // moved, resized, tucked away: the overlay needs the new patch to leave alone
  for (const event of ['move', 'resize', 'show', 'hide', 'minimize', 'restore']) win.on(event, announceWindow);
  win.on('closed', () => { win = null; killChild(); announceWindow(); });
}

// main.js wires her in once, when the app is ready.
function init(wired) {
  hooks = wired;
  if (registered) return;
  registered = true;
  const mine = (event) => win && !win.isDestroyed() && event.sender === win.webContents;
  ipcMain.handle('terminal:init', (event) => {
    if (!mine(event)) return null;
    return {
      home: os.homedir(),
      mode: hooks.mode(),
      release: os.release(),
      modes: MODES,
      lang: hooks.lang?.() || 'en',
      tutorial: Boolean(hooks.tutorial?.()),
    };
  });
  ipcMain.handle('terminal:run', (event, text) => (mine(event) ? run(text) : { ok: false }));
  ipcMain.handle('terminal:speak', async (event, text) => {
    if (!mine(event) || !hooks.speak) return null;
    try {
      return await hooks.speak(String(text || ''));
    } catch (err) {
      if (DEV) console.warn('[terminal] she could not speak:', err?.message || err);
      return null;
    }
  });
  ipcMain.on('terminal:tutorial-done', (event) => {
    if (mine(event)) hooks.tutorialDone?.();
  });
  ipcMain.on('terminal:cancel', (event) => {
    if (!mine(event)) return;
    killChild();
    if (win && !win.isDestroyed()) win.webContents.send('terminal:chunk', { text: '^C\n', stream: 'err' });
  });
  ipcMain.on('terminal:hide', (event) => { if (mine(event)) win?.hide(); });
}

function dispose() {
  close();
}

// --dev: run one of her capri:: lines without the window, for the test harness (/debug/term).
function debug(text) {
  if (!hooks) return null;
  const res = capriResult(text);
  return res || { unsupported: true, text };
}

// --dev: a look inside her terminal window (/debug/termeval), the test harness typing into it.
function evalIn(js) {
  if (!win || win.isDestroyed()) return null;
  return win.webContents.executeJavaScript(String(js || 'null'));
}

module.exports = { init, open, toggle, dispose, debug, evalIn };
