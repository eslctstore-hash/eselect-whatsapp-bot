const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();
const { OpenAI } = require("openai");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ================== ENV VARS ==================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 10000;

// ================== INIT OPENAI ==================
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ================== SEND MESSAGE TO WHATSAPP ==================
async function sendMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const data = {
      token: ULTRAMSG_TOKEN,
      to,
      body: message,
    };
    const res = await axios.post(url, data);
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// ================== FETCH ORDER FROM SHOPIFY ==================
async function fetchOrderByNumber(orderNumber) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/orders.json?name=${orderNumber}`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    const orders = response.data.orders;
    if (orders && orders.length > 0) {
      const order = orders[0];
      const status = order.fulfillment_status || "لم يتم شحن الطلب بعد";
      const total = order.total_price + " " + order.currency;
      const date = order.created_at.split("T")[0];
      return `📦 رقم الطلب ${orderNumber}\nالحالة: ${status}\nالمجموع: ${total}\nتاريخ الطلب: ${date}`;
    } else {
      return "⚠️ لم أجد أي طلب بهذا الرقم في النظام.";
    }
  } catch (error) {
    console.error("Shopify Error:", error.message);
    return "⚠️ حدث خطأ أثناء التحقق من الطلب.";
  }
}

// ================== WEBHOOK ROUTE ==================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const messageData = req.body;
    const from = messageData.data?.from;
    const text = messageData.data?.body?.trim();

    if (!from || !text) return;

    console.log("📩 رسالة جديدة من", from, ":", text);

    // التحقق من الأرقام (الطلبات)
    if (/^\d+$/.test(text)) {
      const orderInfo = await fetchOrderByNumber(text);
      await sendMessage(from, orderInfo);
      return;
    }

    // التحقق من استفسارات الطلب
    if (/(طلبي|طلبية|اوردر|طلب|order)/i.test(text)) {
      await sendMessage(from, "ℹ️ يرجى تزويدي برقم الطلب للتحقق من حالته.");
      return;
    }

    // استفسارات عامة (استخدام الذكاء الاصطناعي)
    const prompt = `
      المستخدم كتب: "${text}".
      رد باحترافية ولغة ودية باللهجة العمانية الفصحى القصيرة.
      إذا السؤال عن منتجات eSelect أو المتجر، استخدم معلومات واقعية فقط.
      إذا لم تتوفر معلومات المنتج، قل "حالياً غير متوفر لدينا".
      لا تذكر مواقع خارجية أو أسعار تقديرية.
      استخدم أسلوب محترم وودود.
    `;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت مساعد ذكي لمتجر eSelect الإلكتروني في سلطنة عمان." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const reply = aiResponse.choices[0].message.content || "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.";
    await sendMessage(from, reply);

  } catch (err) {
    console.error("❌ Error:", err);
  }
});

// ================== TEST ROUTE ==================
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp bot running with ChatGPT + Ultramsg + Shopify");
});

// ================== START SERVER ==================
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
