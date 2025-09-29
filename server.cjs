const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const ULTRAMSG_API = `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}`;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SHOPIFY_API = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_API_TOKEN;

// ذاكرة الجلسة
const sessions = {};

// 📨 إرسال رسالة
async function sendMessage(to, body) {
  try {
    await axios.post(`${ULTRAMSG_API}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    });
  } catch (err) {
    console.error("❌ Error sending message:", err.response?.data || err.message);
  }
}

// 📦 جلب منتج من Shopify
async function getProductByName(query) {
  try {
    const res = await axios.get(`${SHOPIFY_API}/products.json?title=${encodeURIComponent(query)}`, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN }
    });
    if (res.data.products.length === 0) return null;
    return res.data.products[0];
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.message);
    return null;
  }
}

// 🧠 معالجة الرسائل
async function handleMessage(from, body) {
  const now = Date.now();

  // تهيئة جلسة العميل
  if (!sessions[from]) {
    sessions[from] = {
      lastGreet: false,
      lastTransfer: 0,
    };
  }

  const session = sessions[from];

  // ⏱️ إذا المحادثة محولة للموظف (إيقاف ساعة)
  if (now - session.lastTransfer < 60 * 60 * 1000) {
    console.log("⏸️ Session paused for", from);
    return;
  }

  // 👋 رسالة الترحيب (مره وحده فقط)
  if (!session.lastGreet) {
    await sendMessage(from, "👋 أهلاً بك في eSelect | إي سيلكت!\nكيف أقدر أساعدك اليوم بخصوص المنتجات أو الطلبات؟");
    session.lastGreet = true;
    return;
  }

  const lower = body.toLowerCase();

  // 👨‍💼 تحويل للموظف
  if (/موظف|شخص|حقيقي|بشر/.test(body)) {
    await sendMessage(from, "📞 تم تحويلك إلى موظف خدمة العملاء، يرجى الانتظار لحين الرد من المختص.");
    session.lastTransfer = now;
    return;
  }

  // 📦 استفسار عن الطلب
  if (/طلب|طلبي/.test(body)) {
    await sendMessage(from, "📦 يرجى تزويدنا برقم الطلب حتى نتمكن من خدمتك بشكل أدق.");
    return;
  }

  // 🚚 استفسار عن التوصيل
  if (/متى توصل|التوصيل|الشحن/.test(body)) {
    await sendMessage(from, "🚚 عادة التوصيل يستغرق من 1 إلى 3 أيام عمل داخل سلطنة عمان.");
    return;
  }

  // 🔎 البحث عن منتج
  if (/كم|سعر|توفر|متوفر|منتج/.test(body)) {
    const product = await getProductByName(body);
    if (product) {
      const price = product.variants[0]?.price || "غير محدد";
      await sendMessage(from, `✅ المنتج متوفر: ${product.title}\n💰 السعر: ${price} ريال عماني`);
    } else {
      await sendMessage(from, "❌ عذرًا المنتج غير متوفر حاليًا.");
    }
    return;
  }

  // ❓ أي شيء آخر
  await sendMessage(from, "❓ لم أتمكن من فهم استفسارك. يرجى الانتظار لحين الرد عليك من الموظف المختص.");
}

// 📩 استقبال Webhook من Ultramsg
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    if (data.event_type === "message_received" && data.data?.fromMe === false) {
      const from = data.data.from;
      const body = data.data.body?.trim() || "";
      if (body) {
        console.log("📩 رسالة جديدة من", from, ":", body);
        await handleMessage(from, body);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// 🚀 بدء السيرفر
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 WhatsApp bot running on port ${PORT}`));
