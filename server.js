// server.cjs

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(bodyParser.json());

// ==========================
// متغيرات البيئة من Render
// ==========================
const {
  ULTRAMSG_INSTANCE,
  ULTRAMSG_TOKEN,
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_API_TOKEN,
  OPENAI_API_KEY,
  SUPPORT_NUMBER
} = process.env;

// ==========================
// OpenAI إعداد
// ==========================
const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY }));

// ==========================
// جلسات العملاء
// ==========================
const sessions = {}; // { phone: { human: false, lastSeen: Date, lastOrder: null } }
const customers = {}; // { phone: { isNew: true/false } }

// ==========================
// إرسال رسالة واتساب
// ==========================
async function sendMessage(to, body) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const res = await axios.post(url, { token: ULTRAMSG_TOKEN, to, body });
    console.log("✅ Sent:", res.data);
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// زر الاتصال
async function sendCallButton(to) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/button`;
    const res = await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: "📞 للتحدث مباشرة مع الدعم الفني، اضغط الزر أدناه:",
      buttons: [
        {
          buttonId: "call_support",
          buttonText: { displayText: "📞 اتصل بالدعم" },
          type: "call",
          phoneNumber: SUPPORT_NUMBER,
        },
      ],
    });
    console.log("✅ Call button sent:", res.data);
  } catch (err) {
    console.error("❌ Button error:", err.response?.data || err.message);
  }
}

// ==========================
// Shopify - الطلبات
// ==========================
async function fetchOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders/${orderId}.json`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_API_TOKEN },
    });
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return null;
  }
}

// Shopify - المنتجات
async function searchProduct(query) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/products.json?title=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_API_TOKEN },
    });
    return res.data.products || [];
  } catch (err) {
    console.error("❌ Product search error:", err.response?.data || err.message);
    return [];
  }
}

// ==========================
// ذكاء اصطناعي باللهجة العمانية
// ==========================
async function aiReply(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "انت مساعد افتراضي لمتجر eSelect | إي سيلكت. ترد باللهجة العمانية فقط، ودود ولطيف، تقنع العميل بالشراء وتوضح سياسات الدفع والشحن والضمان والاستبدال والمنتجات الرقمية بدقة.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 250,
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error("❌ AI error:", err.response?.data || err.message);
    return "🙏 صارت مشكلة مؤقتة، جرب تعيد السؤال مرة ثانية.";
  }
}

// ==========================
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  const now = Date.now();

  if (!sessions[from]) {
    sessions[from] = { human: false, lastSeen: now, lastOrder: null };
    customers[from] = { isNew: true };
    await sendMessage(from, "👋 هلا ومرحبا بك في eSelect | إي سيلكت! كيف ممكن أساعدك اليوم؟");
    return;
  } else {
    customers[from].isNew = false;
    sessions[from].lastSeen = now;
  }

  // محادثة موظف
  if (/(موظف|شخص|بشر|خدمة)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      await sendMessage(from, "👨‍💼 تم تحويلك لموظف مختص، يرجى الانتظار للرد عليك من قبل موظفنا.");
      await sendCallButton(from);
    }
    return;
  }

  if (sessions[from].human) {
    const since = now - sessions[from].lastSeen;
    if (since < 30 * 60 * 1000) {
      await sendMessage(from, "⏳ طلبك تحت المتابعة من موظف مختص، يرجى الانتظار.");
      return;
    } else {
      sessions[from].human = false;
    }
  }

  // استفسار عن طلب
  if (/(طلب|طلبي|طلبية|اوردري|اوردر)/i.test(text)) {
    const match = text.match(/\d{3,6}/);
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;
      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(
          from,
          `✅ تفاصيل الطلب #${orderId}:\n👤 ${order.customer?.first_name || "عميل"}\n💵 ${order.total_price} ${order.currency}\n📌 الحالة: ${order.fulfillment_status || "قيد المعالجة"}`
        );
        if (order.fulfillments?.length > 0 && order.fulfillments[0].tracking_url) {
          await sendMessage(from, `🚚 رابط التتبع: ${order.fulfillments[0].tracking_url}`);
        }
      } else {
        await sendMessage(from, `⚠️ ما حصلت تفاصيل الطلب رقم ${orderId}. تأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "📌 عطنا رقم الطلب عشان نتحقق لك من حالته.");
      return;
    }
  }

  // استفسار عن منتج
  if (/منتج|منتجات|سلعة|بضاعة/i.test(text)) {
    const products = await searchProduct(text);
    if (products.length > 0) {
      const p = products[0];
      await sendMessage(from, `✅ المنتج متوفر: ${p.title}\n💵 السعر: ${p.variants[0].price} ر.ع\n🔗 https://${SHOPIFY_STORE_DOMAIN}/products/${p.handle}`);
    } else {
      await sendMessage(from, "🙏 هذا المنتج غير متوفر حالياً. لكن عندنا منتجات ثانية ممكن تعجبك.");
    }
    return;
  }

  // رد افتراضي بالذكاء الاصطناعي
  const reply = await aiReply(text);
  await sendMessage(from, reply);
}

// ==========================
// Webhook
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
