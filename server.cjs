// تحميل المتغيرات من ملف .env
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ==========================
// إعدادات من ملف .env
// ==========================
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 10000;

// ملف لتخزين المحادثات (الكاش)
const conversationsFile = path.join(__dirname, "conversations.json");

// تحميل المحادثات السابقة إن وجدت
let conversations = {};
if (fs.existsSync(conversationsFile)) {
  try {
    conversations = JSON.parse(fs.readFileSync(conversationsFile));
  } catch (err) {
    console.error("❌ خطأ في قراءة conversations.json:", err.message);
  }
}

// حفظ المحادثات في ملف
function saveConversations() {
  fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2));
}

// ==========================
// دالة إرسال رسالة عبر Ultramsg
// ==========================
async function sendMessage(to, body) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    });
    console.log(`✅ أُرسلت رسالة إلى ${to}: ${body}`);
  } catch (error) {
    console.error("❌ خطأ أثناء إرسال الرسالة:", error.response?.data || error.message);
  }
}

// ==========================
// استدعاء ChatGPT
// ==========================
async function askChatGPT(userId, userMessage) {
  try {
    // إعداد المحادثة من الكاش
    if (!conversations[userId]) {
      conversations[userId] = [];
    }
    conversations[userId].push({ role: "user", content: userMessage });

    // الطلب إلى OpenAI
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "أنت موظف خدمة عملاء لمتجر eSelect | إي سيلكت. رد باللهجة العمانية باحترافية وكأنك موظف حقيقي. قدم تفاصيل دقيقة عن المنتجات، الأسعار، الشحن، السياسات. إذا كان السؤال عام، جاوب كأنك ChatGPT عادي ولكن مختصر." },
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

    const answer = response.data.choices[0].message.content;

    // حفظ رد ChatGPT في الكاش
    conversations[userId].push({ role: "assistant", content: answer });
    saveConversations();

    return answer;
  } catch (error) {
    console.error("❌ ChatGPT error:", error.response?.data || error.message);
    return "عذرًا، صار خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// ==========================
// Webhook من Ultramsg
// ==========================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.data) {
      return res.sendStatus(400);
    }

    const from = data.data.from;
    const body = data.data.body;

    console.log(`📩 رسالة من ${from}: ${body}`);

    // إرسال الطلب إلى ChatGPT
    const reply = await askChatGPT(from, body);

    // الرد إلى العميل
    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ==========================
// تشغيل السيرفر
// ==========================
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
