// server.cjs

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ==========================
// متغيرات البيئة
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // مثال: eselect.store
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD;

const BOT_NUMBER = process.env.BOT_NUMBER; // رقم البوت (نفس رقم الدعم)

// ==========================
// تخزين الجلسات والردود
// ==========================
const sessions = {};
const lastReply = {}; // لتفادي تكرار الرد

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
  // تجاهل رسائل البوت نفسه
  if (from === BOT_NUMBER) return;

  // إنشاء جلسة للعميل إذا ما موجودة
  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null };
  }

  let replyText = null;

  // إذا العميل طلب موظف بشري
  if (/(موظف|بشر|شخص|الحقيقي|خدمة)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      replyText =
        "👨‍💼 تم تحويلك إلى أحد موظفينا المختصين.\n📞 يرجى الانتظار لحين الرد عليك من قبل الموظف.";
    }
  }

  // إذا العميل استفسر عن طلب
  else if (
    /(طلب|طلبي|طلبيتي|طلبتي|طلبية|طلبياتي|اوردري|اوردر|أوردراتي)/i.test(text)
  ) {
    const match = text.match(/\d{3,6}/); // البحث عن رقم طلب
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      replyText = `📦 تم استلام رقم الطلب: ${orderId}\n⏳ يرجى الانتظار، وسيتم التحقق من حالة طلبك.`;

      const order = await fetchOrder(orderId);
      if (order) {
        replyText = `✅ تفاصيل الطلب #${orderId}:\n👤 العميل: ${
          order.customer?.first_name || "غير معروف"
        }\n💵 الإجمالي: ${order.total_price} ${order.currency}\n📌 الحالة: ${
          order.fulfillment_status || "قيد المعالجة"
        }`;
      } else {
        replyText = `⚠️ لم أتمكن من العثور على تفاصيل الطلب رقم ${orderId}. يرجى التأكد من الرقم.`;
      }
    } else {
      replyText = "ℹ️ يرجى تزويدي برقم الطلب للتحقق.";
    }
  }

  // الرد الترحيبي الافتراضي
  else {
    replyText =
      "👋 حيّاك الله في *eSelect | إي سيلكت*!\nكيف ممكن أساعدك اليوم بخصوص المنتجات أو الطلبات؟";
  }

  // ✅ منع تكرار نفس الرد
  if (replyText && lastReply[from] !== replyText) {
    lastReply[from] = replyText;
    await sendMessage(from, replyText);
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
