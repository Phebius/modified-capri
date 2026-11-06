'use strict';
// The page in her terminal window: a console you type in, her answers stamped in her mode's colour,
// and the first time it opens, her own tour of the commands.

import { Tutorial } from './tutorial.js';
import { Effects } from './effects.js';

const lines = document.getElementById('lines');
const promptEl = document.getElementById('prompt');
const form = document.getElementById('row');
const input = document.getElementById('input');
const presenceEl = document.getElementById('presence');
const modeTag = document.getElementById('modeTag');

let lang = 'en';
let tutorial = null;
let effects = null;
let firstTour = true;
let askMode = false;
let askBusy = false;
let pendingTour = null;

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

// Her skills prompt (capri::ask.command): requests in plain words, and the console bends
// around them. Every line exists in both languages she speaks here.
const ASK = {
  fr: {
    excited: 'Oh oh. Tu veux utiliser mes compétences ? J\'adore quand tu me demandes.',
    enter: 'Mon prompt est à toi. Demande-moi ce que tu veux, ou tape aide.',
    hint: 'Exemples : clear les textes, supprime plein de mots, glitch, annule, exit',
    help: [
      { text: 'CAPRICORN // SKILLS', cls: 'title' },
      { text: 'clear les textes        j\'efface toutes les lignes avec des effets', cls: 'hl' },
      { text: 'supprime 8 mots        j\'enlève des mots un par un', cls: 'hl' },
      { text: 'supprime plein de mots j\'en enlève une bonne moitié', cls: 'hl' },
      { text: 'glitch                 je secoue la console', cls: 'hl' },
      { text: 'flash                  un éclair dans ma couleur', cls: 'hl' },
      { text: 'annule                 je remets ce que je viens d\'effacer', cls: 'hl' },
      { text: 'exit                   je te rends le prompt cmd', cls: 'hl' },
      { text: 'Tu peux commencer par capri, je comprends quand même.', cls: 'dim' },
    ],
    cleared: 'Voilà. Plus une ligne. Propre.',
    restored: 'Je remets tout, comme avant.',
    removed: (n) => `${n} mots partis en fumée.`,
    nothing: 'Il n\'y a rien à enlever ici.',
    glitched: 'Je secoue un peu la console.',
    flashed: 'Éclair.',
    status: (name) => `Je suis en ${name.toUpperCase()}.`,
    thanks: 'Avec plaisir.',
    hello: 'Salut. Dis-moi ce que je dois faire.',
    unknown: 'Je ne sais pas encore faire ça. Essaie clear les textes, supprime plein de mots, glitch, ou tape aide.',
    busy: 'Attends, je finis ce que je fais.',
    exit: 'Je te rends le prompt cmd.',
    already: 'Mon prompt de compétences est déjà ouvert.',
    replay: 'Je reprends le tour. Le bouton Passer est en haut à droite.',
  },
  en: {
    excited: 'Oh. You want to use my skills? I love it when you ask.',
    enter: 'The prompt is yours. Tell me what you want, or type help.',
    hint: 'Try: clear the text, remove a lot of words, glitch, undo, exit',
    help: [
      { text: 'CAPRICORN // SKILLS', cls: 'title' },
      { text: 'clear the text        I wipe every line with an effect', cls: 'hl' },
      { text: 'remove 8 words        I take words away one by one', cls: 'hl' },
      { text: 'remove a lot of words I take a good half of them', cls: 'hl' },
      { text: 'glitch                I shake the console', cls: 'hl' },
      { text: 'flash                 a burst in my colour', cls: 'hl' },
      { text: 'undo                  I put back what I just cleared', cls: 'hl' },
      { text: 'exit                  back to the cmd prompt', cls: 'hl' },
      { text: 'You can start with capri, I still understand.', cls: 'dim' },
    ],
    cleared: 'There. Not a line left. Clean.',
    restored: 'Putting it all back, just as it was.',
    removed: (n) => `${n} words gone in a puff.`,
    nothing: 'There is nothing to take away here.',
    glitched: 'I shake the console a little.',
    flashed: 'Flash.',
    status: (name) => `I am in ${name.toUpperCase()}.`,
    thanks: 'Any time.',
    hello: 'Hey. Tell me what to do.',
    unknown: 'I cannot do that yet. Try clear the text, remove a lot of words, glitch, or type help.',
    busy: 'One moment, I am finishing this.',
    exit: 'Back to the cmd prompt.',
    already: 'My skills prompt is already open.',
    replay: 'Running the tour again. The Skip button is top right.',
  },
};

const askText = () => ASK[lang] || ASK.en;

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
  const node = el('div', cls, text);
  lines.append(node);
  effects?.lineIn(node);
  scrollDown();
}

function printAll(entries = []) {
  for (const { text, cls } of entries) print(text, cls || 'out');
}

