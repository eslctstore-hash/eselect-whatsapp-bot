// server.cjs
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SUPPORT_NUMBER = process.env.SUPPORT_NUMBER || "96894682186"; // رقم الدعم

// تخزين مؤقت لمنع التكرار
const humanOverride = new Map();

// 🔹 فحص إن العميل يريد موظف حقيقي
function isHumanRequest(text) {
  if (!text) return false;
  const keywords = [
    "موظف",
    "شخص",
    "حد يرد",
    "خدمة العملاء",
    "support",
    "agent",
    "human"
  ];
  return keywords.some((k) => text.includes(k));
}

// 🔹 إرسال رسالة نصية عادية
async function sendMessage(to, body) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    };
    await axios.post(url, payload);
    console.log("✅ Sent:", body);
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.response?.data || err.message);
  }
}

// 🔹 زر 1: مكالمة مباشرة (قد تفتح شاشة الاتصال)
async function sendCallButton(to) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/button`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to,
      body: "اختر للتواصل مع الدعم الفني 👇",
      buttons: JSON.stringify([
        {
          id: "call_support",
          text: "📞 اتصال مباشر",
          url: `https://wa.me/${SUPPORT_NUMBER}?call`
        }
      ])
    };
    await axios.post(url, payload);
    console.log("✅ Call button sent to", to);
  } catch (err) {
    console.error("❌ Ultramsg button error:", err.response?.data || err.message);
  }
}

// 🔹 زر 2: فتح محادثة مع الدعم + تعليمات الاتصال
async function sendChatButton(to) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/button`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to,
      body: "يمكنك الدردشة مباشرة مع خدمة العملاء أو الاتصال بهم:",
      buttons: JSON.stringify([
        {
          id: "chat_support",
          text: "💬 افتح محادثة الدعم",
          url: `https://wa.me/${SUPPORT_NUMBER}`
        }
      ])
    };
    await axios.post(url, payload);
    console.log("✅ Chat button sent to", to);
  } catch (err) {
    console.error("❌ Ultramsg button error:", err.response?.data || err.message);
  }
}

// 🔹 معالجة الرسائل الواردة
app.post("/webhook", async (req, res) => {
  const data = req.body;
  console.log("📩 Incoming:", JSON.stringify(data, null, 2));

  try {
    const msg = data.data;
    if (!msg || msg.fromMe) return res.sendStatus(200);

    const userId = msg.from;
    const text = msg.body ? msg.body.toLowerCase() : "";

    // حالة طلب موظف
    if (isHumanRequest(text)) {
      if (!humanOverride.get(userId)) {
        humanOverride.set(userId, Date.now() + 60 * 60 * 1000); // وقف البوت ساعة

        await sendMessage(userId, "تم تحويلك لأحد موظفينا المختصين 👨‍💼.");
        await sendCallButton(userId); // زر اتصال مباشر
        await sendChatButton(userId); // زر فتح محادثة

        return res.sendStatus(200);
      } else {
        console.log("⏸️ البوت متوقف لهذا العميل (تحويل لموظف).");
        return res.sendStatus(200);
      }
    }

    // إذا لم يطلب موظف → رد تلقائي
    await sendMessage(userId, "هلا وسهلا 👋، كيف أقدر أساعدك اليوم؟");
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error handling incoming:", err.message);
    res.sendStatus(500);
  }
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
