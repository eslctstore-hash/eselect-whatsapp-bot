const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

// =============================
// 🛠️ المتغيرات البيئية
// =============================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

// =============================
// 🗄️ كاش للمنتجات + السياسات
// =============================
let cachedProducts = null;
let lastFetchProducts = 0;
const PRODUCTS_TTL = 6 * 60 * 60 * 1000; // 6 ساعات

let cachedPolicies = null;
let lastFetchPolicies = 0;
const POLICIES_TTL = 24 * 60 * 60 * 1000; // يوم كامل

// =============================
// 💾 تحميل المحادثات من ملف JSON
// =============================
const conversationsFile = "conversations.json";
let conversationCache = {};

function loadConversations() {
  try {
    if (fs.existsSync(conversationsFile)) {
      const data = fs.readFileSync(conversationsFile, "utf-8");
      conversationCache = JSON.parse(data);
      console.log("📂 تم تحميل المحادثات من JSON");
    }
  } catch (err) {
    console.error("❌ خطأ في قراءة ملف المحادثات:", err.message);
    conversationCache = {};
  }
}

function saveConversations() {
  try {
    fs.writeFileSync(conversationsFile, JSON.stringify(conversationCache, null, 2));
    console.log("💾 تم حفظ المحادثات في JSON");
  } catch (err) {
    console.error("❌ خطأ في حفظ ملف المحادثات:", err.message);
  }
}

// =============================
// 📌 استدعاء ChatGPT
// =============================
async function askChatGPT(userMessage, context = "", history = []) {
  try {
    const prompt = `
أنت موظف خدمة عملاء لمتجر eSelect | إي سيلكت.
- رد باللهجة العمانية باحترافية.
- اعتمد على بيانات المتجر (المنتجات، الأسعار، السياسات).
- خذ بعين الاعتبار سجل المحادثة السابق.
- إذا ما عندك معلومة دقيقة، قدم رد عام لكن مهني.

سجل المحادثة السابقة:
${history.map(h => `👤: ${h.q}\n🤖: ${h.a}`).join("\n")}

سؤال العميل: ${userMessage}
المعطيات من المتجر:
${context}
`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ ChatGPT error:", err.response?.data || err.message);
    return "عذرًا، صار خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// =============================
// 📌 جلب المنتجات من Shopify
// =============================
async function fetchShopifyProducts() {
  const now = Date.now();
  if (cachedProducts && now - lastFetchProducts < PRODUCTS_TTL) {
    return cachedProducts;
  }

  try {
    const url = `https://${SHOPIFY_STORE}/admin/api/2024-07/products.json?limit=10`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    cachedProducts = res.data.products
      .map(
        (p) =>
          `- ${p.title} | ${p.variants[0].price} OMR | [رابط المنتج](https://${SHOPIFY_STORE}/products/${p.handle})`
      )
      .join("\n");

    lastFetchProducts = now;
    return cachedProducts;
  } catch (err) {
    console.error("❌ Shopify products error:", err.response?.data || err.message);
    return "";
  }
}

// =============================
// 📌 جلب سياسات المتجر
// =============================
async function fetchShopifyPolicies() {
  const now = Date.now();
  if (cachedPolicies && now - lastFetchPolicies < POLICIES_TTL) {
    return cachedPolicies;
  }

  try {
    const url = `https://${SHOPIFY_STORE}/admin/api/2024-07/policies.json`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    cachedPolicies = res.data.policies
      .map((p) => `📜 ${p.title}: ${p.body.substring(0, 200)}...`)
      .join("\n");

    lastFetchPolicies = now;
    return cachedPolicies;
  } catch (err) {
    console.error("❌ Shopify policies error:", err.response?.data || err.message);
    return "";
  }
}

// =============================
// 📌 إرسال رسالة عبر Ultramsg
// =============================
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to: to,
      body: message,
    };
    await axios.post(url, payload);
    console.log(`✅ أُرسلت رسالة إلى ${to}: ${message}`);
  } catch (err) {
    console.error("❌ Ultramsg error:", err.response?.data || err.message);
  }
}

// =============================
// 📌 Webhook من Ultramsg
// =============================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body?.data;
    if (!data || !data.body) return res.sendStatus(200);

    const from = data.from.replace("@c.us", "");
    const message = data.body;
    console.log(`📩 رسالة من ${from}: ${message}`);

    if (!conversationCache[from]) {
      conversationCache[from] = [];
    }

    // جلب بيانات من Shopify
    const products = await fetchShopifyProducts();
    const policies = await fetchShopifyPolicies();
    const context = `${products}\n\n${policies}`;

    // الرد عبر GPT
    const reply = await askChatGPT(message, context, conversationCache[from]);

    // حفظ المحادثة
    conversationCache[from].push({ q: message, a: reply });
    if (conversationCache[from].length > 10) {
      conversationCache[from].shift();
    }

    saveConversations();

    // إرسال الرد
    await sendWhatsAppMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// =============================
// 🚀 Start server
// =============================
const PORT = process.env.PORT || 10000;
loadConversations();
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
