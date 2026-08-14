import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

self.onmessage = async (event) => {
  if (event.data.type !== "transcribe") return;

  try {
    const hasWebGpu = Boolean(navigator.gpu);
    const progressCallback = (info) => {
      if (info.status === "progress" && typeof info.progress === "number") {
        self.postMessage({
          type: "progress",
          progress: Math.max(9, Math.min(48, Math.round(9 + info.progress * 0.39))),
          stage: "Downloading local Whisper model",
        });
      }
    };

    const transcriber = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      {
        ...(hasWebGpu ? { device: "webgpu" } : {}),
        progress_callback: progressCallback,
      },
    );

    self.postMessage({
      type: "progress",
      progress: 52,
      stage: hasWebGpu ? "Transcribing with your GPU" : "Transcribing with your CPU",
    });

    const output = await transcriber(event.data.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    const result = Array.isArray(output) ? output[0] : output;
    self.postMessage({ type: "result", text: typeof result?.text === "string" ? result.text : "" });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Local transcription failed.",
    });
  }
};
