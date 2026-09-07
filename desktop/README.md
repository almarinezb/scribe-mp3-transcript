# Scribe for Windows

This is the install-free Windows desktop edition of Scribe.

- MP3 files up to 50 MB
- On-device Whisper transcription (GPU when WebGPU is available, CPU fallback)
- Editable transcript, copy button, and TXT download
- Live progress and elapsed transcription time
- No OpenAI API key and no audio upload

The first transcription downloads the Whisper model from Hugging Face. Electron caches it locally for later runs.

## Development

```powershell
npm install
npm run dev
```

## Build the portable app

```powershell
npm run dist
```

The executable is written to `release/Scribe-1.0.0-Windows.exe`.
