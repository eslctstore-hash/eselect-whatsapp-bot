const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// =======================
// Env Vars
// =======================
const ULTRAMSG_URL = `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/messages`;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SUPPORT_NUMBER = process.env.SUPPORT_NUMBER || "96894682186";

if (!ULTRAMSG_TOKEN) console.warn("⚠️ ULTRAMSG_TOKEN missing!");
if (!SHOPIFY_ACCESS_TOKEN) console.warn("⚠️ SHOPIFY_ACCESS_TOKEN missing!");

// =======================
// In-memory state
// =======================
const conversationCache = new Map(); // user → last reply time
const humanTakeover = new Map();     // user → until timestamp

// Normalize phone (remove +, leading 00)
function normalizePhone(phone) {
  return phone.replace(/^\+/, "").replace(/^00/, "").replace(/\D/g, "");
}

// Send WhatsApp text
async function sendMessage(to, body) {
  try {
    const res = await axios.post(`${ULTRAMSG_URL}/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body
    });
    console.log("✅ Sent:", body);
    return res.data;
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.response?.data || err.message);
  }
}

// Send WhatsApp interactive button (call)
async function sendCallButton(to) {
  try {
    const res = await axios.post(`${ULTRAMSG_URL}/button`, {
      token: ULTRAMSG_TOKEN,
      to,
      body: "📞 للتحدث مباشرة مع موظف خدمة العملاء، اضغط الزر أدناه:",
      buttons: [
        {
          type: "url",
          url: `https://wa.me/${SUPPORT_NUMBER}`,
          text: "اتصال عبر واتساب"
        }
      ]
    });
    console.log("✅ Sent call button");
    return res.data;
  } catch (err) {
    console.error("❌ Ultramsg button error:", err.response?.data || err.message);
  }
}

// Fetch orders from Shopify by phone
async function getOrdersByPhone(phone) {
  try {
    const norm = normalizePhone(phone);
    const variants = [norm, "+" + norm, "00" + norm];

    for (let variant of variants) {
      const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/orders.json?phone=${variant}`;
      const res = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      });
      if (res.data.orders && res.data.orders.length > 0) {
        return res.data.orders;
      }
    }
    return [];
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return [];
  }
}

// =======================
// Webhook
// =======================
app.post("/", async (req, res) => {
  const event = req.body;
  const data = event.data || {};

  const from = data.from;
  const body = (data.body || "").trim();

  console.log("📩 Incoming:", event);

  // Ignore non-message events
  if (event.event_type !== "message_received") {
    console.log("↩️ Ignored event_type:", event.event_type);
    return res.sendStatus(200);
  }

  // Stop replies during human takeover
  const takeoverUntil = humanTakeover.get(from);
  if (takeoverUntil && Date.now() < takeoverUntil) {
    console.log(`⏸️ Ignoring ${from} (human takeover active)`);
    return res.sendStatus(200);
  }

  // Detect request for human
  if (/موظف|شخص|بشر|حقيقي|تكلم/i.test(body)) {
    await sendMessage(from, "✅ تم تحويلك لأحد موظفينا المختصين 👨‍💼.");
    await sendCallButton(from);
    humanTakeover.set(from, Date.now() + 60 * 60 * 1000); // 1h pause
    return res.sendStatus(200);
  }

  // Lookup Shopify orders
  const orders = await getOrdersByPhone(from.replace("@c.us", "").replace(/\D/g, ""));
  if (orders.length > 0) {
    const order = orders[0];
    const status = order.financial_status || "غير محدد";
    const delivery = order.fulfillment_status || "قيد المعالجة";
    const tracking = order.fulfillments?.[0]?.tracking_url || null;

    let msg = `📦 تفاصيل طلبك:\nرقم الطلب: ${order.name}\nالحالة: ${status}\nالتوصيل: ${delivery}`;
    if (tracking) msg += `\n🔗 تتبع شحنتك: ${tracking}`;

    await sendMessage(from, msg);
  } else {
    // fallback
    await sendMessage(from, "👋 أهلاً بك في eSelect | إي سيلكت! كيف أقدر أساعدك اليوم؟");
  }

  res.sendStatus(200);
});

// =======================
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
