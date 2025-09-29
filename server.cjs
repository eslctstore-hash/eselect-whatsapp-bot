// 📦 استدعاء المكتبات
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

// ✅ متغيرات البيئة
const PORT = process.env.PORT || 10000;
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 🧠 الكاش لحفظ المحادثات
const CACHE_FILE = "conversations.json";
let conversations = {};
if (fs.existsSync(CACHE_FILE)) {
  conversations = JSON.parse(fs.readFileSync(CACHE_FILE));
}

// 🛠️ دالة لحفظ الكاش
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(conversations, null, 2));
}

// 🚀 دالة إرسال رسالة عبر Ultramsg
async function sendMessage(to, body) {
  try {
    await axios.post(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    });
    console.log(`✅ أُرسلت رسالة إلى ${to}: ${body}`);
  } catch (err) {
    console.error("❌ خطأ في الإرسال:", err.response?.data || err.message);
  }
}

// 🤖 اختيار الموديل المناسب
function pickModel(message) {
  if (message.length < 50) return "gpt-4o-mini"; // رد سريع
  if (message.length > 500) return "gpt-4o-mini-128k"; // محادثة طويلة
  return "gpt-4o"; // استفسارات متوسطة / معقدة
}

// 🧠 دالة طلب رد من OpenAI
async function getAIResponse(userId, message) {
  try {
    // منع التكرار إذا نفس الرسالة انرسلت قبل قليل
    if (
      conversations[userId] &&
      conversations[userId].lastMessage === message
    ) {
      console.log("⚠️ تم تجاهل الرسالة لتفادي التكرار");
      return null;
    }

    const model = pickModel(message);
    console.log(`🧠 استخدام الموديل: ${model}`);

    // حفظ الرسائل في الكاش
    if (!conversations[userId]) conversations[userId] = { history: [] };
    conversations[userId].history.push({ role: "user", content: message });
    conversations[userId].lastMessage = message;

    // طلب من OpenAI
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages: [
          {
            role: "system",
            content: `انت مساعد ذكي واحترافي لمتجر eSelect | إي سيلكت.
- رد باللهجة العمانية الودية.
- جاوب على الأسئلة حول المنتجات، الأسعار، الشحن، السياسات.
- إذا ما عندك جواب، قل للعميل إنك بتحول استفساره لفريق خدمة العملاء.
- لا تكرر الردود، ولا تعتذر أكثر من مرة.
- إذا كان خطأ تقني، قل "صار خطأ مؤقت، حاول لاحقًا".`,
          },
          ...conversations[userId].history.slice(-10), // آخر 10 رسائل فقط
        ],
        max_tokens: 300,
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );

    const aiMessage = response.data.choices[0].message.content.trim();
    conversations[userId].history.push({ role: "assistant", content: aiMessage });
    saveCache();

    return aiMessage;
  } catch (err) {
    console.error("❌ ChatGPT error:", err.response?.data || err.message);

    // منع اللوب والتكرار في حالة الخطأ
    if (err.response?.data?.error?.code === "rate_limit_exceeded") {
      return "🚦 النظام مشغول حالياً. حاول بعد شوي 🙏";
    }

    return null; // ما يرد إذا خطأ غير متحكم فيه
  }
}

// 📩 Webhook من Ultramsg
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const data = req.body;
    const from = data.from;
    const message = data.body?.trim();

    if (!from || !message) return;

    console.log(`📩 رسالة من ${from}: ${message}`);

    const reply = await getAIResponse(from, message);
    if (reply) await sendMessage(from, reply);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// 🚀 تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
