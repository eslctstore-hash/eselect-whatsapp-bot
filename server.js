// 📌 استدعاء المكتبات
import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// 📌 متغيرات البيئة (من Render Dashboard أو ملف .env)
const PORT = process.env.PORT || 10000;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // رابط المتجر
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN; // API Access Token
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ================
// 🔎 كشف النية Intent Detection
// ================
function detectIntent(message) {
  const text = message.toLowerCase();

  if (text.includes("طلب") || text.includes("رقم الطلب")) return "order_status";
  if (text.includes("منتج") || text.includes("سعر") || text.includes("كم")) return "product_info";
  if (text.includes("سياسة") || text.includes("ارجاع") || text.includes("استبدال")) return "policy";
  if (text.includes("دفع") || text.includes("المبلغ")) return "payment_status";

  return "general";
}

// ================
// 🛒 دوال لجلب البيانات من Shopify
// ================
async function getShopifyProducts() {
  try {
    const res = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-10/products.json?limit=5`,
      {
        headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN },
      }
    );
    return res.data.products || [];
  } catch (err) {
    console.error("❌ Shopify products error:", err.response?.data || err.message);
    return [];
  }
}

async function getShopifyPolicies() {
  return `
1. 📜 الإرجاع: خلال 14 يوم مع الشروط.
2. 🚚 الشحن: توصيل سريع وآمن.
3. 🔒 الخصوصية: حماية بيانات العملاء.`;
}

async function getOrderFromShopify(orderId) {
  try {
    const res = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${orderId}.json`,
      {
        headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN },
      }
    );
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify order error:", err.response?.data || err.message);
    return null;
  }
}

async function getPaymentStatus(orderId) {
  const order = await getOrderFromShopify(orderId);
  if (!order) return "لم أجد تفاصيل الطلب.";
  return `💳 حالة الدفع: ${order.financial_status}, المبلغ الكلي: ${order.total_price} ${order.currency}`;
}

// ================
// 🤖 بناء السياق قبل إرسال لـ ChatGPT
// ================
async function buildContext(intent, message, customerId) {
  let context = "أنت موظف خدمة عملاء لمتجر eSelect | إي سيلكت. رد باللهجة العمانية الودودة واحترافية.";

  if (intent === "order_status") {
    context += "\nالعميل يسأل عن حالة طلب.";
  }
  if (intent === "product_info") {
    const products = await getShopifyProducts();
    context += `\n🛒 منتجات مختصرة:\n${products
      .map((p) => `- ${p.title} بسعر ${p.variants[0].price} OMR`)
      .join("\n")}`;
  }
  if (intent === "policy") {
    const policies = await getShopifyPolicies();
    context += `\n📜 سياسات المتجر:\n${policies}`;
  }
  if (intent === "payment_status") {
    context += "\nالعميل يسأل عن حالة الدفع أو المبلغ.";
  }
  if (intent === "general") {
    context += `
العميل يريد دردشة أو سؤال عام. جاوب بشكل ودود لكن لا تخرج كثير عن دور خدمة العملاء. 
إذا سأل عن السياسة أو الدين أو موضوع بعيد قول له: "أنا مختص فقط بخدمة العملاء والمتجر".`;
  }

  return context;
}

// ================
// 🤖 طلب من ChatGPT
// ================
async function askChatGPT(userMessage, intent, customerId) {
  const context = await buildContext(intent, userMessage, customerId);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: context },
      { role: "user", content: userMessage },
    ],
    max_tokens: 400,
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}

// ================
// 📩 Webhook استقبال رسائل WhatsApp
// ================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const msg = body.data?.body || "";
    const from = body.data?.from || "unknown";

    console.log(`📩 رسالة من ${from}: ${msg}`);

    // 1. كشف النية
    const intent = detectIntent(msg);

    // 2. الرد المناسب
    const reply = await askChatGPT(msg, intent, from);

    // 3. إرسال الرد عبر API الواتساب
    await axios.post("https://api.ultramsg.com/YOUR_INSTANCE/messages/chat", {
      token: process.env.WHATSAPP_TOKEN,
      to: from.replace("@c.us", ""),
      body: reply,
    });

    console.log(`✅ أُرسلت رسالة إلى ${from}: ${reply}`);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ================
// 🚀 تشغيل السيرفر
// ================
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
