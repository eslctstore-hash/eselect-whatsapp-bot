import OpenAI from "openai";
import fs from "fs";
import { downloadMediaFile } from "../core/ultramsg.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(mediaUrl) {
  try {
    const tempFile = `./public/temp/audio_${Date.now()}.ogg`;
    await downloadMediaFile(mediaUrl, tempFile);

    const fileStream = fs.createReadStream(tempFile);
    const result = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "gpt-4o-mini-transcribe",
    });

    fs.unlinkSync(tempFile);
    return result.text || "❌ لم أتمكن من سماع الصوت بوضوح.";
  } catch (err) {
    console.error("🎧 Whisper Error:", err.message);
    return "⚠️ تعذر تحويل الصوت إلى نص.";
  }
}
