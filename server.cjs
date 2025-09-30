// server.cjs

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ==========================
// متغيرات البيئة
// ==========================
const {
  ULTRAMSG_INSTANCE,
  ULTRAMSG_TOKEN,
  SHOPIFY_STORE,
  SHOPIFY_API_KEY,
  SHOPIFY_PASSWORD,
  OPENAI_API_KEY,
  SUPPORT_NUMBER,
} = process.env;

// ==========================
// الذاكرة للجلسات
// ==========================
const sessions = {};

// ==========================
// إرسال رسالة واتساب عبر Ultramsg
// ==========================
async function sendMessage(to, body, buttons) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    };
    if (buttons) payload.buttons = buttons;
    const res = await axios.post(url, payload);
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// ==========================
// التحقق من الطلبات من Shopify
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
// البحث عن المنتجات في Shopify
// ==========================
async function searchProduct(query) {
  try {
    const url = `https://${SHOPIFY_API_KEY}:${SHOPIFY_PASSWORD}@${SHOPIFY_STORE}/admin/api/2025-01/products.json?title=${encodeURIComponent(
      query
    )}`;
    const res = await axios.get(url);
    return res.data.products || [];
  } catch (err) {
    console.error("❌ Shopify product error:", err.response?.data || err.message);
    return [];
  }
}

// ==========================
// OpenAI للرد الذكي
// ==========================
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "أنت مساعد ودود يرد باللهجة العمانية لمتجر eSelect." }, { role: "user", content: prompt }],
        max_tokens: 500,
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ OpenAI error:", err.response?.data || err.message);
    return "عذرًا، صار خلل مؤقت. جرب مرة ثانية.";
  }
}

// ==========================
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null, lastContact: null };
    await sendMessage(
      from,
      "👋 حيّاك الله في eSelect | إي سيلكت! كيف ممكن أساعدك اليوم بخصوص المنتجات أو الطلبات؟"
    );
    return;
  }

  // 🔹 طلب محادثة موظف
  if (/(موظف|بشر|خدمة|شخص|حد)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      sessions[from].lastContact = Date.now();
      await sendMessage(from, "📞 تم تحويلك لموظف مختص، يرجى الانتظار لحين الرد عليك.");
      await sendMessage(from, "للتواصل مباشرة مع الدعم:", [
        { id: "call", text: "اتصال عبر الواتساب", url: `https://wa.me/${SUPPORT_NUMBER}` },
      ]);
    }
    return;
  }

  // 🔹 استفسار عن طلب
  if (/(طلب|طلبي|طلبية|اوردري|اوردر)/i.test(text)) {
    const match = text.match(/\d{3,6}/);
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      await sendMessage(from, `📦 جاري التحقق من تفاصيل الطلب رقم ${orderId}...`);

      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(
          from,
          `✅ تفاصيل الطلب #${orderId}:\n👤 العميل: ${
            order.customer?.first_name || "غير معروف"
          }\n💵 المبلغ: ${order.total_price} ${order.currency}\n📌 الحالة: ${
            order.fulfillment_status || "قيد المعالجة"
          }\n🚚 الناقل: ${order.shipping_lines?.[0]?.title || "غير محدد"}\n🔗 ${
            order.shipping_lines?.[0]?.tracking_urls?.[0] || "لا يوجد رابط تتبع"
          }`
        );
      } else {
        await sendMessage(from, `⚠️ ما حصلت أي بيانات عن الطلب ${orderId}. تأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ أرسل رقم الطلب عشان أتحقق لك.");
      return;
    }
  }

  // 🔹 البحث عن منتجات
  if (/منتج|منتجات|سلعة|قطع|شي|item/i.test(text)) {
    const products = await searchProduct(text);
    if (products.length > 0) {
      const first = products[0];
      await sendMessage(
        from,
        `✅ متوفر عندنا: ${first.title}\n💵 السعر: ${first.variants[0].price} ${first.variants[0].currency || "OMR"}`
      );
    } else {
      await sendMessage(from, "🚫 هذا المنتج غير متوفر حالياً. تقدر تشوف العروض في قسم 🔥 العروض الساخنة.");
    }
    return;
  }

  // 🔹 رد افتراضي ذكي (OpenAI)
  const aiReply = await askAI(text);
  await sendMessage(from, aiReply);
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

    const lastContact = sessions[from]?.lastContact;
    if (lastContact && Date.now() - lastContact < 30 * 60 * 1000) {
      await sendMessage(from, "👨‍💼 الموظف المختص بيرد عليك قريباً، يرجى الانتظار.");
    } else {
      await handleMessage(from, text);
    }
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