// The block in the corner at rest: C:\Users\you>, the way cmd shows where you are. In her
// skills prompt it becomes the `capri>` of a model shell, the same idea as ollama.
const promptText = () => (askMode ? 'capri> ' : `${home}>`);

// The mode she stands in, in her HUD's colours: code viewer green, companion red.
function setMode(name) {
  mode = name;
  document.body.dataset.mode = name;
  modeTag.textContent = name.replace(/_/g, ' ').toUpperCase();
}

function echo(text) {
  const node = el('div', 'echoed', `${promptText()}${text}`);
  lines.append(node);
  effects?.lineIn(node);
  scrollDown();
}

function setAsk(on) {
  askMode = on;
  document.body.classList.toggle('is-ask', on);
  promptEl.textContent = promptText();
}

// `capri::ask.command`: she gets excited, the prompt turns into `capri>`, and every line you
// type from there is a request she handles herself instead of handing to cmd.exe.
function enterAsk() {
  if (askMode) {
    print(askText().already, 'dim');
    return;
  }
  setAsk(true);
  effects?.flash('#ff2e88', 300);
  effects?.burstAtPrompt(28);
  print('CAPRICORN // SKILLS', 'title');
  print(askText().enter, 'tip');
  print(askText().hint, 'dim');
  print('');
  presenceFor('answer', 4600);
  tutorial?.celebrate(askText().excited).catch(() => {});
}

function leaveAsk(line) {
  if (!askMode) return;
  setAsk(false);
  print(line || askText().exit, 'dim');
  presenceFor('answer', 1800);
}

const flat = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Plain words in, one of her skills out. A leading "capri" is optional, as in her examples.
function askIntent(raw) {
  const text = flat(raw).replace(/^capri[\s:,]*/, '').trim();
  if (!text) return { kind: 'unknown' };
  if (/^ask\.command$/.test(text)) return { kind: 'ask' };
  if (/^(exit|quit|q|retour|retourne|cmd|shell|sortir|quitter|back|stop)$/.test(text)) return { kind: 'exit' };
  if (/^(aide|help|\?)$/.test(text) || /\b(commandes|capacites|competences|skills)\b/.test(text)) return { kind: 'help' };
  if (/\b(tuto|tutorial|tour)\b/.test(text)) return { kind: 'tuto' };
  if (/^(annule|annuler|undo|restaure|restore|remets)\b/.test(text)) return { kind: 'undo' };
  if (/\b(glitch|glitche|corromp\w*|bugue?\w*|shake)\b/.test(text)) return { kind: 'glitch' };
  if (/\b(flash|eclair|flashs?)\b/.test(text)) return { kind: 'flash' };
  if (/\b(statut|status|mode)\b/.test(text)) return { kind: 'status' };
  if (/\b(merci|thanks|thank you)\b/.test(text)) return { kind: 'thanks' };
  if (/\b(bonjour|salut|hello|hey|coucou)\b/.test(text)) return { kind: 'hello' };

  const aboutWords = /\b(mot|mots|word|words)\b/.test(text);
  const taking = /\b(clear|cls|efface\w*|nettoie\w*|vide\w*|supprime\w*|enleve\w*|retire\w*|vire\w*|delete|remove\w*|erase\w*|wipe|clean|burn\w*|brul\w*)\b/.test(text);
  const aboutLines = /\b(tout|tous|toutes|texte|textes|text|texts|ligne|lignes|ecran|console|terminal|historique|avant|all|screen|lines?|output)\b/.test(text);

  if (aboutWords && taking) {
    if (/\b(tous|toutes|all|every)\b/.test(text)) return { kind: 'words', count: 'all' };
    const number = text.match(/\b(\d{1,4})\b/);
    if (number) return { kind: 'words', count: Number(number[1]) };
    if (/\b(plein|beaucoup|many|max|tas|paquet|lot)\b/.test(text)) return { kind: 'words', count: 'many' };
    return { kind: 'words', count: 'some' };
  }
  if (taking && aboutLines) return { kind: 'clear' };
  if (/^(clear|cls|efface|nettoie|vide)$/.test(text)) return { kind: 'clear' };
  return { kind: 'unknown' };
}

