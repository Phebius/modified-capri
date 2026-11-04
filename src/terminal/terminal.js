'use strict';
// The page in her terminal window: a console you type in, her answers stamped in her mode's colour,
// and the first time it opens, her own tour of the commands.

import { Tutorial } from './tutorial.js';

const lines = document.getElementById('lines');
const promptEl = document.getElementById('prompt');
const form = document.getElementById('row');
const input = document.getElementById('input');
const presenceEl = document.getElementById('presence');
const modeTag = document.getElementById('modeTag');

// Her, in the corner: idle at her post, at the computer while a command runs, answering you, or
// split into her minds as a mode switches in. The gifs are the site's presence art.
const PRESENCE = {
  idle: '../../assets/terminal/plugged.gif',
  work: '../../assets/terminal/computer.gif',
  answer: '../../assets/terminal/chatting.gif',
  split: '../../assets/terminal/clones.gif',
};
let presenceTimer = 0;
const presence = (state) => {
  clearTimeout(presenceTimer); // a new state cancels any pending return to idle
  const src = PRESENCE[state] || PRESENCE.idle;
  if (presenceEl.getAttribute('src') !== src) presenceEl.setAttribute('src', src);
};
const presenceFor = (state, ms) => {
  presence(state);
  presenceTimer = setTimeout(() => presence('idle'), ms);
};

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

// The mode she stands in, in her HUD's colours: code viewer green, companion red.
function setMode(name) {
  mode = name;
  document.body.dataset.mode = name;
  modeTag.textContent = name.replace(/_/g, ' ').toUpperCase();
}

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

// Her tutorial types `help` and waits for the answer, so it can point at each command.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let helpWaiter = null;
async function typeHelp() {
  input.focus();
  input.value = '';
  for (const ch of 'help') {
    input.value += ch;
    await wait(70);
  }
  const arrived = new Promise((resolve) => { helpWaiter = resolve; });
  form.requestSubmit();
  await arrived;
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
  presence('work');
  const res = await window.terminal.run(text);
  if (res?.busy) {
    print('A command is already running. (Ctrl+C stops it)', 'err');
    presence('idle');
  }
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
  if (helpWaiter && result.cmd === 'help') {
    const done = helpWaiter;
    helpWaiter = null;
    done();
  }
  if (result.clear) {
    lines.replaceChildren();
    presence('idle');
    return;
  }
  if (result.capri?.kind === 'mode') {
    setMode(result.capri.mode);
    banner({ mode: result.capri.mode, title: result.capri.title, line: result.capri.line });
    stamp('ok', result.capri.mode, 'mode switched in her own words');
    presenceFor('split', 3200);
    return;
  }
  if (result.capri?.kind === 'status' || result.capri?.kind === 'help') {
    setMode(result.capri.mode);
    printAll(result.capri.lines);
    if (result.capri.kind === 'status') stamp('ok', mode, 'the mode she is in');
    presenceFor('answer', 2600);
    return;
  }
  if (result.capri?.kind === 'error') {
    printAll(result.capri.lines);
    stamp('error', mode, 'unknown command');
    presenceFor('answer', 2200);
    return;
  }
  // A real command answering: her stamp, the word CAPRICORN signing in the mode's colour.
  stamp(result.code ? 'error' : 'ok', mode, result.code ? `exit code ${result.code}` : 'answered');
  presence('idle');
});

window.terminal.init().then((info) => {
  if (!info) return;
  home = info.home;
  setMode(info.mode);
  promptEl.textContent = promptText();
  print(`Microsoft Windows [version ${info.release}]`, 'out');
  print('(c) Microsoft Corporation. All rights reserved.', 'dim');
  print('');
  print('CAPRICORN // her terminal: she listens in here.', 'title');
  print(`Mode: ${mode.toUpperCase()}. Type capri::help for her commands.`, 'tip');
  print('');
  input.focus();

  // Her hello, and the first time, her tour: she comes in, points, types help, explains each
  // command. Read-only while she shows you around, so your own typing does not race hers.
  const tutorial = new Tutorial({
    lang: info.lang || 'en',
    onDone: () => window.terminal.tutorialDone(),
  });
  input.readOnly = true;
  tutorial.start({ first: Boolean(info.tutorial), typeHelp }).finally(() => {
    input.readOnly = false;
    input.focus();
  });
});

// Her pointer, and only in this window: her artist's arrow from capri-desktop, the tip 2px into
// the 32px frame, sliding after the mouse on the next frame so it never lags behind the clicks.
const pointer = document.getElementById('cursor');
const TIP = 2;
let atX = 0;
let atY = 0;
let waiting = 0;

// Take the real pointer away only once her arrow is really there: if the sheet fails to load,
// the console keeps a cursor you can see instead of going blind.
const sheet = new Image();
sheet.addEventListener('load', () => document.body.classList.add('is-cursor'));
sheet.src = '../../assets/cursor/cursor-sheet.png';

function placePointer() {
  waiting = 0;
  pointer.style.transform = `translate3d(${atX - TIP}px, ${atY - TIP}px, 0)`;
}

window.addEventListener('mousemove', (e) => {
  atX = e.clientX;
  atY = e.clientY;
  pointer.classList.remove('is-off');
  if (!waiting) waiting = requestAnimationFrame(placePointer);
}, { passive: true });

// off the window or out of focus: nothing of hers is over the desktop, so the arrow goes too
document.addEventListener('mouseleave', () => pointer.classList.add('is-off'));
window.addEventListener('blur', () => pointer.classList.add('is-off'));
