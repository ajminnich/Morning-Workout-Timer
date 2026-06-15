(() => {
  'use strict';

  const STORE_KEY = 'core-pushup-timer.device-defaults.v1';
  const AUDIO_SOURCES = [
    { src: 'assets/alpine-ski-clock-full.mp3', type: 'audio/mpeg' },
    { src: 'assets/alpine-ski-clock-full.m4a', type: 'audio/mp4' },
    { src: 'assets/alpine-ski-clock-full.wav', type: 'audio/wav' }
  ];
  const ALERT_SOUND_SRC = AUDIO_SOURCES[0].src;
  const VOICE_CUES = {
    'front plank': 'assets/voice/front-plank.wav',
    'abs brace': 'assets/voice/abs-brace.wav',
    'hand slides': 'assets/voice/hand-slides.wav',
    'alternating crunch': 'assets/voice/alternating-crunch.wav',
    'hand to heel': 'assets/voice/hand-to-heel.wav',
    'hip raises': 'assets/voice/hip-raises.wav',
    'reverse crunch': 'assets/voice/reverse-crunch.wav',
    'boat hold': 'assets/voice/boat-hold.wav',
    'chair sit ups': 'assets/voice/chair-sit-ups.wav',
    'spider': 'assets/voice/spider.wav',
    'push ups': 'assets/voice/push-ups.wav',
    'get ready': 'assets/voice/get-ready.wav',
    'workout complete': 'assets/voice/workout-complete.wav',
    'sound ready': 'assets/voice/sound-ready.wav'
  };
  // The cropped, noise-reduced clip is just under five seconds. Starting it
  // slightly early lets the full recorded track play before each interval ends.
  const ALPINE_COUNTDOWN_TRACK_SECONDS = 4.85;
  const ALPINE_COUNTDOWN_ARM_SECONDS = 5.2;
  const POST_COUNTDOWN_SPEECH_DELAY_MS = 1400;

  const DEFAULT_WORKOUTS = [
    'Front plank',
    'Abs brace',
    'Hand slides',
    'Alternating crunch',
    'Hand to heel',
    'Hip raises',
    'Reverse crunch',
    'Boat hold',
    'Chair sit ups',
    'Spider'
  ];

  const DEFAULT_CONFIG = {
    reps: 10,
    mainSeconds: 75,
    pushupSeconds: 50,
    prepSeconds: 0,
    alert: 'alpine-ski',
    voice: true,
    sound: true,
    countdown: true
  };

  const els = {
    phasePill: document.getElementById('phasePill'),
    roundText: document.getElementById('roundText'),
    timerDisplay: document.getElementById('timerDisplay'),
    activeName: document.getElementById('activeName'),
    nextName: document.getElementById('nextName'),
    progressBar: document.getElementById('progressBar'),
    roundDots: document.getElementById('roundDots'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    skipBtn: document.getElementById('skipBtn'),
    resetBtn: document.getElementById('resetBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    voiceToggle: document.getElementById('voiceToggle'),
    soundToggle: document.getElementById('soundToggle'),
    countdownToggle: document.getElementById('countdownToggle'),
    testSoundBtn: document.getElementById('testSoundBtn'),
    soundStatus: document.getElementById('soundStatus'),
    alertAudio: document.getElementById('alertAudio'),
    repsInput: document.getElementById('repsInput'),
    mainTimeInput: document.getElementById('mainTimeInput'),
    pushupTimeInput: document.getElementById('pushupTimeInput'),
    prepTimeInput: document.getElementById('prepTimeInput'),
    workoutsInput: document.getElementById('workoutsInput'),
    applySettingsBtn: document.getElementById('applySettingsBtn'),
    saveDeviceBtn: document.getElementById('saveDeviceBtn'),
    clearDeviceBtn: document.getElementById('clearDeviceBtn'),
    timerFileInput: document.getElementById('timerFileInput'),
    workoutsFileInput: document.getElementById('workoutsFileInput'),
    downloadTimerBtn: document.getElementById('downloadTimerBtn'),
    downloadWorkoutsBtn: document.getElementById('downloadWorkoutsBtn'),
    configSource: document.getElementById('configSource'),
    scheduleList: document.getElementById('scheduleList'),
    totalTime: document.getElementById('totalTime')
  };

  let config = { ...DEFAULT_CONFIG };
  let workouts = [...DEFAULT_WORKOUTS];
  let intervals = [];
  let state = 'ready';
  let activeIndex = 0;
  let currentInterval = null;
  let endAt = 0;
  let durationMs = 0;
  let pausedRemainingMs = 0;
  let rafId = 0;
  let runToken = 0;
  let lastCountdownSecond = null;
  let countdownTrackScheduledForEndAt = 0;
  let audioCtx = null;
  let alertSoundBuffer = null;
  let audioAssetsPromise = null;
  let voiceBuffers = new Map();
  let voiceAssetsPromise = null;
  let activeAudioSources = new Set();
  let alertAudioElement = null;
  let activeMediaElements = new Set();
  let audioUnlocked = false;
  let preferredAudioSource = AUDIO_SOURCES[0].src;
  let soundStatusTimer = 0;
  let wakeLock = null;
  let configSourceLabel = 'Built-in defaults';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await loadDefaults();
    wireEvents();
    applyConfigToUi();
    rebuildWorkout();
    resetWorkout(false);
    registerServiceWorker();
  }

  async function loadDefaults() {
    let loadedConfig = { ...DEFAULT_CONFIG };
    let loadedWorkouts = [...DEFAULT_WORKOUTS];
    let loadedFromFiles = false;

    try {
      const timerText = await fetchTextFile('config/timer.txt');
      loadedConfig = { ...loadedConfig, ...parseTimerConfig(timerText) };
      loadedFromFiles = true;
    } catch (error) {
      console.info('Using built-in timer defaults:', error.message);
    }

    try {
      const workoutText = await fetchTextFile('config/workouts.txt');
      const parsedWorkouts = parseWorkoutList(workoutText);
      if (parsedWorkouts.length) {
        loadedWorkouts = parsedWorkouts;
        loadedFromFiles = true;
      }
    } catch (error) {
      console.info('Using built-in workout names:', error.message);
    }

    configSourceLabel = loadedFromFiles ? 'Config files' : 'Built-in defaults';

    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (stored && stored.config && Array.isArray(stored.workouts)) {
        loadedConfig = { ...loadedConfig, ...normalizeConfig(stored.config) };
        loadedWorkouts = parseWorkoutList(stored.workouts.join('\n'));
        configSourceLabel = 'Device save';
      }
    } catch (error) {
      console.warn('Could not load device save:', error);
    }

    config = normalizeConfig(loadedConfig);
    workouts = loadedWorkouts.length ? loadedWorkouts : [...DEFAULT_WORKOUTS];
  }

  function fetchTextFile(path) {
    const sep = path.includes('?') ? '&' : '?';
    return fetch(`${path}${sep}ts=${Date.now()}`, { cache: 'no-store' }).then((response) => {
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}`);
      }
      return response.text();
    });
  }

  function wireEvents() {
    els.startBtn.addEventListener('click', startWorkout);
    els.pauseBtn.addEventListener('click', togglePause);
    els.skipBtn.addEventListener('click', skipInterval);
    els.resetBtn.addEventListener('click', () => resetWorkout(true));
    els.fullscreenBtn.addEventListener('click', toggleFullScreen);

    els.voiceToggle.addEventListener('change', () => {
      config.voice = els.voiceToggle.checked;
    });
    els.soundToggle.addEventListener('change', () => {
      config.sound = els.soundToggle.checked;
    });
    els.countdownToggle.addEventListener('change', () => {
      config.countdown = els.countdownToggle.checked;
    });

    els.testSoundBtn.addEventListener('click', testSound);

    els.applySettingsBtn.addEventListener('click', () => {
      if (readUiIntoConfig()) {
        configSourceLabel = 'Current screen';
        rebuildWorkout();
        resetWorkout(false);
      }
    });

    els.saveDeviceBtn.addEventListener('click', () => {
      if (!readUiIntoConfig()) return;
      localStorage.setItem(STORE_KEY, JSON.stringify({ config, workouts }));
      configSourceLabel = 'Device save';
      updateConfigSource();
      flashSource('Saved on this device');
    });

    els.clearDeviceBtn.addEventListener('click', async () => {
      localStorage.removeItem(STORE_KEY);
      await loadDefaults();
      applyConfigToUi();
      rebuildWorkout();
      resetWorkout(false);
      flashSource(configSourceLabel);
    });

    els.timerFileInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const text = await file.text();
      config = normalizeConfig({ ...config, ...parseTimerConfig(text) });
      configSourceLabel = `Loaded ${file.name}`;
      applyConfigToUi();
      rebuildWorkout();
      resetWorkout(false);
      event.target.value = '';
    });

    els.workoutsFileInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const text = await file.text();
      const parsed = parseWorkoutList(text);
      if (!parsed.length) {
        window.alert('That workout file did not contain any workout names.');
        return;
      }
      workouts = parsed;
      configSourceLabel = `Loaded ${file.name}`;
      applyConfigToUi();
      rebuildWorkout();
      resetWorkout(false);
      event.target.value = '';
    });

    els.downloadTimerBtn.addEventListener('click', () => {
      if (!readUiIntoConfig()) return;
      downloadText('timer.txt', serializeTimerConfig(config));
    });

    els.downloadWorkoutsBtn.addEventListener('click', () => {
      const parsed = parseWorkoutList(els.workoutsInput.value);
      if (!parsed.length) {
        window.alert('Add at least one workout name before downloading workouts.txt.');
        return;
      }
      downloadText('workouts.txt', `${parsed.join('\n')}\n`);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (state === 'running' || state === 'cue' || state === 'prep')) {
        requestWakeLock();
      }
    });

    document.addEventListener('fullscreenchange', syncFullScreenButton);
    document.addEventListener('webkitfullscreenchange', syncFullScreenButton);
  }

  function parseTimerConfig(text) {
    const parsed = {};
    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;
      const divider = line.includes('=') ? '=' : line.includes(':') ? ':' : null;
      if (!divider) return;
      const firstDivider = line.indexOf(divider);
      const key = normalizeKey(line.slice(0, firstDivider));
      const value = line.slice(firstDivider + 1).trim();
      if (!key) return;

      if (['reps', 'rounds', 'repeat', 'repeats', 'cycles'].includes(key)) {
        parsed.reps = toInt(value, DEFAULT_CONFIG.reps);
      } else if (['main', 'mainset', 'mainseconds', 'core', 'coreset', 'work', 'worktime', 'timeon', 'time_on'].includes(key)) {
        parsed.mainSeconds = parseDuration(value);
      } else if (['pushup', 'pushups', 'pushupset', 'pushupsset', 'pushtime', 'pushupseconds', 'pushupsseconds'].includes(key)) {
        parsed.pushupSeconds = parseDuration(value);
      } else if (['prep', 'preptime', 'prepare', 'warmup'].includes(key)) {
        parsed.prepSeconds = parseDuration(value);
      } else if (['alert', 'soundname', 'tone'].includes(key)) {
        parsed.alert = value || DEFAULT_CONFIG.alert;
      } else if (['voice', 'announce', 'announcements'].includes(key)) {
        parsed.voice = parseBoolean(value, DEFAULT_CONFIG.voice);
      } else if (['sound', 'sounds', 'beep', 'beeps'].includes(key)) {
        parsed.sound = parseBoolean(value, DEFAULT_CONFIG.sound);
      } else if (['countdown', 'countdownbeeps', 'lastseconds'].includes(key)) {
        parsed.countdown = parseBoolean(value, DEFAULT_CONFIG.countdown);
      }
    });
    return parsed;
  }

  function normalizeKey(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .replace(/_/g, '');
  }

  function parseWorkoutList(text) {
    return String(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }

  function parseDuration(value) {
    const raw = String(value).trim().toLowerCase();
    if (!raw) throw new Error('Missing duration');

    const compact = raw.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s?)?$/);
    if (compact && (compact[1] || compact[2] || compact[3])) {
      const h = toInt(compact[1] || 0, 0);
      const m = toInt(compact[2] || 0, 0);
      const s = toInt(compact[3] || 0, 0);
      return h * 3600 + m * 60 + s;
    }

    if (raw.includes(':')) {
      const parts = raw.split(':').map((part) => part.trim());
      if (parts.some((part) => !/^\d+$/.test(part))) {
        throw new Error(`Invalid duration: ${value}`);
      }
      if (parts.length === 2) {
        return toInt(parts[0], 0) * 60 + toInt(parts[1], 0);
      }
      if (parts.length === 3) {
        return toInt(parts[0], 0) * 3600 + toInt(parts[1], 0) * 60 + toInt(parts[2], 0);
      }
      throw new Error(`Invalid duration: ${value}`);
    }

    if (/^\d+$/.test(raw)) {
      return toInt(raw, 0);
    }

    throw new Error(`Invalid duration: ${value}`);
  }

  function normalizeConfig(input) {
    const next = { ...DEFAULT_CONFIG, ...input };
    next.reps = clamp(toInt(next.reps, DEFAULT_CONFIG.reps), 1, 99);
    next.mainSeconds = clamp(toInt(next.mainSeconds, DEFAULT_CONFIG.mainSeconds), 1, 24 * 60 * 60);
    next.pushupSeconds = clamp(toInt(next.pushupSeconds, DEFAULT_CONFIG.pushupSeconds), 1, 24 * 60 * 60);
    next.prepSeconds = clamp(toInt(next.prepSeconds, DEFAULT_CONFIG.prepSeconds), 0, 60 * 60);
    next.alert = String(next.alert || DEFAULT_CONFIG.alert);
    next.voice = Boolean(next.voice);
    next.sound = Boolean(next.sound);
    next.countdown = Boolean(next.countdown);
    return next;
  }

  function readUiIntoConfig() {
    try {
      const nextWorkouts = parseWorkoutList(els.workoutsInput.value);
      if (!nextWorkouts.length) {
        throw new Error('Add at least one workout name.');
      }
      config = normalizeConfig({
        ...config,
        reps: toInt(els.repsInput.value, DEFAULT_CONFIG.reps),
        mainSeconds: parseDuration(els.mainTimeInput.value),
        pushupSeconds: parseDuration(els.pushupTimeInput.value),
        prepSeconds: parseDuration(els.prepTimeInput.value || '0'),
        voice: els.voiceToggle.checked,
        sound: els.soundToggle.checked,
        countdown: els.countdownToggle.checked
      });
      workouts = nextWorkouts;
      applyConfigToUi();
      return true;
    } catch (error) {
      window.alert(error.message || 'Could not read the settings.');
      return false;
    }
  }

  function applyConfigToUi() {
    els.repsInput.value = config.reps;
    els.mainTimeInput.value = formatDurationForInput(config.mainSeconds);
    els.pushupTimeInput.value = formatDurationForInput(config.pushupSeconds);
    els.prepTimeInput.value = formatDurationForInput(config.prepSeconds);
    els.voiceToggle.checked = config.voice;
    els.soundToggle.checked = config.sound;
    els.countdownToggle.checked = config.countdown;
    els.workoutsInput.value = workouts.join('\n');
    updateConfigSource();
  }

  function rebuildWorkout() {
    intervals = [];
    for (let i = 0; i < config.reps; i += 1) {
      const workoutName = workouts[i % workouts.length];
      intervals.push({
        label: workoutName,
        type: 'core',
        round: i + 1,
        duration: config.mainSeconds
      });
      intervals.push({
        label: 'Push ups',
        type: 'pushups',
        round: i + 1,
        duration: config.pushupSeconds
      });
    }
    renderSchedule();
    renderRoundDots();
  }

  async function startWorkout() {
    if (state !== 'ready' && state !== 'done') return;
    if (!readUiIntoConfig()) return;
    rebuildWorkout();
    runToken += 1;
    activeIndex = 0;
    pausedRemainingMs = 0;
    lastCountdownSecond = null;
    countdownTrackScheduledForEndAt = 0;
    stopActiveAudio();
    await unlockAudio({ quiet: true });
    requestWakeLock();

    if (config.prepSeconds > 0) {
      startPrep(runToken);
    } else {
      cueInterval(0, runToken);
    }
  }

  function startPrep(token) {
    currentInterval = { label: 'Get ready', type: 'prep', round: 0, duration: config.prepSeconds };
    setState('prep');
    playAlpineAlert('start');
    speak('Get ready');
    startTimedInterval(currentInterval, () => cueInterval(0, token));
  }

  function cueInterval(index, token) {
    if (token !== runToken) return;
    const countdownTrackJustPlayed = Boolean(countdownTrackScheduledForEndAt);
    countdownTrackScheduledForEndAt = 0;

    if (index >= intervals.length) {
      completeWorkout(countdownTrackJustPlayed);
      return;
    }

    activeIndex = index;
    currentInterval = intervals[index];
    durationMs = currentInterval.duration * 1000;
    lastCountdownSecond = null;
    setState('cue');
    updateTimerDisplay(durationMs, 0);

    if (!countdownTrackJustPlayed && !config.countdown) {
      playAlpineAlert('transition');
    }

    delay(countdownTrackJustPlayed ? POST_COUNTDOWN_SPEECH_DELAY_MS : 0).then(() => speak(currentInterval.label)).then(() => {
      if (token !== runToken || state !== 'cue') return;
      startTimedInterval(currentInterval, () => cueInterval(index + 1, token));
    });
  }

  function startTimedInterval(interval, onDone) {
    currentInterval = interval;
    durationMs = interval.duration * 1000;
    endAt = performance.now() + durationMs;
    lastCountdownSecond = null;
    countdownTrackScheduledForEndAt = 0;
    setState(interval.type === 'prep' ? 'prep' : 'running');
    updateTimerDisplay(durationMs, 0);
    cancelAnimationFrame(rafId);

    const tick = () => {
      if (state !== 'running' && state !== 'prep') return;
      const remainingMs = Math.max(0, endAt - performance.now());
      const progress = durationMs > 0 ? 1 - remainingMs / durationMs : 1;
      updateTimerDisplay(remainingMs, progress);
      maybeCountdownBeep(remainingMs);

      if (remainingMs <= 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
        if (typeof onDone === 'function') onDone();
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
  }

  function togglePause() {
    if (state === 'running' || state === 'prep') {
      pausedRemainingMs = Math.max(0, endAt - performance.now());
      cancelAnimationFrame(rafId);
      rafId = 0;
      stopActiveAudio();
      countdownTrackScheduledForEndAt = 0;
      lastCountdownSecond = null;
      setState('paused');
      releaseWakeLock();
      return;
    }

    if (state === 'paused' && currentInterval) {
      endAt = performance.now() + pausedRemainingMs;
      countdownTrackScheduledForEndAt = 0;
      lastCountdownSecond = null;
      setState(currentInterval.type === 'prep' ? 'prep' : 'running');
      requestWakeLock();
      startTimedIntervalFromPause();
    }
  }

  function startTimedIntervalFromPause() {
    cancelAnimationFrame(rafId);

    const tick = () => {
      if (state !== 'running' && state !== 'prep') return;
      const remainingMs = Math.max(0, endAt - performance.now());
      const progress = durationMs > 0 ? 1 - remainingMs / durationMs : 1;
      updateTimerDisplay(remainingMs, progress);
      maybeCountdownBeep(remainingMs);

      if (remainingMs <= 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
        if (currentInterval.type === 'prep') {
          cueInterval(0, runToken);
        } else {
          cueInterval(activeIndex + 1, runToken);
        }
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
  }

  function skipInterval() {
    if (!['running', 'paused', 'cue', 'prep'].includes(state)) return;
    runToken += 1;
    const token = runToken;
    cancelAnimationFrame(rafId);
    window.speechSynthesis && window.speechSynthesis.cancel();
    stopActiveAudio();
    countdownTrackScheduledForEndAt = 0;
    lastCountdownSecond = null;

    if (currentInterval && currentInterval.type === 'prep') {
      cueInterval(0, token);
      return;
    }

    const nextIndex = state === 'cue' ? activeIndex + 1 : activeIndex + 1;
    cueInterval(nextIndex, token);
  }

  function resetWorkout(announce) {
    runToken += 1;
    cancelAnimationFrame(rafId);
    rafId = 0;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopActiveAudio();
    releaseWakeLock();
    state = 'ready';
    activeIndex = 0;
    currentInterval = intervals[0] || null;
    pausedRemainingMs = 0;
    durationMs = currentInterval ? currentInterval.duration * 1000 : config.mainSeconds * 1000;
    lastCountdownSecond = null;
    countdownTrackScheduledForEndAt = 0;
    setState('ready');
    updateTimerDisplay(durationMs, 0);
    if (announce) playAlpineAlert('reset');
  }

  function completeWorkout(countdownTrackJustPlayed = Boolean(countdownTrackScheduledForEndAt)) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    state = 'done';
    currentInterval = null;
    releaseWakeLock();
    setState('done');
    els.timerDisplay.textContent = '00:00';
    els.activeName.textContent = 'Workout complete';
    els.nextName.textContent = 'Nice work.';
    els.progressBar.style.width = '100%';
    renderRoundDots(true);
    countdownTrackScheduledForEndAt = 0;
    if (!countdownTrackJustPlayed) {
      playAlpineAlert('complete');
    }
    delay(countdownTrackJustPlayed ? POST_COUNTDOWN_SPEECH_DELAY_MS : 0).then(() => speak('Workout complete'));
  }

  function setState(nextState) {
    state = nextState;
    document.body.classList.toggle('running', state === 'running' && currentInterval && currentInterval.type === 'core');
    document.body.classList.toggle('pushups', state === 'running' && currentInterval && currentInterval.type === 'pushups');

    const isInteractive = ['running', 'paused', 'cue', 'prep'].includes(state);
    els.startBtn.disabled = isInteractive;
    els.pauseBtn.disabled = !(state === 'running' || state === 'prep' || state === 'paused');
    els.skipBtn.disabled = !isInteractive;
    els.pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause';

    if (state === 'ready') {
      els.phasePill.textContent = 'Ready';
      els.phasePill.className = 'phase-pill ready';
      els.roundText.textContent = `Round 1 of ${config.reps}`;
      els.activeName.textContent = intervals[0] ? intervals[0].label : 'Front plank';
      els.nextName.textContent = intervals[1] ? `Next: ${intervals[1].label}` : 'Next: Push ups';
    } else if (state === 'cue') {
      els.phasePill.textContent = 'Get ready';
      els.phasePill.className = 'phase-pill cue';
      els.roundText.textContent = `Round ${currentInterval.round} of ${config.reps}`;
      els.activeName.textContent = currentInterval.label;
      els.nextName.textContent = currentInterval.type === 'pushups' ? 'Push up set' : 'Core set';
    } else if (state === 'prep') {
      els.phasePill.textContent = 'Prep';
      els.phasePill.className = 'phase-pill cue';
      els.roundText.textContent = `Starting ${config.reps} rounds`;
      els.activeName.textContent = 'Get ready';
      els.nextName.textContent = intervals[0] ? `Next: ${intervals[0].label}` : '';
    } else if (state === 'running') {
      els.phasePill.textContent = currentInterval.type === 'pushups' ? 'Push ups' : 'Core';
      els.phasePill.className = `phase-pill ${currentInterval.type}`;
      els.roundText.textContent = `Round ${currentInterval.round} of ${config.reps}`;
      els.activeName.textContent = currentInterval.label;
      els.nextName.textContent = getNextText();
    } else if (state === 'paused') {
      els.phasePill.textContent = 'Paused';
      els.phasePill.className = 'phase-pill paused';
    } else if (state === 'done') {
      els.phasePill.textContent = 'Done';
      els.phasePill.className = 'phase-pill done';
      els.roundText.textContent = `${config.reps} of ${config.reps} rounds`;
    }

    renderRoundDots(state === 'done');
  }

  function updateTimerDisplay(remainingMs, progress) {
    els.timerDisplay.textContent = formatClockMs(remainingMs);
    els.progressBar.style.width = `${clamp(Math.round(progress * 1000) / 10, 0, 100)}%`;
    if (currentInterval && (state === 'running' || state === 'prep')) {
      els.activeName.textContent = currentInterval.label;
      els.nextName.textContent = getNextText();
    }
  }

  function getNextText() {
    if (!currentInterval) return '';
    if (currentInterval.type === 'prep') {
      return intervals[0] ? `Next: ${intervals[0].label}` : '';
    }
    const next = intervals[activeIndex + 1];
    return next ? `Next: ${next.label}` : 'Final interval';
  }

  function renderRoundDots(forceDone) {
    els.roundDots.innerHTML = '';
    const currentRound = currentInterval && currentInterval.round ? currentInterval.round : 1;
    const completedRounds = forceDone ? config.reps : Math.max(0, Math.floor(activeIndex / 2));

    for (let i = 1; i <= config.reps; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'round-dot';
      dot.setAttribute('aria-label', `Round ${i}`);
      if (i <= completedRounds) dot.classList.add('done');
      if (!forceDone && ['running', 'paused', 'cue'].includes(state) && i === currentRound) dot.classList.add('current');
      els.roundDots.appendChild(dot);
    }
  }

  function renderSchedule() {
    els.scheduleList.innerHTML = '';
    for (let i = 0; i < config.reps; i += 1) {
      const li = document.createElement('li');
      const div = document.createElement('div');
      const title = document.createElement('span');
      const meta = document.createElement('span');
      title.className = 'schedule-item-title';
      meta.className = 'schedule-item-meta';
      title.textContent = workouts[i % workouts.length];
      meta.textContent = `${formatDurationForInput(config.mainSeconds)} core, then ${formatDurationForInput(config.pushupSeconds)} push ups`;
      div.append(title, meta);
      li.appendChild(div);
      els.scheduleList.appendChild(li);
    }

    const totalSeconds = config.prepSeconds + config.reps * (config.mainSeconds + config.pushupSeconds);
    els.totalTime.textContent = `${formatDurationForInput(totalSeconds)} total`;
  }

  function maybeCountdownBeep(remainingMs) {
    if (!config.countdown || !config.sound || state !== 'running') return;
    if (countdownTrackScheduledForEndAt) return;

    const leadMs = getAlpineTrackLeadMs();
    if (durationMs >= 1000 && remainingMs <= leadMs) {
      if (scheduleAlpineCountdownTrack(remainingMs)) {
        lastCountdownSecond = 'track';
      }
    }
  }

  function getAlpineTrackLeadMs() {
    if (alertSoundBuffer && Number.isFinite(alertSoundBuffer.duration) && alertSoundBuffer.duration > 0) {
      return Math.ceil((alertSoundBuffer.duration + 0.25) * 1000);
    }
    return Math.ceil(ALPINE_COUNTDOWN_ARM_SECONDS * 1000);
  }

  async function testSound() {
    if (!config.sound) {
      config.sound = true;
      els.soundToggle.checked = true;
    }
    if (!config.voice) {
      config.voice = true;
      els.voiceToggle.checked = true;
    }

    updateSoundStatus('Enabling audio and voice...', 'warning');
    await unlockAudio({ quiet: true, loadVoice: true });

    await speak('Sound ready');
    await delay(200);

    const played = playAlertWithWebAudio('test') || await playFullAlpineTrack('test', { waitForStart: true });
    if (played) {
      audioUnlocked = true;
      updateSoundStatus('Voice and Alpine sound test started.', 'ready', 3500);
    } else {
      updateSoundStatus('iPad blocked sound. Check volume/output, then tap again.', 'error');
    }
  }

  async function unlockAudio(options = {}) {
    const quiet = options.quiet !== false;
    primeAudioElement();

    try {
      await warmWebAudio();
      const loading = [loadAudioAssets()];
      if (options.loadVoice !== false) loading.push(loadVoiceAssets());
      const results = await Promise.allSettled(loading);
      const rejected = results.filter((result) => result.status === 'rejected');
      if (rejected.length) {
        console.info('Some audio assets could not be decoded:', rejected.map((result) => result.reason && (result.reason.message || result.reason)).join('; '));
      }
    } catch (error) {
      console.info('Web Audio could not be warmed up:', error.message || error);
    }

    if (!quiet) {
      const played = await playFullAlpineTrack('test', { waitForStart: true });
      if (!played && audioCtx && alertSoundBuffer) {
        const fallbackPlayed = playAudioBuffer(alertSoundBuffer, 1);
        if (fallbackPlayed) {
          audioUnlocked = true;
          updateSoundStatus('Sound test started with Web Audio.', 'ready');
          return true;
        }
      }
      return played;
    }

    if (audioCtx && audioCtx.state === 'running') {
      audioUnlocked = true;
      updateSoundStatus('Sound armed. Tap Enable / Test Sound if iPad stays silent.', 'ready', 3500);
      return true;
    }

    updateSoundStatus('Tap Enable / Test Sound once on iPad if alerts stay silent.', 'warning');
    return false;
  }

  async function warmWebAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    // iOS Safari often needs a tiny source started from a user tap before later audio will render.
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    try {
      source.start(0);
    } catch (error) {
      // A source can only be started once; ignore warmup failures.
    }
    return audioCtx.state === 'running';
  }

  function loadAudioAssets() {
    if (!audioCtx) return Promise.resolve(false);
    if (alertSoundBuffer) return Promise.resolve(true);
    if (audioAssetsPromise) return audioAssetsPromise;

    audioAssetsPromise = (async () => {
      const errors = [];
      for (const source of AUDIO_SOURCES) {
        try {
          const buffer = await loadAudioBuffer(source.src);
          alertSoundBuffer = buffer;
          preferredAudioSource = source.src;
          setMediaAudioSource(source.src);
          return true;
        } catch (error) {
          errors.push(`${source.src}: ${error.message || error}`);
        }
      }
      throw new Error(errors.join('; '));
    })().catch((error) => {
      audioAssetsPromise = null;
      throw error;
    });

    return audioAssetsPromise;
  }

  async function loadAudioBuffer(src) {
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${src} returned ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return audioCtx.decodeAudioData(arrayBuffer);
  }

  function loadVoiceAssets() {
    if (!audioCtx) return Promise.resolve(false);
    if (voiceBuffers.size > 0) return Promise.resolve(true);
    if (voiceAssetsPromise) return voiceAssetsPromise;

    voiceAssetsPromise = Promise.allSettled(Object.entries(VOICE_CUES).map(async ([key, src]) => {
      const buffer = await loadAudioBuffer(src);
      voiceBuffers.set(key, buffer);
    })).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        console.info('Some recorded voice cues could not be loaded:', failed.map((result) => result.reason && (result.reason.message || result.reason)).join('; '));
      }
      return voiceBuffers.size > 0;
    }).catch((error) => {
      voiceAssetsPromise = null;
      throw error;
    });

    return voiceAssetsPromise;
  }

  function playAlpineAlert(kind) {
    if (!config.sound) return;
    const played = playAlertWithWebAudio(kind);
    if (!played) playFullAlpineTrack(kind);
    vibrate(kind === 'complete' ? [80, 60, 120] : [45]);
  }

  function playAlertWithWebAudio(kind, when = null) {
    if (!audioCtx || !alertSoundBuffer) return false;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const volume = kind === 'countdown' || kind === 'complete' || kind === 'test' ? 1 : 0.9;
    return playAudioBuffer(alertSoundBuffer, volume, when);
  }

  function scheduleAlpineCountdownTrack(remainingMs) {
    if (!config.sound) return false;

    let played = false;
    const secondsUntilEnd = Math.max(0, remainingMs / 1000);

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    if (audioCtx && audioCtx.state === 'running' && alertSoundBuffer) {
      const trackSeconds = alertSoundBuffer.duration || ALPINE_COUNTDOWN_TRACK_SECONDS;
      const scheduledStartTime = audioCtx.currentTime + Math.max(0, secondsUntilEnd - trackSeconds);
      played = playAlertWithWebAudio('countdown', scheduledStartTime);
    }

    if (!played) {
      played = playFullAlpineTrack('countdown');
    }

    if (!played) {
      updateSoundStatus('Sound was blocked. Tap Enable / Test Sound, then Start again.', 'error');
      return false;
    }

    countdownTrackScheduledForEndAt = endAt || (performance.now() + remainingMs);
    updateSoundStatus('Full Alpine countdown playing.', 'ready', 2500);
    vibrate([25, 975, 25, 975, 25, 975, 90]);
    return true;
  }

  function playCountdownBeep(seconds) {
    if (!config.sound) return;
    playFullAlpineTrack('countdown');
    vibrate(seconds === 1 ? [90] : [25]);
  }

  function playAudioBuffer(buffer, volume, when = null) {
    if (!audioCtx || !buffer || audioCtx.state !== 'running') return false;
    try {
      const source = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      const startTime = Math.max(audioCtx.currentTime + 0.003, when ?? audioCtx.currentTime);
      source.buffer = buffer;
      gain.gain.setValueAtTime(volume, startTime);
      source.connect(gain).connect(audioCtx.destination);
      activeAudioSources.add(source);
      source.onended = () => activeAudioSources.delete(source);
      source.start(startTime);
      audioUnlocked = true;
      return true;
    } catch (error) {
      console.info('Web Audio playback failed:', error.message || error);
      return false;
    }
  }

  function stopActiveAudio() {
    activeAudioSources.forEach((source) => {
      try {
        source.stop(0);
      } catch (error) {
        // Source already stopped.
      }
    });
    activeAudioSources.clear();

    activeMediaElements.forEach((media) => {
      try {
        media.pause();
        media.currentTime = 0;
      } catch (error) {
        // Media element may not be seekable yet.
      }
    });
    activeMediaElements.clear();
  }

  function primeAudioElement() {
    if (!alertAudioElement) {
      alertAudioElement = els.alertAudio || new Audio();
      alertAudioElement.preload = 'auto';
      alertAudioElement.setAttribute('playsinline', '');
      alertAudioElement.setAttribute('webkit-playsinline', '');
      if (!els.alertAudio) {
        setMediaAudioSource(preferredAudioSource);
      }
    }

    if (!alertAudioElement.currentSrc && !alertAudioElement.src) {
      setMediaAudioSource(preferredAudioSource);
    }

    try {
      alertAudioElement.load();
    } catch (error) {
      // Some browsers defer loading until play().
    }
    return alertAudioElement;
  }

  function setMediaAudioSource(src) {
    preferredAudioSource = src || preferredAudioSource || ALERT_SOUND_SRC;
    const audio = alertAudioElement || els.alertAudio;
    if (!audio) return;

    const absolute = new URL(preferredAudioSource, window.location.href).href;
    if (audio.src !== absolute && audio.currentSrc !== absolute) {
      audio.src = preferredAudioSource;
      try {
        audio.load();
      } catch (error) {
        // Loading may be delayed until play().
      }
    }
  }

  async function playFullAlpineTrack(kind, options = {}) {
    const audio = primeAudioElement();
    if (!audio) return false;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      try {
        audio.volume = 1;
      } catch (error) {
        // iOS may ignore programmatic volume changes.
      }
      activeMediaElements.add(audio);
      audio.onended = () => {
        activeMediaElements.delete(audio);
        if (kind === 'test') updateSoundStatus('Sound test finished.', 'ready', 2500);
      };
      const result = audio.play();
      if (result && typeof result.then === 'function') {
        if (options.waitForStart) {
          await result;
          audioUnlocked = true;
          updateSoundStatus(kind === 'test' ? 'Sound test playing.' : 'Full Alpine sound playing.', 'ready', 3000);
        } else {
          result.then(() => {
            audioUnlocked = true;
            updateSoundStatus(kind === 'countdown' ? 'Full Alpine countdown playing.' : 'Full Alpine sound playing.', 'ready', 2500);
          }).catch((error) => {
            activeMediaElements.delete(audio);
            updateSoundStatus('iPad blocked the sound. Tap Enable / Test Sound once.', 'error');
            console.info('Audio file could not play:', error.message || error);
          });
        }
      } else {
        audioUnlocked = true;
        updateSoundStatus(kind === 'test' ? 'Sound test playing.' : 'Full Alpine sound playing.', 'ready', 2500);
      }
      return true;
    } catch (error) {
      activeMediaElements.delete(audio);
      updateSoundStatus('Sound could not start. Check iPad volume/output, then tap Test Sound.', 'error');
      console.info('Audio file could not start:', error.message || error);
      return false;
    }
  }

  function updateSoundStatus(message, level = '', clearAfterMs = 0) {
    if (!els.soundStatus) return;
    window.clearTimeout(soundStatusTimer);
    els.soundStatus.textContent = `Sound: ${message}`;
    els.soundStatus.className = `sound-status ${level}`.trim();
    if (clearAfterMs > 0) {
      soundStatusTimer = window.setTimeout(() => {
        if (!els.soundStatus) return;
        els.soundStatus.textContent = audioUnlocked
          ? 'Sound: ready'
          : 'Sound: tap Enable / Test Sound on iPad';
        els.soundStatus.className = audioUnlocked ? 'sound-status ready' : 'sound-status warning';
      }, clearAfterMs);
    }
  }

  async function speak(text) {
    if (!config.voice) {
      return delay(650);
    }

    const recorded = await playRecordedVoiceCue(text);
    if (recorded) {
      return;
    }

    return speakWithBrowserVoice(text);
  }

  async function playRecordedVoiceCue(text) {
    if (!audioCtx) return null;

    try {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (!voiceBuffers.size) {
        await loadVoiceAssets();
      }
    } catch (error) {
      console.info('Recorded voice unavailable:', error.message || error);
      return null;
    }

    const key = normalizeVoiceKey(text);
    const buffer = voiceBuffers.get(key);
    if (!buffer) return null;

    return new Promise((resolve) => {
      try {
        const source = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        const startTime = Math.max(audioCtx.currentTime + 0.003, audioCtx.currentTime);
        source.buffer = buffer;
        gain.gain.setValueAtTime(1, startTime);
        source.connect(gain).connect(audioCtx.destination);
        activeAudioSources.add(source);
        source.onended = () => {
          activeAudioSources.delete(source);
          resolve(true);
        };
        source.start(startTime);
        audioUnlocked = true;
        const fallbackMs = Math.max(600, Math.ceil((buffer.duration + 0.15) * 1000));
        window.setTimeout(() => resolve(true), fallbackMs);
      } catch (error) {
        console.info('Recorded voice playback failed:', error.message || error);
        resolve(null);
      }
    });
  }

  function normalizeVoiceKey(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/[^a-z0-9 ]+/g, '')
      .replace(/\s+/g, ' ');
  }

  function speakWithBrowserVoice(text) {
    if (!('speechSynthesis' in window)) {
      return delay(650);
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        window.setTimeout(finish, Math.max(1300, Math.min(2600, text.length * 80)));
      } catch (error) {
        console.warn('Speech failed:', error);
        finish();
      }
    });
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (error) {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function syncFullScreenButton() {
    const isFull = document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('fullscreen-ui');
    els.fullscreenBtn.textContent = isFull ? 'Exit Full Screen' : 'Full Screen';
  }

  function toggleFullScreen() {
    const docEl = document.documentElement;
    const isFull = document.fullscreenElement || document.webkitFullscreenElement;

    if (isFull) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      document.body.classList.remove('fullscreen-ui');
      els.fullscreenBtn.textContent = 'Full Screen';
      return;
    }

    const request = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    if (request) {
      request.call(docEl).catch(() => {
        document.body.classList.toggle('fullscreen-ui');
      });
    } else {
      document.body.classList.toggle('fullscreen-ui');
    }
    els.fullscreenBtn.textContent = 'Exit Full Screen';
  }

  function updateConfigSource() {
    els.configSource.textContent = configSourceLabel;
  }

  function flashSource(text) {
    const old = els.configSource.textContent;
    els.configSource.textContent = text;
    window.setTimeout(() => {
      els.configSource.textContent = old === text ? configSourceLabel : configSourceLabel;
    }, 1200);
  }

  function serializeTimerConfig(input) {
    return [
      '# Core + Push Up Timer defaults',
      '# Edit this file, then reload the web app.',
      `reps=${input.reps}`,
      `main_set=${formatDurationForInput(input.mainSeconds)}`,
      `pushup_set=${formatDurationForInput(input.pushupSeconds)}`,
      `prep=${formatDurationForInput(input.prepSeconds)}`,
      `alert=${input.alert || 'alpine-ski'}`,
      `voice=${input.voice ? 'true' : 'false'}`,
      `sound=${input.sound ? 'true' : 'false'}`,
      `countdown=${input.countdown ? 'true' : 'false'}`,
      ''
    ].join('\n');
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.info('Service worker not registered:', error.message);
    });
  }

  function formatClockMs(ms) {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    return formatDurationForInput(totalSeconds);
  }

  function formatDurationForInput(totalSeconds) {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function parseBoolean(value, fallback) {
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0', 'off'].includes(normalized)) return false;
    return fallback;
  }

  function toInt(value, fallback) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function vibrate(pattern) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
})();
