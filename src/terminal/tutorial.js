'use strict';
// Her tutorial, inside the console: the first time her terminal opens she waves at you, flies in,
// circles once in front of the text and once behind it, points her laser at the prompt, types
// `help`, and walks you through every command. She uses the Fish Audio voice when it is set up;
// otherwise her lines still show, timed to be read. Every later open gets the wave and a hello.

import { SpriteRenderer } from '../renderer/js/sprite.js';

const FRAME = 1000 / 12;
const ART = '../../assets/capri';

const LINES = {
  fr: {
    hello: 'Te voilà. Mon terminal est à toi.',
    intro: 'Oh, tu m\'as ouverte. Attends, je te fais le tour.',
    prompt: 'Ça, c\'est le prompt. C\'est là que tu écris.',
    help: 'Tape help pour voir toutes les commandes.',
    play: 'Voilà. À toi de jouer.',
    cmds: {
      'capri::companion.activate': 'Companion. Je touche à tes applications et je t\'accompagne.',
      'capri::code_viewer.activate': 'Code viewer. Je reste calme pendant que tu travailles.',
      'capri::status': 'Status. Je te dis dans quel mode je suis.',
      help: 'Help. La liste des commandes de cmd, et des miennes.',
      cls: 'Cls. J\'efface l\'écran.',
      exit: 'Exit. Je ferme mon terminal.',
    },
  },
  en: {
    hello: 'There you are. My terminal is yours.',
    intro: 'Oh, you opened me. Wait, let me show you around.',
    prompt: 'That is the prompt. That is where you type.',
    help: 'Type help to see every command :>/.',
    play: 'There. Your turn :D/.',
    cmds: {
      'capri::companion.activate': 'Companion. I reach into your apps and come along with you.',
      'capri::code_viewer.activate': 'Code viewer. I stay calm while you work.',
      'capri::status': 'Status. It tells you which mode I am in.',
      help: 'Help. cmd\'s commands, and mine.',
      cls: 'Cls. I clear the screen.',
      exit: 'Exit. I close my terminal.',
    },
  },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

class SpeechAudio {
  constructor() {
    this.ctx = null;
    this.source = null;
  }

  async play(wav) {
    if (!wav?.length) return false;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx ||= new Ctx();
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
      const bytes = wav instanceof Uint8Array ? wav : new Uint8Array(wav);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const buffer = await this.ctx.decodeAudioData(data);
      this.stop();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      this.source = source;
      return await new Promise((resolve) => {
        source.onended = () => {
          if (this.source === source) this.source = null;
          resolve(true);
        };
        source.start();
      });
    } catch {
      return false;
    }
  }

  stop() {
    if (!this.source) return;
    try { this.source.stop(); } catch {}
    this.source = null;
  }
}

export class Tutorial {
  constructor({ lang = 'en', onDone = null } = {}) {
    this.t = LINES[lang] || LINES.en;
    this.onDone = onDone;
    this.layer = document.getElementById('tutorial');
    this.body = document.getElementById('tut-body');
    this.canvas = document.getElementById('tut-capri');
    this.laserEl = document.getElementById('tut-laser');
    this.line = document.getElementById('tut-laser-line');
    this.dot = document.getElementById('tut-laser-dot');
    this.captionEl = document.getElementById('tut-caption');
    this.cutinEl = document.getElementById('tut-cutin');
    this.waveEl = document.getElementById('tut-wave');
    this.linesEl = document.getElementById('lines');
    this.audio = new SpeechAudio();
    this.renderer = null;
    this.fallback = null;
    this.size = { w: 0, h: 0 };
    this.pose = { x: 0, y: 0, rot: 0 };
    this.scale = 0.4;
    this.running = false;
    this.pointing = false;
    this.waves = ['wave1', 'wave3', 'wave2', 'wave3'];
    this.frame = requestAnimationFrame.bind(window);
    this.raf = 0;
  }

  reduced() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  async prepare() {
    const image = new Image();
    image.src = `${ART}/capri-full.png`;
    await image.decode().catch(() => {});
    try {
      this.renderer = new SpriteRenderer(this.canvas, image);
      this.resize();
    } catch {
      // No WebGL here: she still comes in, just as her flat cut-out.
      this.renderer = null;
      const flat = document.createElement('img');
      flat.className = 'term__tut-fallback';
      flat.src = image.src;
      flat.alt = '';
      this.body.append(flat);
      this.canvas.remove();
      this.fallback = flat;
      await new Promise((resolve) => { flat.onload = resolve; flat.onerror = resolve; });
      this.size = { w: flat.clientWidth || 112, h: flat.clientHeight || 196 };
      this.body.style.width = `${this.size.w}px`;
      this.body.style.height = `${this.size.h}px`;
    }
    this.startDrawing();
  }

