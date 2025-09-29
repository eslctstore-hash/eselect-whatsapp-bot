// server.cjs

import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// ==========================
// إعداد المتغيرات
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // مثال: eselect.store
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD;

const SUPPORT_NUMBER = "96894682186"; // رقم الدعم (واتساب)

// ==========================
// تخزين الجلسات
// ==========================
const sessions = {};

// ==========================
// إرسال رسالة واتساب
// ==========================
async function sendMessage(to, body) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const res = await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    });
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// ==========================
// جلب الطلب من Shopify
// ==========================
async function fetchOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_API_KEY}:${SHOPIFY_PASSWORD}@${SHOPIFY_STORE}/admin/api/2025-01/orders/${orderId}.json`;
    const res = await axios.get(url);
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return null;
  }
}

// ==========================
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null };
    await sendMessage(from, "👋 أهلاً بك في eSelect | إي سيلكت!\nكيف أقدر أساعدك اليوم بخصوص المنتجات أو الطلبات؟");
    return;
  }

  // إذا العميل طلب محادثة موظف
  if (/(موظف|شخص|احد|بشر|الحقيقي|خدمة)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      await sendMessage(from, "👨‍💼 تم تحويلك إلى أحد موظفينا المختصين، يرجى الانتظار لحين الرد عليك من قبل الموظف.");
    }
    return;
  }

  // 🔹 التحقق من الاستفسار عن طلب
  if (/(طلب|طلبي|طلبيتي|طلبتي|طلبياتي|طلبية|طلباتي|اوردري|اوردر|اوردراتي|أوردري|أوردراتي)/i.test(text)) {
    const match = text.match(/\d{3,6}/); // رقم من 3 إلى 6 خانات
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      await sendMessage(from, `📦 تم استلام رقم الطلب: ${orderId}\nيرجى الانتظار، وسيتم التحقق من حالة طلبك.`);

      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(
          from,
          `✅ تفاصيل الطلب #${orderId}:\n👤 العميل: ${order.customer?.first_name || "غير معروف"}\n💵 الإجمالي: ${order.total_price} ${order.currency}\n📌 الحالة: ${order.fulfillment_status || "قيد المعالجة"}`
        );
      } else {
        await sendMessage(from, `⚠️ لم أتمكن من العثور على تفاصيل الطلب رقم ${orderId}. يرجى التأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ يرجى تزويدي برقم الطلب للتحقق.");
      return;
    }
  }

  // 🔹 الردود العامة (إذا لم يفهم)
  if (!sessions[from].human) {
    await sendMessage(from, "⚠️ عذرًا، لم أفهم استفسارك.\nيرجى توضيح طلبك بشكل أدق (مثل: طلبيتي 1139).");
  }
}

// ==========================
// Webhook من Ultramsg
// ==========================
app.post("/webhook", async (req, res) => {
  const data = req.body;
  if (data?.data?.from && data?.data?.body) {
    const from = data.data.from.replace("@c.us", "");
    const text = data.data.body.trim();
    console.log("📩 رسالة جديدة من", from, ":", text);
    await handleMessage(from, text);
  }
  res.sendStatus(200);
});

// ==========================
// تشغيل السيرفر
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
