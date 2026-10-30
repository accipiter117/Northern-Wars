// Music and interface sounds. The soundtrack streams from an audio element
// (a decoded three-minute buffer would cost phones tens of megabytes) routed
// through Web Audio so its volume works on iOS too. Every interface sound is
// synthesised here at runtime: no files, small, and easy to retune.
//
// Browsers only allow sound after a tap, so nothing plays until the first
// one. Settings live in the per-device prefs beside vibration and hints.

export const MUSIC_SRC = 'assets/audio/march-of-the-shadow.m4a';
const DEFAULTS = { music: 0.4, sfx: 0.6 };
const MAX_VOICES = 4;
const LOG_MAX = 50;

export function soundPrefs(prefs) {
  return {
    music: typeof prefs.musicVolume === 'number' ? prefs.musicVolume : DEFAULTS.music,
    sfx: typeof prefs.sfxVolume === 'number' ? prefs.sfxVolume : DEFAULTS.sfx,
    musicOn: prefs.musicOn !== false,
    sfxOn: prefs.sfxOn !== false,
  };
}

export function createAudio(prefs, { save = () => {} } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noise = null;
  let el = null;
  let unlocked = false;
  let voices = 0;
  let duckUntil = 0;
  const log = [];
  const heard = [];

  const s = () => soundPrefs(prefs);
  const musicLevel = () => (s().musicOn ? s().music : 0);
  const sfxLevel = () => (s().sfxOn ? s().sfx : 0);

  // Let the soundtrack respect the iPhone's silent switch and mix with the
  // player's own audio rather than stopping it.
  // By default the music follows the iPhone's silent switch, as most games'
  // music does; a setting lets it play on silent too.
  function session() {
    try { if (navigator.audioSession) navigator.audioSession.type = prefs.playOnSilent ? 'playback' : 'ambient'; } catch { /* older Safari */ }
  }
  session();

  function graph() {
    if (ctx || !AC) return !!ctx;
    try { ctx = new AC(); } catch { ctx = null; return false; }
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxLevel();
    sfxGain.connect(master);
    // One second of white noise, reused by every paper, wood and seal sound.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function musicEl() {
    if (el) return el;
    el = new Audio();
    el.src = MUSIC_SRC;
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.setAttribute('playsinline', '');
    try {
      ctx.createMediaElementSource(el).connect(musicGain);
    } catch { /* already routed, or no Web Audio: plays at element volume */ }
    return el;
  }

  function ramp(param, to, secs) {
    if (!ctx) return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + secs);
  }

  function startMusic(fade = 2) {
    if (!ctx || !musicLevel()) return;
    const e = musicEl();
    const p = e.play();
    if (p?.catch) p.catch(() => {});
    ramp(musicGain.gain, musicLevel(), fade);
  }

  function stopMusic(fade = 0.6) {
    if (!ctx || !el) return;
    ramp(musicGain.gain, 0, fade);
    const e = el;
    setTimeout(() => { if (musicGain.gain.value < 0.01 || document.hidden || !musicLevel()) e.pause(); }, fade * 1000 + 50);
  }

  // The first tap anywhere unlocks sound and starts the music. On phones only
  // the end of a touch counts as a tap for sound (a finger going down does
  // not), so listen for the release and the click as well, and keep trying
  // until the browser has really let sound play.
  const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];
  function unlock() {
    if (unlocked) return;
    if (!graph()) return;
    const ready = () => {
      if (unlocked || ctx.state !== 'running') return;
      unlocked = true;
      for (const g of GESTURES) document.removeEventListener(g, unlock, true);
      startMusic(2);
    };
    if (ctx.state === 'running') ready();
    else ctx.resume().then(ready, () => {});
    // Safari also wants the media element itself started inside the gesture.
    if (musicLevel()) {
      const e = musicEl();
      const p = e.play();
      if (p?.catch) p.catch(() => {});
    }
  }
  for (const g of GESTURES) document.addEventListener(g, unlock, { capture: true, passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) {
      stopMusic(0.4);
      setTimeout(() => { if (document.hidden) ctx.suspend().catch(() => {}); }, 500);
    } else {
      ctx.resume().catch(() => {});
      startMusic(1.5);
    }
  });

  // The music dips under alerts and horns, then comes back.
  function duck(secs = 1.6) {
    if (!ctx || !el || !musicLevel()) return;
    const now = ctx.currentTime;
    const g = musicGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(musicLevel() * 0.35, now + 0.15);
    g.setValueAtTime(musicLevel() * 0.35, now + secs);
    g.linearRampToValueAtTime(musicLevel(), now + secs + 0.8);
    duckUntil = now + secs + 0.8;
  }

  // ---- synthesis helpers ----
  const vary = (v, amt) => v * (1 + (Math.random() * 2 - 1) * amt);

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function noiseHit(t, { type = 'bandpass', freq = 2000, to = null, q = 1, peak = 0.3, attack = 0.003, decay = 0.05 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, peak, attack, decay);
    src.connect(f).connect(g).connect(sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.05);
  }

  function tone(t, { type = 'sine', freq = 440, to = null, peak = 0.2, attack = 0.005, decay = 0.2, detune = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    o.detune.value = detune;
    const g = ctx.createGain();
    env(g, t, peak, attack, decay);
    o.connect(g).connect(sfxGain);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  // Each sound returns roughly how long it rings, so voices can be counted.
  const SOUNDS = {
    // A soft parchment or wood tick.
    tap(t) {
      noiseHit(t, { freq: vary(2600, 0.08), q: 2.5, peak: 0.16, decay: 0.03 });
      tone(t, { freq: vary(1150, 0.05), peak: 0.035, decay: 0.03 });
      return 0.06;
    },
    // A sheet sliding up, and down again.
    open(t) { noiseHit(t, { freq: vary(700, 0.06), to: 2600, q: 1.2, peak: 0.12, attack: 0.04, decay: 0.16 }); return 0.22; },
    close(t) { noiseHit(t, { freq: vary(2400, 0.06), to: 650, q: 1.2, peak: 0.1, attack: 0.03, decay: 0.15 }); return 0.2; },
    // A light paper flick between tabs.
    flick(t) { noiseHit(t, { type: 'highpass', freq: vary(3200, 0.1), q: 0.7, peak: 0.11, attack: 0.002, decay: 0.05 }); return 0.07; },
    // A wooden thunk: an order given, something built or recruited, a deal signed.
    confirm(t) {
      tone(t, { freq: vary(150, 0.05), to: 70, peak: 0.32, attack: 0.003, decay: 0.16 });
      noiseHit(t, { type: 'lowpass', freq: 900, q: 0.8, peak: 0.18, decay: 0.06 });
      return 0.22;
    },
    // A wax seal pressed: a law, a treaty, a peace.
    seal(t) {
      tone(t, { freq: vary(95, 0.04), to: 45, peak: 0.38, attack: 0.004, decay: 0.24 });
      noiseHit(t, { type: 'lowpass', freq: 500, q: 0.7, peak: 0.22, attack: 0.004, decay: 0.09 });
      noiseHit(t + 0.05, { freq: 420, q: 3, peak: 0.07, attack: 0.02, decay: 0.12 });
      return 0.3;
    },
    // Coin on coin.
    coin(t) {
      const base = vary(2150, 0.04);
      for (const [k, i] of [[1, 0], [1.27, 1], [1.59, 2], [1.98, 3]]) tone(t, { freq: base * k, peak: 0.05 - i * 0.008, decay: 0.28 - i * 0.04 });
      const t2 = t + vary(0.075, 0.2);
      for (const [k, i] of [[1.08, 0], [1.41, 1], [1.83, 2]]) tone(t2, { freq: base * k, peak: 0.035 - i * 0.008, decay: 0.22 - i * 0.04 });
      return 0.35;
    },
    // A muted knock: refused.
    knock(t) {
      tone(t, { freq: vary(210, 0.04), to: 150, peak: 0.22, attack: 0.002, decay: 0.07 });
      noiseHit(t, { type: 'lowpass', freq: 600, q: 0.7, peak: 0.12, decay: 0.04 });
      return 0.1;
    },
    // A small hand bell: something waits at court, or a threat is sighted.
    bell(t) {
      const f = vary(880, 0.02);
      for (const [k, p, d] of [[1, 0.09, 1.4], [2.0, 0.035, 0.9], [2.76, 0.03, 0.7], [5.4, 0.015, 0.4]]) tone(t, { freq: f * k, peak: p, attack: 0.002, decay: d });
      duck(1.2);
      return 1.4;
    },
    // A low horn swell: war, or a town besieged.
    horn(t) {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'sawtooth';
      o1.frequency.value = vary(98, 0.01);
      o2.frequency.value = o1.frequency.value * 1.5;
      o2.detune.value = 6;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5;
      lfoGain.gain.value = 1.5;
      lfo.connect(lfoGain).connect(o1.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(700, t + 0.5);
      f.frequency.linearRampToValueAtTime(400, t + 2.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.45);
      g.gain.setValueAtTime(0.16, t + 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(sfxGain);
      for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + 2.4); }
      duck(2.4);
      return 2.4;
    },
    // A soft tick as a long press completes.
    ring(t) { noiseHit(t, { freq: vary(3600, 0.05), q: 4, peak: 0.12, decay: 0.025 }); tone(t, { freq: 1800, peak: 0.03, decay: 0.04 }); return 0.05; },
    // A clock's tick-tock for the speed buttons.
    clock(t) {
      noiseHit(t, { freq: vary(1900, 0.05), q: 5, peak: 0.16, decay: 0.02 });
      noiseHit(t + 0.09, { freq: vary(1500, 0.05), q: 5, peak: 0.12, decay: 0.02 });
      return 0.13;
    },
  };

  function play(kind) {
    log.push(kind);
    if (log.length > LOG_MAX) log.shift();
    if (!ctx || !unlocked || !sfxLevel() || !SOUNDS[kind]) return false;
    if (voices >= MAX_VOICES) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const len = SOUNDS[kind](ctx.currentTime + 0.005);
    heard.push(kind);
    if (heard.length > LOG_MAX) heard.shift();
    voices++;
    setTimeout(() => { voices = Math.max(0, voices - 1); }, Math.min(len, 0.5) * 1000);
    return true;
  }

  // Taps on the interface: a tick for buttons, a flick for tabs, a clock for
  // the speed buttons. The game's own sounds (orders, alerts) come on top.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('button, [role="button"], summary');
    if (!b || b.disabled) return;
    if (b.closest('#tabbar') || b.matches('[data-sub], [data-tsub]')) play('flick');
    else if (b.matches('[data-speed]')) play('clock');
    else if (!b.matches('[data-order]')) play('tap');
  }, { capture: true, passive: true });

  // The sheet's paper sliding in and out.
  const sheet = document.getElementById('sheet');
  if (sheet && 'MutationObserver' in window) {
    let wasHidden = sheet.hidden;
    new MutationObserver(() => {
      if (sheet.hidden === wasHidden) return;
      wasHidden = sheet.hidden;
      play(sheet.hidden ? 'close' : 'open');
    }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }

  // Volume sliders in Help: applied live, kept on release.
  document.addEventListener('input', (e) => {
    const r = e.target.closest?.('[data-volume]');
    if (!r) return;
    const v = Math.max(0, Math.min(1, Number(r.value) / 100));
    if (r.dataset.volume === 'music') prefs.musicVolume = v;
    else prefs.sfxVolume = v;
    apply();
  });
  document.addEventListener('change', (e) => {
    const r = e.target.closest?.('[data-volume]');
    if (!r) return;
    save(prefs);
    if (r.dataset.volume === 'sfx') play('tap');
  });

  function apply() {
    if (!ctx) return;
    ramp(sfxGain.gain, sfxLevel(), 0.05);
    if (ctx.currentTime < duckUntil) return;
    if (musicLevel()) {
      if ((!el || el.paused) && unlocked && !document.hidden) startMusic(0.8);
      else ramp(musicGain.gain, musicLevel(), 0.1);
    } else stopMusic(0.4);
  }

  function set(key, value) {
    prefs[key] = value;
    save(prefs);
    if (key === 'playOnSilent') session();
    apply();
  }

  return {
    play,
    duck,
    set,
    apply,
    get unlocked() { return unlocked; },
    get musicPlaying() { return !!el && !el.paused; },
    // The audio context's state: 'running', 'suspended' (put away) or none yet.
    get context() { return ctx?.state ?? null; },
    get music() { return el; },
    log,
    heard,
  };
}
