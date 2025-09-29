require("dotenv").config();
const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");

const app = express();
app.use(express.json());

// ✅ إعداد الكاش (تخزين المحادثات لمدة يوم)
const cache = new NodeCache({ stdTTL: 60 * 60 * 24, checkperiod: 120 });

// ✅ متغيرات البيئة
const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ULTRAMSG_API_URL = process.env.ULTRAMSG_API_URL; // ex: https://api.ultramsg.com/instanceXXXXXX/messages/chat
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

// 🔹 استقبال رسائل WhatsApp
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    console.log("📩 Incoming:", JSON.stringify(data, null, 2));

    if (data.eventType !== "message_received") {
      console.log(`↩️ Ignored event_type: ${data.eventType}`);
      return res.sendStatus(200);
    }

    const msg = data.sample;
    if (!msg || !msg.body || msg.fromMe) {
      return res.sendStatus(200);
    }

    const from = msg.from;
    const text = msg.body.trim();

    // 🔹 تحقق من الكاش (لو الرد محفوظ)
    let responseText = cache.get(`${from}_${text}`);
    if (!responseText) {
      console.log("🧠 Asking OpenAI...");

      const completion = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "انت مساعد ذكي يخدم عملاء متجر eSelect باحترافية. رد باختصار ولباقة." },
            { role: "user", content: text }
          ],
          max_tokens: 250
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      responseText =
        completion.data.choices[0]?.message?.content ||
        "عذرًا، حدث خطأ مؤقت. حاول مرة ثانية 🙏";

      // حفظ الرد في الكاش
      cache.set(`${from}_${text}`, responseText);
    } else {
      console.log("⚡ Reply from cache");
    }

    // 🔹 إرسال الرد عبر Ultramsg
    const ultramsgResp = await axios.post(
      ULTRAMSG_API_URL,
      {
        token: ULTRAMSG_TOKEN,
        to: from,
        body: responseText
      }
    );

    console.log("✅ Sent:", ultramsgResp.data);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.sendStatus(500);
  }
});

// ✅ تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
