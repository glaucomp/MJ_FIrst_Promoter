import { Request, Response } from "express";
import OpenAI from "openai";

type MulterRequest = Request & { file?: Express.Multer.File };

async function translateText(text: string, targetLanguage: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return text;

  const client = new OpenAI({ apiKey: openaiKey });
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the given text to ${targetLanguage}. Return only the translated text — no explanations, no quotes, no extra content.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 600,
      temperature: 0.3,
    });
    return completion.choices[0]?.message?.content?.trim() ?? text;
  } catch (err) {
    console.error("Translation failed, using original text:", err);
    return text;
  }
}

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

// POST /api/elevenlabs/tts
export const textToSpeech = async (req: Request, res: Response) => {
  try {
    const { text, voiceId, mood, moodDescription, language } = req.body as {
      text?: string;
      voiceId?: string;
      mood?: string;
      moodDescription?: string;
      language?: string;
    };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text is required" });
    }

    // Validate optional string fields to prevent runtime errors on non-string input
    if (mood !== undefined && typeof mood !== "string") {
      return res.status(400).json({ error: "mood must be a string" });
    }

    if (voiceId !== undefined && typeof voiceId !== "string") {
      return res.status(400).json({ error: "voiceId must be a string" });
    }

    // Require a voiceId — we no longer silently fall back to a global default,
    // which could let a chatter record audio in the WRONG model's voice.
    if (!voiceId?.trim()) {
      return res.status(400).json({
        error:
          "No voice is configured for this model. Please sync the model from TeaseMe or ask an admin to set a voiceId.",
        code: "MISSING_VOICE_ID",
      });
    }

    // ElevenLabs voice IDs are short alphanumeric strings; reject anything that
    // could alter the URL path (prevents path traversal / injection).
    const VOICE_ID_RE = /^[A-Za-z0-9]{1,64}$/;
    if (!VOICE_ID_RE.test(voiceId)) {
      return res.status(400).json({ error: "Invalid voiceId format" });
    }

    if (moodDescription !== undefined && typeof moodDescription !== "string") {
      return res.status(400).json({ error: "moodDescription must be a string" });
    }

    if (language !== undefined && typeof language !== "string") {
      return res.status(400).json({ error: "language must be a string" });
    }

    const trimmedText = text.trim();
    const TEXT_MAX_LENGTH = 5_000;
    const MOOD_DESC_MAX_LENGTH = 500;

    if (trimmedText.length > TEXT_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `text must not exceed ${TEXT_MAX_LENGTH} characters` });
    }

    if (moodDescription && moodDescription.length > MOOD_DESC_MAX_LENGTH) {
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

    const LANGUAGE_NAMES: Record<string, string> = {
      en: "English", es: "Spanish", pt: "Portuguese", fr: "French",
      it: "Italian", de: "German", pl: "Polish", ru: "Russian",
      ar: "Arabic", hi: "Hindi", ja: "Japanese", ko: "Korean",
      zh: "Chinese", tr: "Turkish", nl: "Dutch",
    };

    const trimmedLanguage = language?.trim() ?? "en";
    const languageName = LANGUAGE_NAMES[trimmedLanguage] ?? trimmedLanguage;
    const finalText = trimmedLanguage && trimmedLanguage !== "en"
      ? await translateText(trimmedText, languageName)
      : trimmedText;

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
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
