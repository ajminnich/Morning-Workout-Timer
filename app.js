(() => {
  'use strict';

  const STORE_KEY = 'core-pushup-timer.device-defaults.v1';
  const ALERT_SOUND_SRC = 'assets/alpine-ski-clock-clean.m4a';
  const BEEP_SOUND_SRC = 'assets/alpine-ski-beep-clean.m4a';
  // The cleaned Alpine Ski clock clip has four beeps: near 0, 1, 2, and 3 seconds.
  // Arm it early, then start it so the fourth beep lands on the interval change.
  const ALPINE_COUNTDOWN_FINAL_BEEP_AT_SECONDS = 3.0;
  const ALPINE_COUNTDOWN_ARM_SECONDS = 4.05;
  const POST_COUNTDOWN_SPEECH_DELAY_MS = 550;

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
  let beepSoundBuffer = null;
  let audioAssetsPromise = null;
  let activeAudioSources = new Set();
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
    await unlockAudio();
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

    if (!countdownTrackJustPlayed) {
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

    if (!countdownTrackScheduledForEndAt && alertSoundBuffer && durationMs >= 4200 && remainingMs <= ALPINE_COUNTDOWN_ARM_SECONDS * 1000) {
      if (scheduleAlpineCountdownTrack(remainingMs)) {
        lastCountdownSecond = 'track';
        return;
      }
    }

    if (countdownTrackScheduledForEndAt) return;

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    if (remainingSeconds > 0 && remainingSeconds <= 3 && remainingSeconds !== lastCountdownSecond) {
      lastCountdownSecond = remainingSeconds;
      playCountdownBeep(remainingSeconds);
    }
  }

  async function unlockAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      await loadAudioAssets();
    } catch (error) {
      console.warn('Audio could not be started:', error);
    }
  }

  function loadAudioAssets() {
    if (!audioCtx) return Promise.resolve();
    if (audioAssetsPromise) return audioAssetsPromise;

    audioAssetsPromise = Promise.allSettled([
      loadAudioBuffer(ALERT_SOUND_SRC),
      loadAudioBuffer(BEEP_SOUND_SRC)
    ]).then((results) => {
      if (results[0].status === 'fulfilled') alertSoundBuffer = results[0].value;
      if (results[1].status === 'fulfilled') beepSoundBuffer = results[1].value;
      if (!alertSoundBuffer && !beepSoundBuffer) {
        throw new Error('No audio files could be loaded.');
      }
    }).catch((error) => {
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

  function playAlpineAlert(kind) {
    if (!config.sound) return;

    const playUploaded = () => {
      const buffer = kind === 'complete' ? (alertSoundBuffer || beepSoundBuffer) : (beepSoundBuffer || alertSoundBuffer);
      if (!buffer) return false;
      playAudioBuffer(buffer, kind === 'complete' ? 0.82 : 0.74);
      vibrate(kind === 'complete' ? [80, 60, 120] : [45]);
      return true;
    };

    try {
      if (audioCtx && playUploaded()) return;
      unlockAudio().then(() => {
        if (!playUploaded()) playGeneratedAlpineAlert(kind);
      }).catch(() => playGeneratedAlpineAlert(kind));
    } catch (error) {
      console.warn('Alert sound failed:', error);
      playGeneratedAlpineAlert(kind);
    }
  }

  function scheduleAlpineCountdownTrack(remainingMs) {
    if (!config.sound || !audioCtx || !alertSoundBuffer) return false;

    const secondsUntilEnd = Math.max(0, remainingMs / 1000);
    const scheduledStartTime = audioCtx.currentTime + Math.max(0, secondsUntilEnd - ALPINE_COUNTDOWN_FINAL_BEEP_AT_SECONDS);
    playAudioBuffer(alertSoundBuffer, 0.82, scheduledStartTime);
    countdownTrackScheduledForEndAt = endAt;
    vibrate([25, 975, 25, 975, 25, 975, 90]);
    return true;
  }

  function playCountdownBeep(seconds) {
    if (!config.sound) return;

    const playUploaded = () => {
      const buffer = beepSoundBuffer || alertSoundBuffer;
      if (!buffer) return false;
      playAudioBuffer(buffer, seconds === 1 ? 0.82 : 0.7);
      vibrate(25);
      return true;
    };

    try {
      if (audioCtx && playUploaded()) return;
      unlockAudio().then(() => {
        if (!playUploaded()) playGeneratedCountdownBeep(seconds);
      }).catch(() => playGeneratedCountdownBeep(seconds));
    } catch (error) {
      console.warn('Countdown sound failed:', error);
      playGeneratedCountdownBeep(seconds);
    }
  }

  function playAudioBuffer(buffer, volume, when = null) {
    if (!audioCtx || !buffer) return;
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    const startTime = Math.max(audioCtx.currentTime + 0.003, when ?? audioCtx.currentTime);
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, startTime);
    source.connect(gain).connect(audioCtx.destination);
    activeAudioSources.add(source);
    source.onended = () => activeAudioSources.delete(source);
    source.start(startTime);
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
  }

  function playGeneratedAlpineAlert(kind) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      const now = audioCtx.currentTime + 0.015;
      const pattern = kind === 'complete'
        ? [880, 1175, 1568, 1175, 1760]
        : kind === 'reset'
          ? [440, 392]
          : [988, 1319, 988];
      pattern.forEach((freq, i) => {
        scheduleTone(freq, now + i * 0.13, 0.105, i % 2 ? 'triangle' : 'square', 0.13);
        scheduleTone(freq / 2, now + i * 0.13, 0.105, 'sine', 0.045);
      });
      vibrate(kind === 'complete' ? [80, 60, 120] : [45]);
    } catch (error) {
      console.warn('Generated alert sound failed:', error);
    }
  }

  function playGeneratedCountdownBeep(seconds) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      const base = seconds === 1 ? 1320 : 1040;
      scheduleTone(base, audioCtx.currentTime + 0.01, 0.075, 'square', 0.11);
      vibrate(25);
    } catch (error) {
      console.warn('Generated countdown sound failed:', error);
    }
  }

  function scheduleTone(frequency, start, duration, type, volume) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.035);
  }

  function speak(text) {
    if (!config.voice || !('speechSynthesis' in window)) {
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
