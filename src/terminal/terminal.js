'use strict';
// The page in her terminal window: a console you type in, her answers stamped in her mode's colour.

const lines = document.getElementById('lines');
const promptEl = document.getElementById('prompt');
const form = document.getElementById('row');
const input = document.getElementById('input');

let home = '';
let mode = 'code_viewer';
const history = [];
let shown = null; // index in `history` while you look down it with the arrows

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const scrollDown = () => { document.getElementById('term').scrollTop = 1e9; };

function print(text = '', cls = 'out') {
  lines.append(el('div', cls, text));
  scrollDown();
}

function printAll(entries = []) {
  for (const { text, cls } of entries) print(text, cls || 'out');
}

// The block in the corner at rest: C:\Users\you>, the way cmd shows where you are.
const promptText = () => `${home}>`;

function echo(text) {
  lines.append(el('div', 'echoed', `${promptText()}${text}`));
  scrollDown();
}

// Whatever answers, her mode signs under it: a stamp in her colour, and it glitches once in place.
function stamp(kind, modeName, word) {
  const node = el('div', ['stamp', `is-${modeName}`, kind === 'error' ? 'is-error' : ''].join(' ').trim());
  node.append(el('b', '', `CAPRICORN // ${modeName.toUpperCase()}`), el('span', '', word));
  lines.append(node);
  scrollDown();
}

// A mode switching in draws the banner the mode arrives with.
function banner(entry) {
  const box = el('div', `banner is-${entry.mode}`);
  box.append(
    el('div', 'banner__title', `CAPRICORN // ${entry.title}`),
    el('div', 'banner__line', entry.line),
  );
  lines.append(box);
  scrollDown();
}

// The running output of a real command lands in one block, stderr in its colour.
let out = null;
function startOut() {
  out = el('div', 'out');
  lines.append(out);
}

function intoOut(chunk) {
  if (!chunk.text) return;
  if (!out) startOut();
  out.classList.toggle('err', chunk.stream === 'err');
  out.textContent += chunk.text;
  scrollDown();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = '';
  if (!text.trim()) { print(''); return; }
  echo(text);
  history.push(text);
  shown = null;
  out = null;
  const res = await window.terminal.run(text);
  if (res?.busy) print('A command is already running. (Ctrl+C stops it)', 'err');
  input.focus();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!history.length) return;
    shown ??= history.length;
    shown = Math.max(0, shown - 1);
    input.value = history[shown] ?? '';
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (shown == null) return;
    shown += 1;
    input.value = history[shown] ?? '';
    if (shown >= history.length) shown = null;
    return;
  }
  if (e.key === 'c' && e.ctrlKey) {
    window.terminal.cancel();
    return;
  }
  if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    lines.replaceChildren();
    return;
  }
  if (e.key === 'Escape') {
    window.terminal.hide();
  }
});

// click anywhere: the caret comes back
document.getElementById('term').addEventListener('mousedown', () => setTimeout(() => input.focus(), 0));
document.body.addEventListener('mousedown', () => setTimeout(() => input.focus(), 0));

window.terminal.onChunk(intoOut);

window.terminal.onResult((result) => {
  out = null;
  if (result.clear) {
    lines.replaceChildren();
    return;
  }
  if (result.capri?.kind === 'mode') {
    mode = result.capri.mode;
    banner({ mode: result.capri.mode, title: result.capri.title, line: result.capri.line });
    stamp('ok', result.capri.mode, 'mode switched in her own words');
    return;
  }
  if (result.capri?.kind === 'status' || result.capri?.kind === 'help') {
    mode = result.capri.mode;
    printAll(result.capri.lines);
    if (result.capri.kind === 'status') stamp('ok', mode, 'the mode she is in');
    return;
  }
  if (result.capri?.kind === 'error') {
    printAll(result.capri.lines);
    stamp('error', mode, 'unknown command');
    return;
  }
  // A real command answering: her stamp, the word CAPRICORN signing in the mode's colour.
  stamp(result.code ? 'error' : 'ok', mode, result.code ? `exit code ${result.code}` : 'answered');
});

window.terminal.init().then((info) => {
  if (!info) return;
  home = info.home;
  mode = info.mode;
  promptEl.textContent = promptText();
  print(`Microsoft Windows [version ${info.release}]`, 'out');
  print('(c) Microsoft Corporation. All rights reserved.', 'dim');
  print('');
  print('CAPRICORN // her terminal: she listens in here.', 'title');
  print(`Mode: ${mode.toUpperCase()}. Type capri::help for her commands.`, 'tip');
  print('');
  input.focus();
});
