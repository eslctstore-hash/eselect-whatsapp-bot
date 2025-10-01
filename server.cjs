// server.cjs

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ==========================
// Environment Variables
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;

const BOT_WHATSAPP_NUMBER = process.env.BOT_WHATSAPP_NUMBER;
const SUPPORT_NUMBER = process.env.SUPPORT_NUMBER;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ==========================
// Memory
// ==========================
const sessions = {};

// ==========================
// WhatsApp Send
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
// Shopify API (Order)
// ==========================
async function fetchOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders/${orderId}.json`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_API_KEY },
    });
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return null;
  }
}

// ==========================
// OpenRouter AI Call
// ==========================
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini", // ممكن تغييره لأي موديل متاح
        messages: [
          { role: "system", content: "انت مساعد ودود باللهجة العمانية، ترد باحترافية وتدعم متجر eSelect." },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://eselect.store",
          "X-Title": "eSelect WhatsApp Bot"
        },
      }
    );
    return res.data.choices[0].message.content;
  } catch (err) {
    console.error("❌ OpenRouter error:", err.response?.data || err.message);
    return "⚠️ النظام مزدحم شوي، جرب مرة ثانية بعد دقائق 🙏";
  }
}

// ==========================
// Handle Incoming Message
// ==========================
async function handleMessage(from, text, msgId) {
  // Prevent bot reply to itself or duplicate msg
  if (from === BOT_WHATSAPP_NUMBER) return;
  if (sessions[from]?.lastMessageId === msgId) return;

  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null, lastMessageId: msgId };
    await sendMessage(from, "👋 هلا وسهلا بك في eSelect | إي سيلكت! كيف أقدر أخدمك اليوم؟");
    return;
  }

  sessions[from].lastMessageId = msgId;

  // إذا العميل طلب موظف
  if (/(موظف|بشر|أحد|خدمة)/i.test(text)) {
    sessions[from].human = true;
    await sendMessage(from, "👨‍💼 تم تحويلك للموظف المختص، يرجى الانتظار لين يرد عليك.");
    return;
  }

  // استعلام عن طلب
  if (/(طلب|طلبي|طلبيتي|اوردري|اوردر)/i.test(text)) {
    const match = text.match(/\d{3,6}/);
    if (match) {
      const orderId = match[0];
      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(from,
          `📦 تفاصيل الطلب #${orderId}:\n👤 ${order.customer?.first_name || "العميل"}\n💵 ${order.total_price} ${order.currency}\n📌 الحالة: ${order.fulfillment_status || "قيد المعالجة"}`
        );
      } else {
        await sendMessage(from, `⚠️ ما حصلت تفاصيل الطلب رقم ${orderId}. تأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ عطنا رقم الطلب علشان أتحقق لك.");
      return;
    }
  }

  // أي رسالة أخرى => للذكاء الاصطناعي
  const reply = await askAI(text);
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
    const msgId = data.data.id || Date.now();
    console.log("📩 رسالة جديدة من", from, ":", text);
    await handleMessage(from, text, msgId);
  }
  res.sendStatus(200);
});

// ==========================
// Start Server
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
