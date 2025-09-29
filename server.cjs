// server.cjs
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const NodeCache = require("node-cache");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ✅ كاش للمحادثات والاستفسارات (يبقى ساعتين)
const conversationCache = new NodeCache({ stdTTL: 7200, checkperiod: 120 });

// 🔑 متغيرات البيئة
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;

// 📌 Webhook لاستقبال رسائل واتساب
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.data?.body;
    const from = req.body.data?.from;

    if (!message || !from) {
      return res.sendStatus(200);
    }

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✅ اجلب محادثة العميل من الكاش
    let history = conversationCache.get(from) || [];

    // ✅ جهز الرسالة للإرسال لـ ChatGPT
    const context = `
أنت مساعد ذكي يعمل كموظف خدمة عملاء لمتجر eSelect | إي سيلكت.
يجب أن ترد باللهجة العمانية اللطيفة، وتكون الردود احترافية جدًا.
استخدم دائمًا محتوى المتجر (المنتجات، الأسعار، السياسات) إن توفر.
`;

    const gptResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: context },
          ...history,
          { role: "user", content: message }
        ],
        max_tokens: 500,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = gptResponse.data.choices[0].message.content;
    console.log(`✅ رد: ${reply}`);

    // ✅ خزّن المحادثة في الكاش
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    conversationCache.set(from, history);

    // ✅ أرسل الرد عبر Ultramsg
    await axios.post(
      `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`,
      {
        token: ULTRAMSG_TOKEN,
        to: from,
        body: reply,
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ خطأ:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// ✅ اجعل البورت ديناميكي من Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
