let audioCtx = null;
let compressor = null;
let lastIncompleteAlarmKey = null;

export function initAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 8;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;
      compressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  } catch {
    audioCtx = null;
    compressor = null;
  }
}

function destination() {
  return compressor || (audioCtx ? audioCtx.destination : null);
}

function scheduleTone(freq, start, duration, peak, type) {
  if (!audioCtx) return;
  const dest = destination();
  if (!dest) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.connect(gain);
  gain.connect(dest);
  const fade = Math.min(0.018, duration / 6);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + fade);
  gain.gain.setValueAtTime(peak, start + duration - fade);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playIncompleteMeasurementAlarm(soundEnabled = true, alertKey = null) {
  if (!soundEnabled) return;
  if (alertKey && lastIncompleteAlarmKey === alertKey) return;
  if (alertKey) lastIncompleteAlarmKey = alertKey;
  try {
    initAudio();
    if (!audioCtx) return;
    const peak = 0.27;
    const note = 0.18;
    const gap = 0.06;
    const setGap = 0.12;
    let t = audioCtx.currentTime + 0.02;
    for (let i = 0; i < 3; i += 1) {
      scheduleTone(1000, t, note, peak, "triangle");
      t += note + gap;
      scheduleTone(720, t, note, peak, "triangle");
      t += note;
      if (i < 2) t += setGap;
    }
  } catch {
    /* visual flow continues */
  }
}

export function playAdditionalHeatingNotice(soundEnabled = true) {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime + 0.01;
    scheduleTone(520, t, 0.14, 0.06, "sine");
  } catch {
    /* visual flow continues */
  }
}

export function playMeasurementCompleteSound(soundEnabled = true) {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime + 0.01;
    scheduleTone(660, t, 0.09, 0.055, "sine");
    scheduleTone(880, t + 0.08, 0.11, 0.05, "sine");
  } catch {
    /* visual flow continues */
  }
}

export function clearIncompleteAlarmKey(alertKey) {
  if (lastIncompleteAlarmKey === alertKey) lastIncompleteAlarmKey = null;
}
