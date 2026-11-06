'use strict';
// The console's show: the flash when she arrives, sparks around the text, lines that boot in,
// words she burns out, whole rows she cuts away. terminal.js asks for the effect, this file
// does the drawing. Everything respects the motion setting.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (a, b) => a + Math.random() * (b - a);

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Split a line into word spans, leaving the spaces between them as text nodes so the line
// still wraps the way it did. Runs over a copy of the text nodes first, so wrapping one does
// not change the list under the walker.
function wrapWords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue.trim()) continue;
    if (node.parentElement?.closest('.term__word')) continue;
    nodes.push(node);
  }
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.append(document.createTextNode(part));
      } else {
        const word = document.createElement('span');
        word.className = 'term__word';
        word.textContent = part;
        frag.append(word);
      }
    }
    node.replaceWith(frag);
  }
}

export class Effects {
  constructor({ lines, body = document.body, reduced = () => false } = {}) {
    this.lines = lines;
    this.body = body;
    this.reduced = reduced;
    this.flashEl = document.getElementById('flash');
    this.burstEl = document.getElementById('burst');
    this.flashTimer = 0;
    this.lastCleared = null;
  }

  get still() {
    return this.reduced();
  }

  flash(color = '', ms = 300) {
    if (!this.flashEl) return;
    this.flashEl.style.setProperty('--flash-color', color || 'var(--cap)');
    this.flashEl.classList.remove('is-on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('is-on');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashEl.classList.remove('is-on'), ms);
  }

  // One spark, thrown from a point, gone in half a second.
  spark(x, y, { angle = rand(0, Math.PI * 2), distance = rand(18, 68), size = rand(2, 5) } = {}) {
    if (this.still || !this.burstEl) return;
    const dot = document.createElement('i');
    dot.className = 'term__spark';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    this.burstEl.append(dot);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const anim = dot.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0 },
      ],
      { duration: rand(320, 720), easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    anim.onfinish = () => dot.remove();
  }

  burst(x, y, count = 16, spread = 70) {
    if (this.still) return;
    for (let i = 0; i < count; i += 1) {
      this.spark(x + rand(-8, 8), y + rand(-8, 8), { distance: rand(spread * 0.3, spread) });
    }
  }

  burstAtPrompt(count = 18) {
    const prompt = document.getElementById('prompt');
    const r = prompt?.getBoundingClientRect();
    if (!r) return;
    this.burst(r.right - 4, r.top + r.height / 2, count, 64);
  }

  // The terminal waking up around her: a hard flash, a shower of sparks, the HUD booting.
  async spawn() {
    this.body.classList.add('is-spawn');
    this.flash('', 380);
    const term = document.getElementById('term');
    const r = term?.getBoundingClientRect();
    if (r) this.burst(r.left + r.width / 2, r.top + r.height * 0.36, 24, 100);
    await wait(this.still ? 0 : 640);
    this.body.classList.remove('is-spawn');
  }

  // A line of text arriving: a short slice-and-flicker, not the full boot.
  lineIn(node) {
    if (!node || this.still) return;
    if (node.classList.contains('stamp') || node.classList.contains('banner')) return;
    node.classList.add('is-line-in');
    node.addEventListener('animationend', () => node.classList.remove('is-line-in'), { once: true });
  }

  async glitch(ms = 620) {
    if (this.still) {
      this.flash('', 140);
      return;
    }
    this.body.classList.add('is-glitching');
    this.flash('', 180);
    await wait(ms);
    this.body.classList.remove('is-glitching');
  }

  // Every word in the console, wrapped so it can be taken away on its own.
  words() {
    for (const row of this.lines.querySelectorAll(':scope > div')) wrapWords(row);
    return [...this.lines.querySelectorAll('.term__word')]
      .filter((word) => !word.classList.contains('is-gone'));
  }

  countWords() {
    return this.words().length;
  }

  // Take `count` words out at random, one after the other, with a spark on every third.
  async removeWords(count = 8) {
    const all = this.words();
    if (!all.length) return 0;
    const chosen = shuffle(all).slice(0, Math.min(count, all.length));
    const stagger = 36;
    chosen.forEach((word, i) => {
      const delay = this.still ? 0 : Math.min(760, i * stagger);
      setTimeout(() => {
        const r = word.getBoundingClientRect();
        word.style.setProperty('--dx', `${rand(-26, 26).toFixed(1)}px`);
        word.style.setProperty('--dy', `${rand(-22, 20).toFixed(1)}px`);
        word.classList.add('is-gone');
        if (!this.still && i % 3 === 0 && r.width) {
          this.burst(r.left + r.width / 2, r.top + r.height / 2, 4, 28);
        }
        setTimeout(() => word.remove(), this.still ? 0 : 430);
      }, delay);
    });
    await wait(this.still ? 0 : Math.min(760, chosen.length * stagger) + 450);
    return chosen.length;
  }

  // Cut every line out, staggered from the top down, and leave the prompt waiting.
  async clearLines() {
    const rows = [...this.lines.children].filter((row) => !row.classList.contains('is-clearing'));
    if (!rows.length) return 0;
    this.lastCleared = rows;
    rows.forEach((row, i) => {
      row.style.setProperty('--dx', `${rand(-70, 70).toFixed(1)}px`);
      row.style.animationDelay = this.still ? '0ms' : `${Math.min(620, i * 42)}ms`;
      row.classList.add('is-clearing');
    });
    await wait(this.still ? 0 : Math.min(620, rows.length * 42) + 520);
    for (const row of rows) if (row.parentNode === this.lines) row.remove();
    this.flash();
    const r = this.lines.getBoundingClientRect();
    this.burst(r.left + r.width / 2, r.top + 22, 22, 86);
    return rows.length;
  }

  // Put back the rows she just cleared, the same way they left.
  async restore() {
    const rows = this.lastCleared;
    if (!rows?.length) return 0;
    this.lastCleared = null;
    this.lines.append(...rows);
    for (const row of rows) {
      row.classList.remove('is-clearing');
      row.style.animationDelay = '';
      row.style.removeProperty('--dx');
      this.lineIn(row);
    }
    this.flash();
    await wait(this.still ? 0 : 300);
    return rows.length;
  }
}
