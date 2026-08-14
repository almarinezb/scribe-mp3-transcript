"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import TranscriberWorker from "./transcriber.worker?worker";

type Status = "idle" | "ready" | "transcribing" | "done" | "error";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState("");

  const wordCount = useMemo(
    () => transcript.trim().split(/\s+/).filter(Boolean).length,
    [transcript],
  );

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;

    const isMp3 = nextFile.type === "audio/mpeg" || nextFile.name.toLowerCase().endsWith(".mp3");
    if (!isMp3) {
      setStatus("error");
      setMessage("Please choose an MP3 audio file.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setStatus("error");
      setMessage("This file is over 50 MB. Choose a smaller MP3.");
      return;
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(nextFile);
    setAudioUrl(URL.createObjectURL(nextFile));
    setTranscript("");
    setDuration(0);
    setStatus("ready");
    setMessage("");
    setCopied(false);
    setProgress(0);
    setProcessingStage("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  function resetFile() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null);
    setAudioUrl("");
    setTranscript("");
    setStatus("idle");
    setMessage("");
    setCopied(false);
    setProgress(0);
    setProcessingStage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function transcribe() {
    if (!file) return;
    setStatus("transcribing");
    setMessage("");
    setCopied(false);
    setProgress(0);
    setProcessingStage("Preparing audio");

    try {
      const audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
      const frameCount = Math.ceil(decoded.duration * 16_000);
      const offline = new OfflineAudioContext(1, frameCount, 16_000);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      const samples = rendered.getChannelData(0).slice();
      await audioContext.close();
      setProgress(8);
      setProcessingStage("Loading local Whisper model");

      const text = await new Promise<string>((resolve, reject) => {
        const worker = new TranscriberWorker();

        worker.onmessage = (event: MessageEvent<{ type: string; text?: string; message?: string; progress?: number; stage?: string }>) => {
          const data = event.data;
          if (data.type === "progress") {
            if (typeof data.progress === "number") setProgress(data.progress);
            if (data.stage) setProcessingStage(data.stage);
          } else if (data.type === "result") {
            worker.terminate();
            resolve(data.text || "");
          } else if (data.type === "error") {
            worker.terminate();
            reject(new Error(data.message || "Local transcription failed."));
          }
        };
        worker.onerror = (event) => {
          worker.terminate();
          reject(new Error(event.message || "The local transcription engine could not start."));
        };
        worker.postMessage({ type: "transcribe", audio: samples }, [samples.buffer]);
      });

      setTranscript(text.trim());
      setProgress(100);
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  async function copyTranscript() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadTranscript() {
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name.replace(/\.mp3$/i, "") || "transcript"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Scribe home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>Scribe</span>
        </a>
        <div className="privacy-note"><span /> Runs locally on your computer</div>
      </header>

      <section className="intro">
        <p className="eyebrow">MP3 TO TEXT</p>
        <h1>Turn speech into<br /><em>words.</em></h1>
        <p className="lede">Drop in an MP3. Get an editable transcript you can copy, polish, and keep.</p>
      </section>

      <section className="workspace" aria-label="Audio transcription workspace">
        <div className="upload-panel">
          <div className="panel-heading">
            <span className="step">01</span>
            <div><h2>Upload audio</h2><p>MP3 · up to 50 MB</p></div>
          </div>

          {!file ? (
            <div
              className={`dropzone ${dragging ? "is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div className="upload-icon" aria-hidden="true"><span>↑</span></div>
              <h3>Drop your MP3 here</h3>
              <p>or choose a file from your computer</p>
              <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
                Choose MP3
              </button>
              <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" onChange={onFileChange} hidden />
            </div>
          ) : (
            <div className="file-card">
              <div className="file-row">
                <div className="file-icon" aria-hidden="true">♪</div>
                <div className="file-details"><strong>{file.name}</strong><span>{formatBytes(file.size)} · {formatDuration(duration)}</span></div>
                <button className="icon-button" type="button" onClick={resetFile} aria-label="Remove audio">×</button>
              </div>
              <audio src={audioUrl} controls onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
            </div>
          )}

          <div className="local-engine">
            <span className="local-engine-icon" aria-hidden="true">⌁</span>
            <span><b>On-device transcription</b><small>Your MP3 never leaves this browser. The speech model downloads once.</small></span>
          </div>

          {message && <p className="error-message" role="alert">{message}</p>}

          <button className="primary-button" type="button" onClick={transcribe} disabled={!file || status === "transcribing"}>
            {status === "transcribing" ? <><span className="spinner" /> Working locally… {progress}%</> : <>Transcribe on this computer <span>→</span></>}
          </button>
        </div>

        <div className="transcript-panel">
          <div className="panel-heading transcript-heading">
            <span className="step">02</span>
            <div><h2>Your transcript</h2><p>{wordCount ? `${wordCount} words` : "Ready when you are"}</p></div>
            <div className="actions">
              <button type="button" onClick={downloadTranscript} disabled={!transcript} aria-label="Download transcript">↓ <span>Download</span></button>
              <button className="copy-button" type="button" onClick={copyTranscript} disabled={!transcript}>{copied ? "Copied!" : "Copy text"}</button>
            </div>
          </div>

          <div className={`editor-wrap ${status === "transcribing" ? "is-processing" : ""}`}>
            {status === "transcribing" && (
              <div className="processing" aria-live="polite">
                <div className="wave" aria-hidden="true">{[1,2,3,4,5,6,7,8].map((bar) => <i key={bar} />)}</div>
                <strong>{processingStage || "Listening closely…"}</strong>
                <span>{progress ? `${progress}% complete · ` : ""}Keep this tab open while your computer works.</span>
              </div>
            )}
            {!transcript && status !== "transcribing" ? (
              <div className="empty-state">
                <div className="quote-mark">“</div>
                <p>Your words will appear here, ready to edit and copy.</p>
              </div>
            ) : (
              <textarea
                aria-label="Editable transcript"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                spellCheck="true"
              />
            )}
          </div>
          <div className="editor-footer"><span>Editable text</span><span>{wordCount} words</span></div>
        </div>
      </section>

      <footer><span>© 2026 Scribe</span><span>Clear audio makes clearer transcripts.</span></footer>
    </main>
  );
}
