import { Request, Response } from "express";
import OpenAI from "openai";

type MulterRequest = Request & { file?: Express.Multer.File };

// POST /api/elevenlabs/transcribe
// Accepts multipart/form-data with an "audio" file field (handled by multer).
export const transcribe = async (req: Request, res: Response) => {
  try {
    const file = (req as MulterRequest).file;
    if (!file) {
      return res
        .status(400)
        .json({ error: "An audio file is required (field name: audio)" });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res
        .status(503)
        .json({ error: "ElevenLabs API key is not configured" });
    }

    const blob = new Blob([file.buffer], {
      type: file.mimetype || "audio/webm",
    });

    const formData = new FormData();
    formData.append("file", blob, file.originalname || "recording.webm");
    formData.append("model_id", "scribe_v2");

    const elevenRes = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: formData,
      },
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("ElevenLabs STT error:", elevenRes.status, errText);
      return res.status(502).json({ error: "Transcription failed" });
    }

    const result = (await elevenRes.json()) as { text?: string };
    res.json({ text: result.text ?? "" });
  } catch (error) {
    console.error("Transcribe error:", error);
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
};

// Enhance message with OpenAI using the selected mood + ElevenLabs v3 audio tags
async function applyMoodWithOpenAI(
  text: string,
  mood: string,
  moodDescription?: string,
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return text; // graceful fallback: no enhancement if key missing

  const client = new OpenAI({ apiKey: openaiKey });

  const moodDetail = moodDescription
    ? `${mood} — ${moodDescription}`
    : mood;

  const completion = await client.chat.completions
    .create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional voice script writer specializing in ElevenLabs v3 text-to-speech production.

Your task is to rewrite a given message so that it authentically conveys a specified emotional mood when spoken aloud. You achieve this by:

1. Studying the mood description carefully and letting it completely shape the vocal character — rhythm, word choice, sentence length, pauses, and energy level must all reflect it.
2. Making each mood sound distinctly different from any other. The listener should immediately recognise which mood is being expressed from the delivery alone.
3. Inserting ElevenLabs v3 inline audio expression tags where they enhance authenticity. Use lowercase square-bracket format sparingly — only at moments of genuine emotional peak. Available tags:
   - Vocal reactions: [laughs], [sighs], [gasps], [clears throat], [gulps]
   - Delivery styles: [whispers], [breathlessly], [tenderly], [playfully], [deadpan]
4. Never forcing tags — one or two well-placed tags beat six awkward ones.

Rules:
- Preserve the original language and core meaning (do not translate or change the topic).
- Do not add commentary, explanations, or surrounding quotes.
- Return only the final rewritten message with any tags embedded inline.`,
      },
      {
        role: "user",
        content: `Mood: ${moodDetail}\n\nOriginal message: ${text}`,
      },
    ],
    max_tokens: 600,
    temperature: 0.9,
  });

  return completion.choices[0]?.message?.content?.trim() ?? text;
}

// POST /api/elevenlabs/tts
export const textToSpeech = async (req: Request, res: Response) => {
  try {
    const { text, voiceId, mood, moodDescription } = req.body as {
      text?: string;
      voiceId?: string;
      mood?: string;
      moodDescription?: string;
    };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text is required" });
    }

    const trimmedText = text.trim();
    const TEXT_MAX_LENGTH = 5_000;
    const MOOD_DESC_MAX_LENGTH = 500;

    if (trimmedText.length > TEXT_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `text must not exceed ${TEXT_MAX_LENGTH} characters` });
    }

    if (
      moodDescription &&
      typeof moodDescription === "string" &&
      moodDescription.length > MOOD_DESC_MAX_LENGTH
    ) {
      return res.status(400).json({
        error: `moodDescription must not exceed ${MOOD_DESC_MAX_LENGTH} characters`,
      });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res
        .status(503)
        .json({ error: "ElevenLabs API key is not configured" });
    }

    // If a mood was selected, let OpenAI enhance the text with tags
    const finalText = mood?.trim()
      ? await applyMoodWithOpenAI(trimmedText, mood.trim(), moodDescription)
      : trimmedText;

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
          text: finalText,
          model_id: "eleven_v3",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("ElevenLabs TTS error:", elevenRes.status, errText);
      return res.status(502).json({ error: "ElevenLabs request failed" });
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
