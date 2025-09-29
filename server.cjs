// server.cjs
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ADMIN_API = process.env.SHOPIFY_ADMIN_API;
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "96894682186";

async function sendMessage(to, text) {
  try {
    if (!text || text.trim() === "") return;

    // تقسيم الرسائل الطويلة
    const chunkSize = 2000;
    for (let i = 0; i < text.length; i += chunkSize) {
      const part = text.substring(i, i + chunkSize);
      await axios.post(
        `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`,
        { token: ULTRAMSG_TOKEN, to, body: part }
      );
    }
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.response?.data || err.message);
  }
}

async function getCustomerOrdersByPhone(phone) {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_API) {
    console.error("❌ Shopify domain or API key not configured!");
    return [];
  }

  try {
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

async function handleMessage(from, body) {
  body = body.trim();

  if (/موظف|شخص|بشر|حد يرد/i.test(body)) {
    await sendMessage(
      from,
      "✅ تم تحويلك إلى أحد موظفينا المختصين 👨‍💼، يرجى الانتظار لحين الرد عليك."
    );
    return;
  }

  const orders = await getCustomerOrdersByPhone(from.replace("@c.us", ""));
  if (orders.length > 0) {
    const order = orders[0];
    let reply = `🛒 رقم الطلب: #${order.order_number}\n`;
    reply += `💰 المبلغ: ${order.current_total_price} ر.ع\n`;
    reply += `📌 حالة الدفع: ${order.financial_status}\n`;
    reply += `🚚 حالة الشحن: ${order.fulfillment_status || "قيد المعالجة"}\n\n`;
    reply += `🔗 تتبع طلبك: ${order.order_status_url}`;

    await sendMessage(from, reply);
  } else {
    await sendMessage(
      from,
      "👋 أهلاً بك في eSelect | إي سيلكت!\nكيف أقدر أساعدك اليوم بخصوص المنتجات أو الطلبات؟"
    );
  }
}

app.post("/webhook", async (req, res) => {
  const event = req.body;
  console.log("📩 Incoming:", JSON.stringify(event, null, 2));

  if (event.event_type === "message_received") {
    const msg = event.data;
    await handleMessage(msg.from, msg.body);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp bot running on port ${PORT}`)
);
