import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type Status = "idle" | "ready" | "transcribing" | "done" | "error";
type WorkerMessage = { type: string; text?: string; message?: string; progress?: number; stage?: string };
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

function formatElapsed(milliseconds: number) {
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.floor(seconds % 60).toString().padStart(2, "0")}s`;
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
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
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    workerRef.current?.terminate();
  }, [audioUrl]);

  const wordCount = useMemo(() => transcript.trim().split(/\s+/).filter(Boolean).length, [transcript]);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (!(nextFile.type === "audio/mpeg" || nextFile.name.toLowerCase().endsWith(".mp3"))) {
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
    setElapsedMs(0);
  }

  function resetFile() {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    startedAtRef.current = null;
    setFile(null);
    setAudioUrl("");
    setTranscript("");
    setStatus("idle");
    setMessage("");
    setProgress(0);
    setProcessingStage("");
    setElapsedMs(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function transcribe() {
    if (!file) return;
    setStatus("transcribing");
    setMessage("");
    setProgress(0);
    setProcessingStage("Preparing audio");
    setElapsedMs(0);
    startedAtRef.current = performance.now();
    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current !== null) setElapsedMs(performance.now() - startedAtRef.current);
    }, 100);

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
        const worker = new Worker(new URL("./transcriber.worker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const data = event.data;
          if (data.type === "progress") {
            if (typeof data.progress === "number") setProgress(data.progress);
            if (data.stage) setProcessingStage(data.stage);
          } else if (data.type === "result") {
            worker.terminate();
            workerRef.current = null;
            resolve(data.text || "");
          } else if (data.type === "error") {
            worker.terminate();
            workerRef.current = null;
            reject(new Error(data.message || "Local transcription failed."));
          }
        };
        worker.onerror = (event) => {
          worker.terminate();
          workerRef.current = null;
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
    } finally {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      if (startedAtRef.current !== null) setElapsedMs(performance.now() - startedAtRef.current);
      startedAtRef.current = null;
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
        <div className="brand"><span className="brand-mark"><i /><i /><i /><i /></span><span>Scribe</span></div>
        <div className="privacy-note"><span /> Desktop app · runs locally</div>
      </header>

      <section className="intro">
        <p className="eyebrow">MP3 TO TEXT</p>
        <h1>Turn speech into<br /><em>words.</em></h1>
        <p className="lede">Drop in an MP3. Get an editable transcript you can copy, polish, and keep.</p>
      </section>

      <section className="workspace">
        <div className="upload-panel">
          <div className="panel-heading"><span className="step">01</span><div><h2>Upload audio</h2><p>MP3 · up to 50 MB</p></div></div>
          {!file ? (
            <div className={`dropzone ${dragging ? "is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
              <div className="upload-icon"><span>↑</span></div><h3>Drop your MP3 here</h3><p>or choose a file from your computer</p>
              <button className="secondary-button" onClick={() => inputRef.current?.click()}>Choose MP3</button>
              <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} hidden />
            </div>
          ) : (
            <div className="file-card"><div className="file-row"><div className="file-icon">♪</div><div className="file-details"><strong>{file.name}</strong><span>{formatBytes(file.size)} · {formatDuration(duration)}</span></div><button className="icon-button" onClick={resetFile} disabled={status === "transcribing"}>×</button></div><audio src={audioUrl} controls onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} /></div>
          )}
          <div className="local-engine"><span className="local-engine-icon">⌁</span><span><b>On-device transcription</b><small>Your MP3 never leaves this app. The speech model downloads once, then stays cached.</small></span></div>
          {message && <p className="error-message" role="alert">{message}</p>}
          <button className="primary-button" onClick={transcribe} disabled={!file || status === "transcribing"}>{status === "transcribing" ? <><span className="spinner" /> Working locally… {progress}%</> : <>Transcribe on this computer <span>→</span></>}</button>
        </div>

        <div className="transcript-panel">
          <div className="panel-heading transcript-heading"><span className="step">02</span><div><h2>Your transcript</h2><p>{wordCount ? `${wordCount} words · took ${formatElapsed(elapsedMs)}` : "Ready when you are"}</p></div><div className="actions"><button onClick={downloadTranscript} disabled={!transcript}>↓ Download</button><button className="copy-button" onClick={copyTranscript} disabled={!transcript}>{copied ? "Copied!" : "Copy text"}</button></div></div>
          <div className={`editor-wrap ${status === "transcribing" ? "is-processing" : ""}`}>
            {status === "transcribing" && <div className="processing"><div className="wave">{[1,2,3,4,5,6,7,8].map((bar) => <i key={bar} />)}</div><strong>{processingStage || "Listening closely…"}</strong><span>{formatElapsed(elapsedMs)} elapsed · {progress ? `${progress}% complete` : "Starting"}</span></div>}
            {!transcript && status !== "transcribing" ? <div className="empty-state"><div className="quote-mark">“</div><p>Your words will appear here, ready to edit and copy.</p></div> : <textarea aria-label="Editable transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} spellCheck />}
          </div>
          <div className="editor-footer"><span>Editable text</span><span>{status === "done" ? `Transcribed in ${formatElapsed(elapsedMs)} · ` : ""}{wordCount} words</span></div>
        </div>
      </section>
      <footer><span>© 2026 Scribe</span><span>Private · no API key · on-device</span></footer>
    </main>
  );
}
