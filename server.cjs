require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// 🔑 المتغيرات من البيئة
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // مثل: eselect.store
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// 📝 كاش لتخزين المحادثات
const CACHE_FILE = path.join(__dirname, "conversations.json");
let conversations = {};
if (fs.existsSync(CACHE_FILE)) {
  conversations = JSON.parse(fs.readFileSync(CACHE_FILE));
}

// ✉️ إرسال رسالة عبر Ultramsg
async function sendMessage(to, body) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    const resp = await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    });
    console.log("✅ Sent via Ultramsg:", {
      to,
      ok: true,
      replyPreview: body.substring(0, 50),
    });
    return resp.data;
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.message);
    return null;
  }
}

// 🤖 استدعاء ChatGPT
async function askChatGPT(userId, text) {
  try {
    const history = conversations[userId] || [];
    history.push({ role: "user", content: text });

    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `أنت مساعد ذكي ومتحدث باللهجة العمانية.
- تجاوب باحتراف على استفسارات العملاء عن متجر eSelect | إي سيلكت.
- استخدم محتوى المتجر (منتجات، أسعار، سياسات).
- إذا ما لقيت معلومة في المتجر، جاوب من معرفتك العامة لكن بشكل مختصر.`,
          },
          ...history,
        ],
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = resp.data.choices[0].message.content.trim();
    history.push({ role: "assistant", content: reply });
    conversations[userId] = history.slice(-10); // نخزن آخر 10 رسائل فقط

    fs.writeFileSync(CACHE_FILE, JSON.stringify(conversations, null, 2));
    return reply;
  } catch (err) {
    console.error("❌ ChatGPT error:", err.message);
    return "عذرًا، صار خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// 🔗 Webhook من Ultramsg
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Incoming:", JSON.stringify(data, null, 2));

    const eventType = data.eventType || data.event_type;
    if (eventType !== "message_received") {
      console.log(`↩️ Ignored event_type: ${eventType}`);
      return res.sendStatus(200);
    }

    const msg = data.sample || data.data;
    if (!msg || !msg.body || msg.fromMe) {
      return res.sendStatus(200);
    }

    const from = msg.from;
    const text = msg.body.trim();

    console.log(`👤 User ${from}: ${text}`);

    const reply = await askChatGPT(from, text);

    if (reply) {
      await sendMessage(from, reply);
    }
  } catch (err) {
    console.error("❌ Webhook handler error:", err.message);
  }
  res.sendStatus(200);
});

// 🚦 تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
