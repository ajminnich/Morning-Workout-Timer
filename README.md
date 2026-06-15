# Core + Push Up Tabata Timer

This is a self-contained web app for an interval workout that alternates:

1. One core exercise
2. One push up interval

The default workout has 10 rounds, a 1:15 core interval, and a 0:50 push up interval. Before each interval, the app speaks the exercise name. Push up intervals are announced as "Push ups". The beep/alert sound uses the cleaned Alpine Ski Clock audio provided for this version. The audio was noise-reduced, trimmed, and reassembled so the beeps land on whole-second marks.

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
    alpine-ski-clock-full.m4a
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

For one-time local testing, you can serve the folder from a computer on the same Wi-Fi network:

1. Start the local web server on the computer with `python3 serve.py`.
2. Use the iPad URL printed by the server.
3. On the iPad, open Safari to `http://YOUR-COMPUTER-IP:8000`.
4. Tap Share, then Add to Home Screen.
5. Tap Start once while the iPad is unlocked so Safari permits the voice and audio cues.

After the first load, the app can cache itself for offline use. If you edit `config/timer.txt` or `config/workouts.txt`, reload the page while connected to the server so the latest config files are loaded.

## In-app edits

The app also has an editor panel. Use:

- Apply now: uses the visible settings immediately.
- Save on this device: stores the current settings in browser storage on that device.
- Clear device save: returns to the `config/` text file defaults.
- Download timer.txt / workouts.txt: exports replacement config files.

## Notes

- Browser audio and text-to-speech on iPad require a user gesture, so the sound and voice start after tapping Start.
- The app asks for screen wake lock when the browser supports it. If the device still sleeps, change the iPad Auto-Lock setting while working out.
- The Full Screen button uses browser full-screen support when available. On iPhone, iOS may limit full-screen behavior, but the layout remains mobile-friendly.
