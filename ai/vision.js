import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeMedia(mediaUrl) {
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "صف محتوى هذه الصورة باختصار دقيق." },
            { type: "image_url", image_url: mediaUrl },
          ],
        },
      ],
    });

    return result.choices[0].message.content;
  } catch (err) {
    console.error("🖼️ Vision Error:", err.message);
    return "⚠️ تعذر تحليل الصورة حالياً.";
  }
}