  resize() {
    const scale = clamp(window.innerHeight / 470, 0.7, 1.15) * 0.4;
    this.scale = scale;
    this.renderer.resize(scale);
    const s = SpriteRenderer.cssSize(scale);
    this.size = { w: s.width, h: s.height };
    this.body.style.width = `${s.width}px`;
    this.body.style.height = `${s.height}px`;
  }

  startDrawing() {
    if (!this.renderer) return;
    const draw = (now) => {
      const seed = Math.floor(now / FRAME);
      const t = now / 1000;
      const flying = !this.pointing;
      this.renderer.draw({
        seed,
        boil: 0.9,
        hair: Math.sin(t * 4.2) * (flying ? 10 : 4),
        head: 0.05 * Math.sin(t * 3.1),
        mane: flying ? 0.35 : 0.16,
        armL: flying ? 0.8 + 0.14 * Math.sin(t * 5.1) : 0,
        armR: flying ? 0.55 + 0.14 * Math.cos(t * 5.1) : 0.22,
        longL: 1,
        longR: 1,
        sit: 0,
        bend: 0,
        kickL: flying ? 0.26 * Math.sin(t * 6.3) : 0,
        kickR: flying ? -0.26 * Math.sin(t * 6.3) : 0,
        smear: [0, 0],
        echo: [0, 0],
        glitch: 0,
        glitchSeed: seed,
        split: 0,
        collapse: 0,
        dissolve: 0,
        sparkle: 1,
        grade: 1,
        sil: [0.08, 0.06, 0.11],
        silAmount: 0,
        misreg: [-2.6, 2.2],
        alpha: 1,
      });
      this.raf = this.frame(draw);
    };
    this.raf = this.frame(draw);
  }

  stopDrawing() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setPose(x, y, rot) {
    this.pose = { x, y, rot };
    this.body.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  }

