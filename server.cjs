// server.cjs

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// متغيرات البيئة
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ملف الكاش
const CACHE_FILE = "conversations.json";
let conversations = {};

// تحميل الكاش من الملف عند بداية التشغيل
if (fs.existsSync(CACHE_FILE)) {
  conversations = JSON.parse(fs.readFileSync(CACHE_FILE));
}

// حفظ الكاش على ملف
function saveConversations() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(conversations, null, 2));
}

// إرسال رسالة عبر Ultramsg
async function sendMessage(to, text) {
  try {
    await axios.post(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body: text,
    });
    console.log(`✅ أُرسلت رسالة إلى ${to}: ${text}`);
  } catch (err) {
    console.error("❌ Ultramsg error:", err.response?.data || err.message);
  }
}

// استدعاء ChatGPT
async function askChatGPT(userId, userMessage) {
  // إنشاء سياق المحادثة لكل عميل
  if (!conversations[userId]) {
    conversations[userId] = [];
  }

  conversations[userId].push({ role: "user", content: userMessage });

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "أنت موظف خدمة عملاء في متجر eSelect | إي سيلكت. رد على العملاء باحترافية وبأسلوب بشري ودود، وأجب على الاستفسارات حول المنتجات، الطلبات، الدفع، الشحن، السياسات. إذا لم تكن المعلومة متوفرة أعطِ أفضل توجيه.",
          },
          ...conversations[userId],
        ],
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    conversations[userId].push({ role: "assistant", content: reply });
    saveConversations();

    return reply;
  } catch (err) {
    console.error("❌ ChatGPT error:", err.response?.data || err.message);
    return "عذرًا، حدث خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// Webhook للاستقبال
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.data || !data.data.from || !data.data.body) {
      return res.sendStatus(400);
    }

    const from = data.data.from;
    const message = data.data.body;

    console.log(`📩 رسالة من ${from}: ${message}`);

    // استدعاء ChatGPT
    const reply = await askChatGPT(from, message);

    // أرسل الرد للعميل
    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
