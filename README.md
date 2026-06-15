# Core + Push Up Tabata Timer

This is a self-contained web app for an interval workout that alternates:

1. One core exercise
2. One push up interval

The default workout has 10 rounds, a 1:15 core interval, and a 0:50 push up interval. Before each interval, the app announces the exercise name. Push up intervals are announced as "Push ups". The beep/alert sound uses the cleaned Alpine Ski Clock audio provided for this version.

## Important iPad audio note

This version avoids relying only on browser text-to-speech. The default workout names are bundled as recorded audio files in `assets/voice/`, and the Alpine Ski alert is bundled as MP3, M4A, and WAV.

On iPad, tap **Enable / Test Sound + Voice** once before starting. The button plays a recorded voice cue and the full Alpine Ski Clock sound so Safari/Chrome can unlock the audio route from a real tap.

If the timer appears to trigger sound but you hear nothing, check:

- iPad volume buttons
- Control Center output route, such as Bluetooth headphones or AirPlay
- Silent/Focus modes
- Whether the site was refreshed after uploading the newest files

## Files

```text
core-pushup-timer/
  index.html
  styles.css
  app.js
  manifest.webmanifest
  sw.js
  serve.py
  config/
    timer.txt
    workouts.txt
  assets/
    icon.svg
    icon-192.png
    icon-512.png
    alpine-ski-clock-full.mp3
    alpine-ski-clock-full.m4a
    alpine-ski-clock-full.wav
    voice/
      front-plank.wav
      abs-brace.wav
      hand-slides.wav
      alternating-crunch.wav
      hand-to-heel.wav
      hip-raises.wav
      reverse-crunch.wav
      boat-hold.wav
      chair-sit-ups.wav
      spider.wav
      push-ups.wav
      get-ready.wav
      workout-complete.wav
      sound-ready.wav
```

## Edit the safe local text files

Edit `config/timer.txt` to change time defaults:

```text
reps=10
main_set=1:15
pushup_set=0:50
prep=0:00
alert=alpine-ski
voice=true
sound=true
countdown=true
```

Edit `config/workouts.txt` to change the core workout names. Keep one name per line:

```text
Front plank
Abs brace
Hand slides
Hand to heel
```

The app reads only the text files inside its own `config/` folder. It does not request access to arbitrary folders on your device.

## Run on a PC or Mac

From the unzipped folder, run a small local web server:

```bash
cd core-pushup-timer
python3 serve.py
```

Open this in a browser on that computer:

```text
http://localhost:8000
```

## Run on iPad or iPhone

For everyday iPad use, host it with GitHub Pages and add it to the Home Screen.

After updating GitHub Pages:

1. Open the site in Safari while online.
2. Refresh once.
3. Tap **Enable / Test Sound + Voice**.
4. Confirm you hear both the voice and Alpine sound.
5. Tap **Start**.
6. Add it to the Home Screen after the new version is working.

After the first successful online load, the service worker caches the app for offline use. If you edit `config/timer.txt` or `config/workouts.txt`, reload the page while online so the latest files are loaded.

## In-app edits

The app also has an editor panel. Use:

- Apply now: uses the visible settings immediately.
- Save on this device: stores the current settings in browser storage on that device.
- Clear device save: returns to the `config/` text file defaults.
- Download timer.txt / workouts.txt: exports replacement config files.

## Notes

- Default voice names are recorded audio files. If you change workout names to something not in the bundled voice list, the app will try browser text-to-speech as a fallback.
- The app asks for screen wake lock when the browser supports it. If the device still sleeps, change the iPad Auto-Lock setting while working out.
- The Full Screen button uses browser full-screen support when available. On iPhone, iOS may limit full-screen behavior, but the layout remains mobile-friendly.


Audio update: the Alpine countdown uses the cropped, noise-reduced file in `assets/alpine-ski-clock-full.*`.
