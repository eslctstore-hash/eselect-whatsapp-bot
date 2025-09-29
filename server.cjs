const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ بيئة
const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ULTRAMSG_API_URL = process.env.ULTRAMSG_API_URL; // مثل: https://api.ultramsg.com/instanceXXXX/messages/chat
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

// 🟢 Endpoint للفحص
app.get("/", (req, res) => {
  res.send("✅ WhatsApp bot is running...");
});

// 🟢 Webhook من Ultramsg
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Received webhook:", req.body);

    // التأكد من أن الرسالة نصية
    const message = req.body?.body;
    const from = req.body?.from;

    if (!message || !from) {
      console.log("⚠️ Webhook ignored: no message or sender.");
      return res.sendStatus(200);
    }

    // ✅ تجاهل رسائل البوت نفسه
    if (req.body.self === "1") {
      return res.sendStatus(200);
    }

    // ✅ رد افتراضي إذا فشل استدعاء ChatGPT
    let reply = "عذرًا، حدث خطأ مؤقت. حاول مرة ثانية 🙏";

    // ✅ استدعاء OpenAI
    try {
      const gptRes = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "أنت بوت واتساب باللهجة العُمانية تساعد العملاء." },
            { role: "user", content: message }
          ],
          max_tokens: 500
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      reply = gptRes.data.choices[0].message.content;
    } catch (err) {
      console.error("❌ ChatGPT error:", err.response?.data || err.message);
    }

    // ✅ إرسال الرد للعميل عبر Ultramsg
    try {
      await axios.post(
        ULTRAMSG_API_URL,
        {
          token: ULTRAMSG_TOKEN,
          to: from,
          body: reply
        },
        { headers: { "Content-Type": "application/json" } }
      );
      console.log("✅ Reply sent:", reply);
    } catch (err) {
      console.error("❌ Ultramsg error:", err.response?.data || err.message);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
