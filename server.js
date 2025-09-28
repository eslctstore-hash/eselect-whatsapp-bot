// server.js
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

// ✅ ضع بياناتك في ملف .env
// ULTRAMSG_INSTANCE_ID=xxxx
// ULTRAMSG_TOKEN=xxxx
// OPENAI_API_KEY=xxxx

const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ✅ Webhook من UltraMsg
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.data || !data.data.message) {
      return res.sendStatus(200);
    }

    const from = data.data.from; // رقم العميل
    const message = data.data.message; // نص العميل

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✨ إرسال الرسالة لـ ChatGPT
    const gptReply = await askChatGPT(message);

    // ✨ الرد على العميل عبر UltraMsg
    await sendWhatsAppMessage(from, gptReply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});

// ✅ دالة طلب من ChatGPT
async function askChatGPT(userMessage) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
أنت مساعد دردشة لمتجر eSelect | إي سيلكت. 
قدم إجابات احترافية وودية باللهجة العمانية أو العربية الفصحى حسب السياق.
اعتمد على سياسات المتجر، أقسامه، طرق الدفع، الشحن، والاسترجاع.
قدّم أسعار المنتجات إن توفرت لديك في قاعدة البيانات أو اطلب من العميل زيارة الموقع https://eselect.store.
`
          },
          { role: "user", content: userMessage }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("❌ Error from ChatGPT:", err.response?.data || err.message);
    return "عذراً، حدث خطأ في النظام. حاول مرة أخرى لاحقاً 🙏";
  }
}

// ✅ إرسال رسالة عبر UltraMsg
async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: text,
    });
    console.log(`✅ أُرسلت رسالة إلى ${to}: ${text}`);
  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
