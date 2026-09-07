import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

type Request = { type: "transcribe"; audio: Float32Array };

self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type !== "transcribe") return;

  try {
    const hasWebGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
    const progressCallback = (info: { status?: string; progress?: number }) => {
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
        ...(hasWebGpu ? { device: "webgpu" as const, dtype: "q4" as const } : { dtype: "q8" as const }),
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
