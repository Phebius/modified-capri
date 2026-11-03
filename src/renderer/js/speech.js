// Fish Audio synthesizes Capri's selected voice in the main process; this class hands its WAV to Web Audio.

const MAX_CHARS = 520;

function spokenText(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\[\[(?:open|music|media|site|close):[^\]]+\]\]/gi, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

export class SpokenSpeech {
  constructor({ host, voice, onProgress } = {}) {
    this.host = host;
    this.voice = voice;
    this.onProgress = onProgress;
    this.enabled = true;
    this.muted = false;
    this.request = 0;
    this.removeProgressListener = host?.onSpeechProgress?.((progress) => this.onProgress?.(progress));
  }

  configure({ spokenVoice, muted } = {}) {
    if (typeof spokenVoice === 'boolean') this.enabled = spokenVoice;
    if (typeof muted === 'boolean') this.muted = muted;
    if (!this.enabled || this.muted) this.stop();
  }

  stop() {
    this.request++;
    this.voice?.stopSpeech();
  }

  async speak(value) {
    if (!this.enabled || this.muted || !this.host?.speech) return;
    const text = spokenText(value);
    if (!text) return;

    const request = ++this.request;
    this.voice?.stopSpeech();
    try {
      const audio = await this.host.speech(text);
      if (request !== this.request || !this.enabled || this.muted || !audio?.wav?.length) return;
      await this.voice?.playSpeechWav(audio.wav);
    } catch (err) {
      if (request !== this.request) return;
      console.warn('[capri] Fish Audio could not speak:', err?.message || err);
      this.onProgress?.({ phase: 'error', message: err?.message || '' });
    }
  }

  dispose() {
    this.stop();
    this.removeProgressListener?.();
  }
}
