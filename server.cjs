const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// =============== المتغيرات ===============
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "96894682186"; // رقم الدعم الافتراضي

// =============== ذاكرة مؤقتة ===============
const conversationCache = new Map();
const humanOverride = new Map(); // userId => until timestamp

// =============== وظائف مساعدة ===============
function normalizePhone(phone) {
  return phone.replace(/^968/, "").replace(/\D/g, "");
}

function isHumanRequest(text) {
  const keywords = [
    /موظف/i,
    /شخص حقيقي/i,
    /اكلم/i,
    /خدمة العملاء/i,
    /بشر/i,
    /اتواصل/i,
    /تكلم مع/i
  ];
  return keywords.some(rx => rx.test(text));
}

function isInHumanOverride(userId) {
  const until = humanOverride.get(userId);
  return until && Date.now() < until;
}

// جلب الطلبات من Shopify
async function getCustomerOrdersByPhone(phone) {
  try {
    const cleanPhone = normalizePhone(phone);
    const url = `${SHOPIFY_STORE_URL}/admin/api/2023-10/orders.json?status=any&fields=id,phone,order_number,financial_status,fulfillment_status,total_price,note`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    });
    const orders = res.data.orders || [];
    return orders.filter(o => normalizePhone(o.phone || "") === cleanPhone);
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return [];
  }
}

// إرسال رسالة عبر Ultramsg
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: message
    });
    console.log("✅ Sent:", message.slice(0, 50));
  } catch (err) {
    console.error("❌ Ultramsg error:", err.response?.data || err.message);
  }
}

// إرسال مكالمة عبر واتساب (Ultramsg يدعم نوع call)
async function sendWhatsAppCall(to) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/call`;
    const res = await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: "مكالمة من eSelect | إي سيلكت"
    });
    console.log("📞 Initiated WhatsApp call to", to, res.data);
    return true;
  } catch (err) {
    console.error("❌ Ultramsg call error:", err.response?.data || err.message);
    return false;
  }
}

// =============== منطق الرد ===============
async function handleCustomerQuery(userId, phone, text) {
  // إذا في وضع موظف → تجاهل
  if (isInHumanOverride(userId)) {
    console.log(`⏸️ Ignoring ${userId} (human takeover active)`);
    return null;
  }

  // إذا طلب موظف
  if (isHumanRequest(text)) {
    if (!humanOverride.get(userId)) {
      humanOverride.set(userId, Date.now() + 60 * 60 * 1000); // ساعة

      // حاول المكالمة أولاً
      const callOk = await sendWhatsAppCall(`968${SUPPORT_PHONE}`);
      if (callOk) {
        return `تم تحويلك لأحد موظفينا المختصين 👨‍💼.\n📞 جاري الاتصال بالدعم الفني...`;
      } else {
        return `تم تحويلك لأحد موظفينا المختصين 👨‍💼.\n📞 يمكنك الاتصال مباشرة عبر الرابط: https://wa.me/${SUPPORT_PHONE}`;
      }
    }
    return null; // لا يكرر
  }

  // تحقق من وجود طلبات
  const orders = await getCustomerOrdersByPhone(phone);
  if (orders.length > 0) {
    const order = orders[0];
    if (/طلب|order|حالة/i.test(text)) {
      return `🔎 تفاصيل طلبك #${order.order_number}:\n- الحالة المالية: ${order.financial_status}\n- حالة التوصيل: ${order.fulfillment_status || "قيد المعالجة"}\n- المبلغ: ${order.total_price} OMR\n- ملاحظات: ${order.note || "لا توجد"}\n\nشكراً لتسوقك معنا 🙏`;
    }
  } else {
    return `👋 أهلاً بك في eSelect | إي سيلكت! يبدو أنك زبون جديد 🌟.\n\nطرق الدفع: 💳 بطاقة / 💵 عند الاستلام / 🔗 تحويل مصرفي\nالتوصيل 🚚 خلال 2-4 أيام.\n\nهل ترغب أن أرسل لك بعض المنتجات المميزة؟`;
  }

  return "هل ترغب أن أساعدك بشيء آخر بخصوص طلبك أو منتجاتنا؟";
}

// =============== Webhook ===============
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const event = body.event_type || body.eventType;
    if (event !== "message_received") return res.sendStatus(200);

    const msg = body.data || body;
    const userId = msg.from;
    const phone = msg.from.replace(/@c\.us$/, "");
    const text = msg.body?.trim();

    if (!text) return res.sendStatus(200);

    const reply = await handleCustomerQuery(userId, phone, text);
    if (reply) {
      await sendWhatsAppMessage(userId, reply);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// =============== تشغيل السيرفر ===============
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
