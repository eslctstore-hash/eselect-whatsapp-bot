// ==========================
// 🧠 eSelect WhatsApp Bot v2.1 (Stable)
// Powered by Ultramsg + ChatGPT + Shopify
// ==========================

import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ==========================
// 🌍 المتغيرات من .env
// ==========================
const PORT = process.env.PORT || 3000;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

// ==========================
// 📦 متغيرات النظام الداخلية
// ==========================
const lastMessages = new Map(); // لتجميع الرسائل من نفس المرسل
const lastResponseTime = new Map(); // لتجنب الرد مرتين
const REPLY_DELAY_MS = 10000; // انتظار 10 ثواني بعد آخر رسالة

// ==========================
// 🧰 دوال مساعدة
// ==========================

// 📩 إرسال رسالة عبر Ultramsg
async function sendMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    const res = await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: message,
    });
    console.log(`✅ Sent to ${to}: ${message}`);
  } catch (err) {
    console.error("❌ Send Error:", err.response?.data || err.message);
  }
}

// ==========================
// 🛍️ جلب تفاصيل منتج من Shopify
// ==========================
async function searchProductInShopify(query) {
  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?title=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });

    if (res.data.products && res.data.products.length > 0) {
      const p = res.data.products[0];
      const variant = p.variants?.[0];
      const available = variant?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌";
      return `📦 المنتج: ${p.title}\n💰 السعر: ${variant?.price || "غير محدد"} ر.ع\n📦 الحالة: ${available}`;
    } else return "لم أجد هذا المنتج في المتجر.";
  } catch {
    return "⚠️ تعذر جلب بيانات المنتج حالياً.";
  }
}

// ==========================
// 🔍 جلب حالة الطلب من Shopify
// ==========================
async function fetchOrderByNumber(orderNumber) {
  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders.json?name=${orderNumber}`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });

    if (res.data.orders?.length > 0) {
      const o = res.data.orders[0];
      const status = o.fulfillment_status || "قيد المعالجة";
      const total = o.total_price;
      const currency = o.currency;
      return `🔎 حالة طلبك ${o.name}: ${status}\n💰 المجموع: ${total} ${currency}`;
    } else return "⚠️ لم أجد أي طلب بهذا الرقم.";
  } catch {
    return "⚠️ تعذر التحقق من الطلب حالياً.";
  }
}

// ==========================
// 📄 جلب سياسة أو صفحة من Shopify
// ==========================
async function fetchStorePolicy(keyword) {
  const map = {
    "الشحن": "shipping",
    "الإرجاع": "return",
    "الخصوصية": "privacy",
    "الشروط": "terms",
  };

  const handle = map[keyword];
  if (!handle) return null;

  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/pages.json`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });

    const page = res.data.pages.find((p) => p.handle.includes(handle));
    return page ? `📘 سياسة ${keyword}:\n${page.body_html.replace(/<[^>]*>?/gm, "").slice(0, 400)}...` : null;
  } catch {
    return null;
  }
}

// ==========================
// 🤖 الرد الذكي عبر ChatGPT
// ==========================
async function generateAIReply(userMessage) {
  try {
    // تحقق من رقم الطلب
    const orderMatch = userMessage.match(/#?\d{3,6}/);
    if (orderMatch) return await fetchOrderByNumber(orderMatch[0].replace("#", ""));

    // تحقق من طلب منتج
    if (userMessage.includes("منتج") || userMessage.includes("سعر") || userMessage.includes("متوفر")) {
      const query = userMessage.replace(/(منتج|سعر|كم|عن)/g, "").trim();
      if (query.length > 2) return await searchProductInShopify(query);
    }

    // تحقق من السياسات
    const policies = ["الشحن", "الإرجاع", "الخصوصية", "الشروط"];
    for (const k of policies) {
      if (userMessage.includes(k)) {
        const policy = await fetchStorePolicy(k);
        if (policy) return policy;
      }
    }

    // الرد من ChatGPT
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `أنت مساعد ذكي لمتجر eSelect | إي سيلكت في عمان.
            تتحدث بلغة ودودة، تشرح بوضوح، وتساعد في الإجابة على استفسارات الزبائن.
            لا تذكر أي متاجر أو مواقع أخرى.`,
          },
          { role: "user", content: userMessage },
        ],
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("ChatGPT Error:", err.message);
    return "⚠️ حدث خلل مؤقت في النظام. حاول لاحقًا.";
  }
}

// ==========================
// 🔔 استقبال الرسائل من Ultramsg Webhook
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body;

  if (!msg || !msg.data?.body || !msg.data?.from) return;

  const from = msg.data.from;
  const text = msg.data.body.trim();

  // تجاهل رسائل البوت نفسه
  if (text.includes("eSelect") || text.includes("⚠️")) return;

  // حفظ الرسائل في انتظار الرد
  if (!lastMessages.has(from)) lastMessages.set(from, []);
  lastMessages.get(from).push(text);

  console.log(`📩 رسالة جديدة من ${from}: ${text}`);

  // تحديث آخر وقت استلام
  lastResponseTime.set(from, Date.now());

  // انتظار 10 ثواني بعد آخر رسالة من المرسل
  setTimeout(async () => {
    const lastTime = lastResponseTime.get(from);
    if (Date.now() - lastTime >= REPLY_DELAY_MS) {
      const allMsgs = lastMessages.get(from).join(" ");
      lastMessages.delete(from);

      console.log(`🧠 معالجة ${from}: ${allMsgs}`);
      const reply = await generateAIReply(allMsgs);
      await sendMessage(from, reply);
    }
  }, REPLY_DELAY_MS);
});

// ==========================
// 🚀 تشغيل السيرفر
// ==========================
app.listen(PORT, () => {
  console.log(`🚀 eSelect WhatsApp Bot is running on port ${PORT}`);
});
