import { Request, Response } from "express";

export const textToSpeech = async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body as { text?: string; voiceId?: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text is required" });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res
        .status(503)
        .json({ error: "ElevenLabs API key is not configured" });
    }

    const voice =
      voiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_v3",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("ElevenLabs error:", elevenRes.status, errText);
      return res
        .status(502)
        .json({ error: "ElevenLabs request failed", detail: errText });
    }

    const audioBuffer = await elevenRes.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(audioBuffer.byteLength));
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("TTS error:", error);
    res.status(500).json({ error: "Failed to generate audio" });
  }
};
