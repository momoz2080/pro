# Notebook

A private notebook for ideas. Type, talk to it, or write by hand. It installs like an app, works offline, and keeps your notes on your own device (IndexedDB). There is no server and no account.

## Gestures

- **Double-tap anywhere on the app** (double-click on a computer) to start dictation. Double-tap again, or press Stop, to end it. It does not trigger on buttons or on words you have already typed, so you can still double-tap a word to select it. Where it lands: inside an open note it adds to that note; anywhere else (page list, sidebar, empty screens) it starts a new voice note in **Quick notes**.
- **Quick notes** sit directly under Daily log in the sidebar. The Quick note button on the page list: a fast new note, kept in its own Quick notes section. Voice notes started from the list go there too.
- **Color dot** at the top of a note: tap it to tint the note (Sky, Mint, Rose, Stone, Aqua). The color also shows in the page list.
- **Two-finger tap on the note** to write by hand with a finger or pen. Tap with two fingers again, or press Done, to go back to typing.
- Buttons for both (Dictate, Write) are always in the top bar if a gesture does not fire.
- While writing by hand, one finger draws and two fingers scroll. If you use a pen, your palm is ignored.
- Typing shortcuts: `- ` bullet, `[] ` checklist, `# ` heading, `> ` decision. Enter splits a block, Backspace merges it.
- Say "new line" or "new paragraph" while dictating to start a new block.

## Files

```
index.html  styles.css  sw.js  manifest.webmanifest
js/      util.js db.js voice.js gestures.js ink.js app.js
icons/   icon.svg icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png
```

## Put it on GitHub Pages (web browser only)

1. Sign in at github.com and click **New repository**. Name it e.g. `notebook`. Choose **Public** (free accounts need this for Pages). Your notes are never in the repo, only the app code.
2. Click **uploading an existing file**. Drag in everything from this folder, keeping the `js` and `icons` folders. Commit.
3. Open **Settings → Pages**. Under Source choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute your app is at `https://USERNAME.github.io/notebook/`.

## Quick note from the app icon

A web app cannot detect a double-tap on its home-screen icon, but you can get close:

- **Android / desktop (installed app):** press and hold the icon, then choose **Quick note**. It opens a new voice note in Quick notes.
- **iPhone:** open the Shortcuts app, make a shortcut with the action **Open URLs** set to `https://USERNAME.github.io/REPO/?quick=1`, then set Settings, Accessibility, Touch, Back Tap, Double Tap to run it. Tapping the back of the phone twice then opens a new voice note. If recording does not start by itself, tap Dictate once (iOS needs a touch to open the microphone).

## Install it

- **iPhone/iPad (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** menu, then **Install app**.
- **Desktop (Chrome/Edge):** the install icon in the address bar.

## Backup

Notes live only in this browser/device. Use **Backup and restore** in the sidebar to download a JSON file regularly, and keep it somewhere safe. Clearing site data or deleting the app erases the notes. **Export for Claude** copies a page, notebook or everything as Markdown for pasting into a chat, or saves it as a **PDF** (with handwriting and note colors). In the print screen choose Save as PDF; on iPhone use Share, then Save to Files.

## Privacy

Typing and handwriting stay on your device. Dictation uses your browser's speech service (Google in Chrome, Apple in Safari), so audio is sent to them. Avoid dictating patient, client or other confidential details.

## Updating

Upload the new files over the old ones (this version changes the cache name, so it replaces the old one cleanly) in GitHub. Open the app twice; the first load fetches the update, the second shows it.

## Troubleshooting

- **No dictation / mic blocked:** allow the microphone for the site. On iPhone also turn on Settings → General → Keyboard → Enable Dictation.
- **Firefox** has no speech recognition; the Dictate button will say so.
- **Double-tap does not start recording on iPhone:** use the Dictate button, and tell me so I can adjust it.
- **Handwriting feels off:** make sure Write is on (button highlighted) and use Add space for more room.