async function handleAsk(raw) {
  const t = askText();
  const intent = askIntent(raw);

  if (intent.kind === 'exit') {
    leaveAsk(t.exit);
    return;
  }
  if (intent.kind === 'tuto') {
    leaveAsk();
    replayTour();
    return;
  }
  if (intent.kind === 'help') {
    printAll(t.help);
    presenceFor('answer', 2600);
    return;
  }
  if (intent.kind === 'ask') {
    print(t.already, 'dim');
    return;
  }
  if (askBusy) {
    print(t.busy, 'dim');
    return;
  }

  askBusy = true;
  try {
    if (intent.kind === 'clear') {
      const gone = await effects?.clearLines();
      if (gone) {
        print(t.cleared, 'tip');
        presenceFor('answer', 2200);
        tutorial?.voice(t.cleared);
      } else {
        print(t.nothing, 'dim');
      }
      return;
    }
    if (intent.kind === 'words') {
      const total = effects?.countWords() || 0;
      const count = intent.count === 'all'
        ? total
        : intent.count === 'many'
          ? Math.max(8, Math.round(total * 0.55))
          : intent.count === 'some'
            ? Math.min(10, total)
            : Math.min(intent.count, total);
      const removed = await effects?.removeWords(count);
      if (removed) {
        const line = t.removed(removed);
        print(line, 'tip');
        presenceFor('answer', 2400);
        tutorial?.voice(line);
      } else {
        print(t.nothing, 'dim');
      }
      return;
    }
    if (intent.kind === 'undo') {
      const back = await effects?.restore();
      if (back) {
        print(t.restored, 'tip');
        tutorial?.voice(t.restored);
      } else {
        print(t.nothing, 'dim');
      }
      presenceFor('answer', 2400);
      return;
    }
    if (intent.kind === 'glitch') {
      await effects?.glitch();
      print(t.glitched, 'dim');
      presenceFor('answer', 1800);
      return;
    }
    if (intent.kind === 'flash') {
      effects?.flash('', 300);
      effects?.burstAtPrompt(18);
      print(t.flashed, 'dim');
      presenceFor('answer', 1200);
      return;
    }
    if (intent.kind === 'status') {
      print(t.status(mode), 'dim');
      return;
    }
    if (intent.kind === 'thanks') {
      print(t.thanks, 'tip');
      return;
    }
    if (intent.kind === 'hello') {
      print(t.hello, 'tip');
      return;
    }
    print(t.unknown, 'dim');
    tutorial?.voice(t.unknown);
  } finally {
    askBusy = false;
  }
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
async function typeHelp(cancelled = () => false) {
  input.focus();
  input.value = '';
  for (const ch of 'help') {
    if (cancelled()) {
      input.value = '';
      return;
    }
    input.value += ch;
    await wait(70);
  }
  if (cancelled()) {
    input.value = '';
    return;
  }
  const arrived = new Promise((resolve) => { helpWaiter = resolve; });
  form.requestSubmit();
  await arrived;
}

// The first tour, a replay from capri::tuto, or the short hello on a later open.
function runTour({ first = false, replay = false } = {}) {
  if (!tutorial || tutorial.running) return false;
  if (askMode) leaveAsk();
  input.readOnly = Boolean(first);
  tutorial.start({ first, replay, typeHelp: (cancelled) => typeHelp(cancelled) })
    .catch((err) => console.warn('[terminal] her tour stopped:', err?.message || err))
    .finally(() => {
      firstTour = false;
      input.readOnly = false;
      input.focus();
      if (pendingTour) {
        const next = pendingTour;
        pendingTour = null;
        print(askText().replay, 'dim');
        runTour(next);
      }
    });
  return true;
}

function replayTour() {
  if (!tutorial) return;
  if (tutorial.running) {
    pendingTour = { first: true, replay: true };
    return;
  }
  print(askText().replay, 'dim');
  runTour({ first: true, replay: true });
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
  if (askMode) {
    tutorial?.hush(); // typing a request takes the floor: her last caption steps aside
    await handleAsk(text);
    input.focus();
    return;
  }
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
    effects?.clearLines();
    return;
  }
  if (e.key === 'Escape') {
    if (tutorial?.running && tutorial.skippable) {
      tutorial.skip();
      return;
    }
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
    effects?.clearLines().then(() => presence('idle'));
    return;
  }
  if (result.capri?.kind === 'tuto') {
    presenceFor('answer', 2600);
    replayTour();
    return;
  }
  if (result.capri?.kind === 'ask') {
    enterAsk();
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
  lang = info.lang || 'en';
  setMode(info.mode);
  promptEl.textContent = promptText();
  effects = new Effects({
    lines,
    reduced: () => info.motion === 'reduced'
      || (info.motion !== 'full'
        && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)),
  });

  print(`Microsoft Windows [version ${info.release}]`, 'out');
  print('(c) Microsoft Corporation. All rights reserved.', 'dim');
  print('');
  print('CAPRICORN // her terminal: she listens in here.', 'title');
  print(`Mode: ${mode.toUpperCase()}. Type capri::help for her commands.`, 'tip');
  print('');
  input.focus();
  effects.spawn();

  // Her hello, and the first time, her tour: she comes in, points, types help, explains each
  // command. Read-only while she shows you around, so your own typing does not race hers.
  tutorial = new Tutorial({
    lang,
    motion: info.motion || 'auto',
    onDone: () => window.terminal.tutorialDone(),
  });
  runTour({ first: Boolean(info.tutorial) });

  // Escape only tucks the window away: the page stays, so she waves again when it comes back.
  window.terminal.onShown?.(() => {
    effects?.spawn();
    if (firstTour || tutorial.running) return;
    tutorial.greet().catch((err) => console.warn('[terminal] her hello stopped:', err?.message || err));
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