  tween(ms, fn) {
    return new Promise((resolve) => {
      const started = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - started) / ms);
        fn(k);
        if (k < 1) this.frame(step);
        else resolve();
      };
      this.frame(step);
    });
  }

  async show() {
    this.layer.hidden = false;
    this.layer.className = 'term__tutorial is-front';
    this.body.style.opacity = '1';
    document.body.classList.add('is-tutorial');
  }

  async say(text) {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('is-on');
    let played = false;
    try {
      const audio = await window.terminal.speak(text);
      if (audio?.wav?.length) played = await this.audio.play(audio.wav);
    } catch {}
    if (!played) await wait(Math.max(1400, text.length * 58));
    await wait(240);
    this.captionEl.classList.remove('is-on');
  }

  async cutin(first, speech) {
    this.cutinEl.hidden = false;
    this.cutinEl.classList.remove('is-in', 'is-out');
    let i = 0;
    this.waveEl.src = `${ART}/intro-${this.waves[0]}.webp`;
    void this.cutinEl.offsetWidth;
    this.cutinEl.classList.add('is-in');
    const frames = setInterval(() => {
      i += 1;
      this.waveEl.src = `${ART}/intro-${this.waves[i % this.waves.length]}.webp`;
    }, 140);
    await wait(first ? 1300 : 1100);
    clearInterval(frames);
    this.waveEl.src = `${ART}/intro-happy.webp`;
    await wait(first ? 560 : 420);
    this.cutinEl.classList.remove('is-in');
    this.cutinEl.classList.add('is-out');
    await wait(250);
    this.cutinEl.hidden = true;
    this.cutinEl.classList.remove('is-out');
    await speech;
  }

  async enter(reduced) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (reduced) {
      const o = this.orbit();
      this.setPose(o.cx - o.s.w / 2, o.cy - o.s.h / 2, 0);
      await wait(320);
      return;
    }
    const o = this.orbit();
    const from = { x: w + 24, y: h * 0.62, rot: -38 };
    const to = { x: o.cx - o.s.w / 2, y: o.cy - o.ry - o.s.h / 2, rot: 0 };
    this.setPose(from.x, from.y, from.rot);
    await this.tween(500, (k) => {
      const e = easeOut(k);
      this.setPose(lerp(from.x, to.x, e), lerp(from.y, to.y, e), lerp(from.rot, to.rot, e));
    });
  }

  orbit() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      cx: w * 0.44,
      cy: h * 0.4,
      rx: Math.max(80, w * 0.2),
      ry: Math.max(58, h * 0.16),
      s: this.size,
    };
  }

  async circle(ms) {
    const o = this.orbit();
    await this.tween(ms, (k) => {
      const a = -Math.PI / 2 + k * Math.PI * 2;
      this.setPose(
        o.cx + Math.cos(a) * o.rx - o.s.w / 2,
        o.cy + Math.sin(a) * o.ry - o.s.h / 2,
        (a * 180) / Math.PI + 90,
      );
    });
  }

  async moveTo(x, y, rot, ms) {
    const from = { ...this.pose };
    await this.tween(ms, (k) => {
      const e = easeOut(k);
      this.setPose(lerp(from.x, x, e), lerp(from.y, y, e), lerp(from.rot, rot, e));
    });
  }

  handPoint() {
    const local = { x: 80 * this.scale, y: 268 * this.scale };
    const cx = this.size.w / 2;
    const cy = this.size.h / 2;
    const a = (this.pose.rot * Math.PI) / 180;
    const dx = local.x - cx;
    const dy = local.y - cy;
    return {
      x: this.pose.x + cx + dx * Math.cos(a) - dy * Math.sin(a),
      y: this.pose.y + cy + dx * Math.sin(a) + dy * Math.cos(a),
    };
  }

  laserAt(target) {
    const hand = this.handPoint();
    const dx = target.x - hand.x;
    const dy = target.y - hand.y;
    const len = Math.hypot(dx, dy);
    this.line.style.width = `${len}px`;
    this.line.style.transform = `translate(${hand.x}px, ${hand.y}px) rotate(${Math.atan2(dy, dx)}rad)`;
    this.dot.style.left = `${target.x - 5}px`;
    this.dot.style.top = `${target.y - 5}px`;
    this.laserEl.classList.add('is-on');
  }

  laserOff() {
    this.laserEl.classList.remove('is-on');
  }

  async toPrompt(reduced) {
    const r = document.getElementById('prompt').getBoundingClientRect();
    const target = { x: r.right + 8, y: r.top + r.height / 2 };
    this.pointing = true;
    const x = target.x - 80 * this.scale;
    const y = target.y - 268 * this.scale;
    await this.moveTo(x, y, -4, reduced ? 280 : 680);
    this.laserAt(target);
  }

  async guide(reduced) {
    this.laserOff();
    await this.moveTo(window.innerWidth - this.size.w - 16, window.innerHeight * 0.42, 0, reduced ? 280 : 560);
  }

  async leave(reduced) {
    this.laserOff();
    this.pointing = false;
    const x = window.innerWidth - this.size.w - 2;
    const y = window.innerHeight - this.size.h - 2;
    await this.moveTo(x, y, 0, reduced ? 240 : 680);
    this.body.style.opacity = '0';
    await wait(320);
    this.layer.hidden = true;
    document.body.classList.remove('is-tutorial');
  }

  async full(reduced) {
    const t = this.t;
    const intro = this.say(t.intro);
    await this.cutin(true, intro);
    await this.enter(reduced);
    if (!reduced) {
      await this.circle(1700);
      this.layer.className = 'term__tutorial is-behind';
      await this.circle(1400);
      this.layer.className = 'term__tutorial is-front';
    }
    await this.toPrompt(reduced);
    await this.say(t.prompt);

    const help = this.say(t.help);
    await this.typeHelp();
    await help;

    await this.guide(reduced);
    for (const [cmd, line] of Object.entries(t.cmds)) {
      const target = [...this.linesEl.children].find((node) => node.textContent.trim().startsWith(cmd));
      if (!target) continue;
      target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      await wait(reduced ? 60 : 300);
      const r = target.getBoundingClientRect();
      this.laserAt({ x: Math.max(18, r.left + 10), y: r.top + r.height / 2 });
      target.classList.add('is-tut');
      await this.say(line);
      target.classList.remove('is-tut');
    }
    this.laserOff();
    await this.say(t.play);
    await this.leave(reduced);
  }

  async quick() {
    const hello = this.say(this.t.hello);
    await this.cutin(false, hello);
    document.body.classList.remove('is-tutorial');
    this.layer.hidden = true;
  }

  async start({ first = false, typeHelp = async () => {} } = {}) {
    if (this.running) return false;
    this.running = true;
    this.typeHelp = typeHelp;
    try {
      await this.prepare();
      await this.show();
      if (first) await this.full(this.reduced());
      else await this.quick();
      if (first) this.onDone?.();
      return true;
    } finally {
      this.running = false;
      this.stopDrawing();
      this.laserOff();
      this.captionEl.classList.remove('is-on');
      this.cutinEl.hidden = true;
      this.layer.hidden = true;
      document.body.classList.remove('is-tutorial');
      this.body.style.opacity = '0';
    }
  }
}
