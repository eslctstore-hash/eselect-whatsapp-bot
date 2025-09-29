// server.cjs
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ======================
// المتغيرات من البيئة
// ======================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // مثال: eselect-store.myshopify.com
const SHOPIFY_ADMIN_API = process.env.SHOPIFY_ADMIN_API; // API Access Token
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "96894682186";

// ======================
// دوال مساعدة
// ======================

// إرسال رسالة عبر Ultramsg
async function sendMessage(to, text) {
  try {
    const res = await axios.post(
      `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`,
      {
        token: ULTRAMSG_TOKEN,
        to,
        body: text,
      }
    );
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.response?.data || err.message);
  }
}

// تقسيم الرسائل الطويلة
async function sendLongMessage(to, text) {
  const chunkSize = 2000;
  for (let i = 0; i < text.length; i += chunkSize) {
    const part = text.substring(i, i + chunkSize);
    await sendMessage(to, part);
  }
}

// جلب الطلبات من Shopify بناءً على رقم الهاتف
async function getCustomerOrdersByPhone(phone) {
  try {
    // إزالة الرموز + أو 00 أو رمز الدولة للمطابقة
    const cleanPhone = phone.replace(/^(\+|00)/, "").replace(/^968/, "");
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/orders.json?status=any&fields=id,order_number,current_total_price,financial_status,fulfillment_status,phone,customer,order_status_url`;

    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_API,
        "Content-Type": "application/json",
      },
    });

    const orders = res.data.orders || [];
    return orders.filter((o) => {
      if (!o.phone && !o.customer?.phone) return false;
      const phones = [
        (o.phone || "").replace(/\D/g, ""),
        (o.customer?.phone || "").replace(/\D/g, ""),
      ];
      return phones.some((p) =>
        p.endsWith(cleanPhone) || cleanPhone.endsWith(p)
      );
    });
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return [];
  }
}

// معالجة الرسائل
async function handleMessage(from, body) {
  body = body.trim();

  // طلب محادثة مع موظف
  if (/موظف|شخص|بشر|حد يرد/i.test(body)) {
    await sendMessage(
      from,
      "تم تحويلك إلى أحد موظفينا المختصين 👨‍💼، يرجى الانتظار لحين الرد عليك."
    );
    return;
  }

  // تحقق من الطلبات
  const orders = await getCustomerOrdersByPhone(from.replace("@c.us", ""));
  if (orders.length > 0) {
    const order = orders[0]; // نعرض آخر طلب
    let reply = `🛒 رقم الطلب: #${order.order_number}\n`;
    reply += `💰 المبلغ: ${order.current_total_price} ر.ع\n`;
    reply += `📌 حالة الدفع: ${order.financial_status}\n`;
    reply += `🚚 حالة الشحن: ${order.fulfillment_status || "قيد المعالجة"}\n\n`;
    reply += `🔗 تتبع طلبك: ${order.order_status_url}`;

    await sendLongMessage(from, reply);
  } else {
    // إذا لم يتم العثور على طلب
    await sendMessage(
      from,
      "👋 أهلاً بك في eSelect | إي سيلكت!\nكيف أقدر أساعدك اليوم بخصوص المنتجات أو الطلبات؟"
    );
  }
}

// ======================
// Webhook من Ultramsg
// ======================
app.post("/webhook", async (req, res) => {
  const event = req.body;

  console.log("📩 Incoming:", JSON.stringify(event, null, 2));

  if (event.event_type === "message_received") {
    const msg = event.data;
    const from = msg.from;
    const body = msg.body;

    await handleMessage(from, body);
  }

  res.sendStatus(200);
});

// ======================
// تشغيل السيرفر
// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp bot running on port ${PORT}`)
);
