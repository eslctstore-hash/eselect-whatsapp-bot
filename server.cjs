// server.cjs
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ==========================
// 📌 إعدادات البيئة
// ==========================
const {
  ULTRAMSG_INSTANCE,
  ULTRAMSG_TOKEN,
  SHOPIFY_STORE,
  SHOPIFY_ACCESS_TOKEN,
  OPENAI_API_KEY,
  SUPPORT_PHONE,
  SUPPORT_EMAIL,
  PORT = 10000,
} = process.env;

// ==========================
// 📌 متغيرات داخلية
// ==========================
let humanTakeover = {}; // لمنع البوت من الرد وقت تدخل الموظف
let conversations = {}; // حفظ المحادثات

// ==========================
// 📌 إرسال رسالة عبر Ultramsg
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
    console.error("❌ Ultramsg send error:", err.message);
  }
}

// ==========================
// 📌 جلب بيانات الطلبات من Shopify
// ==========================
async function fetchOrdersByPhone(phone) {
  try {
    const formatted = phone.replace(/^(\+|00)/, "").replace(/^968/, ""); // إزالة +968 أو 00968
    const url = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json?status=any&fields=id,phone,email,total_price,financial_status,fulfillment_status,line_items,shipping_address,note&phone=${formatted}`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });
    return res.data.orders || [];
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return [];
  }
}

// ==========================
// 📌 معالجة الرسائل الواردة
// ==========================
async function handleMessage(from, body) {
  // تجاهل إذا الموظف مستلم المحادثة
  if (humanTakeover[from] && Date.now() - humanTakeover[from] < 3600000) {
    console.log(`⏸️ Ignoring ${from} (human takeover active)`);
    return;
  }

  // حفظ المحادثة
  if (!conversations[from]) conversations[from] = [];
  conversations[from].push({ from, body, time: new Date().toISOString() });

  const normalized = body.trim().toLowerCase();

  // 🔹 العميل يطلب موظف
  if (
    normalized.includes("موظف") ||
    normalized.includes("شخص") ||
    normalized.includes("بشري") ||
    normalized.includes("مختص")
  ) {
    await sendMessage(
      from,
      "👨‍💼 تم تحويلك إلى أحد موظفينا المختصين، يرجى الانتظار حتى يتم الرد عليك."
    );
    humanTakeover[from] = Date.now(); // تفعيل takeover ساعة كاملة
    return;
  }

  // 🔹 تحقق من الطلبات برقم الهاتف
  const orders = await fetchOrdersByPhone(from);
  if (orders.length > 0) {
    let reply = "📦 وجدنا طلبك في المتجر:\n\n";
    orders.forEach((order) => {
      reply += `🛒 رقم الطلب: ${order.id}\n`;
      reply += `💰 المبلغ: ${order.total_price} ر.ع\n`;
      reply += `📌 حالة الدفع: ${order.financial_status || "غير محدد"}\n`;
      reply += `🚚 حالة الشحن: ${order.fulfillment_status || "قيد التحضير"}\n`;

      if (order.line_items) {
        reply += "🛍️ المنتجات:\n";
        order.line_items.forEach((item) => {
          reply += `   - ${item.name} × ${item.quantity}\n`;
        });
      }

      if (order.note) reply += `📝 ملاحظات: ${order.note}\n`;
      if (order.shipping_address) {
        reply += `📍 العنوان: ${order.shipping_address.address1 || ""}\n`;
      }

      reply += "\n---\n";
    });
    await sendMessage(from, reply);
    return;
  } else {
    // زبون جديد أو الرقم غير موجود
    await sendMessage(
      from,
      "👋 أهلاً بك في eSelect | إي سيلكت! يمكنك الاستفسار عن منتجاتنا وطرق الدفع والشحن."
    );
  }
}

// ==========================
// 📌 Webhook من Ultramsg
// ==========================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("📩 Incoming:", JSON.stringify(event, null, 2));

    if (event.event_type === "message_received") {
      const from = event.data.from.replace("@c.us", "");
      const body = event.data.body;
      await handleMessage(from, body);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ==========================
// 📌 تشغيل السيرفر
// ==========================
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
  console.log(`🔑 Using Shopify Store: ${SHOPIFY_STORE}`);
  if (SHOPIFY_ACCESS_TOKEN)
    console.log(`🔑 Shopify Token: ${SHOPIFY_ACCESS_TOKEN.slice(0, 6)}...`);
});
