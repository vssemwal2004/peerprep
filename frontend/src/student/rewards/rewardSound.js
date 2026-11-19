// PeerPrep's own reward sounds, synthesised with Web Audio (no audio files to download).
// - coin:   a bright two-step metallic "clink" with a short shimmer
// - login:  a soft rising chime (first open of the day)
// - badge:  a four-note rising arpeggio with a sparkle (badge level reached)
// - notice: a single gentle ping (new progress notification)
// Browsers only allow sound after the user has interacted with the page; until then the context is
// suspended and we resume it on the first tap or key press. Students can mute all of these.

const STORAGE_KEY = 'peerprep:reward-sounds';
export const SOUND_SETTING_EVENT = 'peerprep:reward-sounds-changed';

export function soundsEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function setSoundsEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode: stays on for this tab */ }
  window.dispatchEvent(new Event(SOUND_SETTING_EVENT));
}

let context = null;
function audio() {
  if (context) return context;
  const AudioContext = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AudioContext) return null;
  try { context = new AudioContext(); } catch { context = null; }
  return context;
}

/** Resumes audio on the first interaction so later rewards can play. Safe to call repeatedly. */
export function unlockRewardSounds() {
  if (typeof window === 'undefined') return () => {};
  const resume = () => { audio()?.resume?.().catch(() => {}); };
  window.addEventListener('pointerdown', resume, { once: true, passive: true });
  window.addEventListener('keydown', resume, { once: true });
  return () => {
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
  };
}

function tone(ctx, { frequency, start, duration, type = 'sine', gain = 0.12, slideTo = null }) {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration * 0.6);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

const SOUNDS = {
  coin: (ctx, t) => {
    tone(ctx, { frequency: 1480, slideTo: 1760, start: t, duration: 0.11, type: 'triangle', gain: 0.14 });
    tone(ctx, { frequency: 2217, start: t + 0.07, duration: 0.42, type: 'triangle', gain: 0.12 });
    tone(ctx, { frequency: 4434, start: t + 0.07, duration: 0.22, gain: 0.025 });
    tone(ctx, { frequency: 2960, start: t + 0.16, duration: 0.3, gain: 0.03 });
  },
  login: (ctx, t) => {
    tone(ctx, { frequency: 784, start: t, duration: 0.22, type: 'sine', gain: 0.1 });
    tone(ctx, { frequency: 1175, start: t + 0.1, duration: 0.3, type: 'triangle', gain: 0.1 });
    tone(ctx, { frequency: 1568, slideTo: 1760, start: t + 0.2, duration: 0.5, type: 'triangle', gain: 0.11 });
  },
  badge: (ctx, t) => {
    [659.25, 830.61, 987.77, 1318.51].forEach((frequency, index) => {
      tone(ctx, { frequency, start: t + index * 0.085, duration: 0.36, type: 'triangle', gain: 0.12 });
    });
    tone(ctx, { frequency: 2637, start: t + 0.36, duration: 0.6, gain: 0.04 });
    tone(ctx, { frequency: 3951, start: t + 0.42, duration: 0.45, gain: 0.02 });
  },
  notice: (ctx, t) => {
    tone(ctx, { frequency: 1046.5, start: t, duration: 0.28, type: 'sine', gain: 0.08 });
    tone(ctx, { frequency: 1568, start: t + 0.06, duration: 0.3, type: 'sine', gain: 0.04 });
  },
};

let lastPlayedAt = 0;

/** Plays one reward sound unless muted. Bursts are thinned so a batch of rewards does not clatter. */
export function playRewardSound(kind = 'coin') {
  if (!soundsEnabled()) return;
  const ctx = audio();
  const sound = SOUNDS[kind] || SOUNDS.coin;
  if (!ctx) return;
  const now = Date.now();
  if (now - lastPlayedAt < 120) return;
  lastPlayedAt = now;
  const play = () => { try { sound(ctx, ctx.currentTime + 0.01); } catch { /* audio unavailable */ } };
  if (ctx.state === 'suspended') ctx.resume().then(play).catch(() => {});
  else play();
}
