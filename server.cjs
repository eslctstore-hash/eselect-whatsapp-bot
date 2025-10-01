// server.cjs
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ==================== ENV VARIABLES ====================
const PORT = process.env.PORT || 3000;

// OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Ultramsg
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const BOT_WHATSAPP_NUMBER = process.env.BOT_WHATSAPP_NUMBER;

// Shopify
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD; // Admin API Access Token
// ========================================================

// Send WhatsApp message via Ultramsg
async function sendMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to: to,
      body: message,
    };
    await axios.post(url, payload);
    console.log(`✅ Sent via Ultramsg to ${to}: ${message}`);
  } catch (err) {
    console.error("❌ Error sending message:", err.message);
  }
}

// Get order info from Shopify
async function getOrderInfo(orderNumber) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders.json?name=${orderNumber}`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_PASSWORD,
        "Content-Type": "application/json",
      },
    });

    if (response.data.orders && response.data.orders.length > 0) {
      const order = response.data.orders[0];
      let tracking = "ما فيه معلومات تتبع حالياً";

      if (order.fulfillments && order.fulfillments.length > 0) {
        const f = order.fulfillments[0];
        if (f.tracking_number && f.tracking_url) {
          tracking = `رقم التتبع: ${f.tracking_number}\nرابط: ${f.tracking_url}`;
        }
      }

      return `📦 تفاصيل طلبك #${order.name}\nالحالة: ${order.financial_status} / ${order.fulfillment_status}\n${tracking}`;
    } else {
      return `❌ ما حصلت أي طلب بهذا الرقم (${orderNumber}).`;
    }
  } catch (err) {
    console.error("❌ Shopify API error:", err.response?.data || err.message);
    return "⚠️ صار خطأ يوم حاولت أجيب بيانات الطلب.";
  }
}

// AI response handler using OpenRouter
async function getAIResponse(userMessage) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini", // تقدر تغير الموديل من OpenRouter (مثلا mistral, llama, claude...)
        messages: [
          {
            role: "system",
            content: `انت مساعد ودود ولطيف باللهجة العمانية، ترد على استفسارات العملاء حول متجر eSelect.`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("❌ OpenRouter error:", err.response?.data || err.message);
    return "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.";
  }
}

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    const from = data.from;
    const message = data.body?.trim();

    console.log(`📩 رسالة جديدة من ${from} : ${message}`);

    // Check if it's an order number (digits only)
    if (/^\d+$/.test(message)) {
      const orderInfo = await getOrderInfo(message);
      await sendMessage(from, orderInfo);
    } else {
      const aiReply = await getAIResponse(message);
      await sendMessage(from, aiReply);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
