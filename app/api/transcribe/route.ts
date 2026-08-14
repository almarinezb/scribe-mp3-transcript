export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No MP3 file was received." }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: "The MP3 must be smaller than 50 MB." }, { status: 400 });
    }

    const suppliedKey = request.headers.get("x-openai-key")?.trim();
    const serverKey = typeof process !== "undefined" ? process.env.OPENAI_API_KEY : undefined;
    const apiKey = suppliedKey || serverKey;

    if (!apiKey) {
      return Response.json(
        { error: "Add your OpenAI API key, then try again." },
        { status: 401 },
      );
    }

    const upstream = new FormData();
    upstream.append("file", file, file.name);
    upstream.append("model", "gpt-4o-mini-transcribe");
    upstream.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    const result = (await response.json()) as { text?: string; error?: { message?: string } };
    if (!response.ok) {
      const detail = result.error?.message || "The transcription service could not process this file.";
      return Response.json({ error: detail }, { status: response.status });
    }

    return Response.json({ text: result.text || "" });
  } catch {
    return Response.json({ error: "The audio could not be transcribed. Please try again." }, { status: 500 });
  }
}
