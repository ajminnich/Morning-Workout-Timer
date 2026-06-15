# Core + Push Up Tabata Timer

This is a self-contained web app for an interval workout that alternates:

1. One core exercise
2. One push up interval

The default workout has 10 rounds, a 1:15 core interval, and a 0:50 push up interval. The voice-over system has been removed. The screen still shows the current and next workout names, and the Alpine Ski Clock sound effect can play near the end of each interval.

## Important iPad audio note

On iPad, tap **Enable / Test Sound** once before starting. This gives Safari or Chrome a real tap to unlock the audio route, then plays the Alpine Ski Clock sound.

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
```

## Edit the safe local text files

Edit `config/timer.txt` to change time defaults:

```text
reps=10
main_set=1:15
pushup_set=0:50
prep=0:00
alert=alpine-ski
sound=true
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
3. Tap **Enable / Test Sound**.
4. Confirm you hear the Alpine sound.
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

- The voice options and recorded voice cues have been removed.
- Intervals now switch immediately without a voice-over pause between them.
- The Alpine countdown uses the cropped, noise-reduced file in `assets/alpine-ski-clock-full.*`.
- The app asks for screen wake lock when the browser supports it. If the device still sleeps, change the iPad Auto-Lock setting while working out.
- The Full Screen button uses browser full-screen support when available. On iPhone, iOS may limit full-screen behavior, but the layout remains mobile-friendly.
