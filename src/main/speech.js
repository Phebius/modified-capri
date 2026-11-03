'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');

const FISH = {
  endpoint: 'https://api.fish.audio/v1/tts',
  model: 's2.1-pro-free',
  voiceId: '370054c08fe7423190c4bef3c2f1902b',
  sampleRate: 24000,
};

class CapriSpeech {
  constructor(userDataPath, onProgress = () => {}) {
    this.keyFile = path.join(userDataPath, 'fish-audio-key.enc');
    this.onProgress = onProgress;
    this.request = null;
  }

  hasApiKey() {
    return fs.existsSync(this.keyFile);
  }

  async setApiKey(value) {
    const key = String(value || '').trim();
    if (!key) {
      this.cancel();
      fs.rmSync(this.keyFile, { force: true });
      return { ok: true, cleared: true };
    }
    if (key.length > 1000) return { ok: false, error: 'Cette clé Fish Audio est trop longue.' };
    if (!await safeStorage.isAsyncEncryptionAvailable()) {
      return { ok: false, error: 'Le stockage sécurisé du système est indisponible ; la clé n’a pas été enregistrée.' };
    }

    this.cancel();
    const encrypted = await safeStorage.encryptStringAsync(key);
    fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
    fs.writeFileSync(this.keyFile, encrypted);
    return { ok: true, cleared: false };
  }

  async readApiKey() {
    if (!this.hasApiKey()) return '';
    if (!await safeStorage.isAsyncEncryptionAvailable()) {
      throw new Error('Le stockage sécurisé du système est indisponible.');
    }
    const encrypted = await fs.promises.readFile(this.keyFile);
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(encrypted);
    if (shouldReEncrypt) {
      const renewed = await safeStorage.encryptStringAsync(result);
      await fs.promises.writeFile(this.keyFile, renewed);
    }
    return result;
  }

  async speak(text) {
    const key = await this.readApiKey();
    if (!key) {
      const error = new Error('Configure ta clé Fish Audio dans le menu Capri > Son.');
      error.code = 'FISH_API_KEY_MISSING';
      throw error;
    }

    this.cancel();
    const controller = new AbortController();
    this.request = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    timeout.unref?.();
    this.onProgress({ phase: 'fish' });
    try {
      const response = await fetch(FISH.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          model: FISH.model,
        },
        body: JSON.stringify({
          text: String(text || '').slice(0, 520),
          reference_id: FISH.voiceId,
          format: 'wav',
          sample_rate: FISH.sampleRate,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = payload.message || payload.detail || payload.error || '';
        } catch {}
        if (response.status === 401 || response.status === 403) {
          throw new Error('Fish Audio refuse cette clé. Vérifie-la dans le menu Capri > Son.');
        }
        if (response.status === 402) throw new Error('Fish Audio demande un quota disponible pour cette voix.');
        if (response.status === 404) throw new Error('Fish Audio ne trouve pas cette voix. Vérifie son ID.');
        if (response.status === 429) throw new Error('Fish Audio est momentanément limité. Réessaie dans un instant.');
        throw new Error(`Fish Audio a répondu HTTP ${response.status}${detail ? ` : ${String(detail).slice(0, 220)}` : '.'}`);
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > 24 * 1024 * 1024) {
        throw new Error('Fish Audio a renvoyé un fichier audio trop volumineux.');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 44 || bytes.length > 24 * 1024 * 1024) throw new Error('Fish Audio a renvoyé un fichier audio invalide.');
      if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') {
        throw new Error('Fish Audio n’a pas renvoyé un fichier WAV lisible.');
      }
      this.onProgress({ phase: 'ready' });
      return { wav: bytes };
    } finally {
      clearTimeout(timeout);
      if (this.request === controller) this.request = null;
    }
  }

  cancel() {
    this.request?.abort();
    this.request = null;
  }

  dispose() {
    this.cancel();
  }
}

module.exports = { CapriSpeech, FISH };
