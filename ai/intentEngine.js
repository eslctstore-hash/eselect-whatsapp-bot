import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function detectIntent(message) {
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "حلل نية العميل من الجملة التالية وأعد فقط كلمة واحدة تصف نوعها (product_query, order_query, complaint, general).",
        },
        { role: "user", content: message },
      ],
    });

    return result.choices[0].message.content.trim().toLowerCase();
  } catch {
    return "general";
  }
}
