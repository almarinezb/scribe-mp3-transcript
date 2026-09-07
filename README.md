# Scribe

Scribe is a private, browser-based MP3 transcription app. It runs a multilingual Whisper model on the user's own computer through WebGPU when available, with a CPU/WASM fallback.

## Features

- Drag-and-drop MP3 uploads up to 50 MB
- On-device transcription with no API key and no audio upload
- Live progress and elapsed-time tracking
- Editable transcript with one-click copy and TXT download
- Responsive, accessible interface

## Live app

[scribe-mp3-transcript.almarinezb.chatgpt.site](https://scribe-mp3-transcript.almarinezb.chatgpt.site)

The first transcription downloads the local Whisper model from Hugging Face. The browser caches it for future use.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Windows desktop app

The standalone, API-key-free desktop edition lives in [`desktop/`](desktop/README.md). Build its portable executable with:

```powershell
cd desktop
npm install
npm run dist
```

The result is `desktop/release/Scribe-1.0.0-Windows.exe`.

## Build

```bash
npm run build
```

## Privacy

Audio decoding and speech recognition happen inside the browser. MP3 files and transcripts are not sent to the app server.

## License

MIT
