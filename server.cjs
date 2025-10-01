// server.cjs

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");

const app = express();
app.use(bodyParser.json());

// ==========================
// المتغيرات من ملف .env
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // ex: smm-arab.myshopify.com
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY; // Token shpat_xxx
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD; // إذا كان عندك Basic Auth قديم
const BOT_WHATSAPP_NUMBER = process.env.BOT_WHATSAPP_NUMBER; // رقم البوت
const SUPPORT_NUMBER = process.env.SUPPORT_NUMBER || BOT_WHATSAPP_NUMBER;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==========================
// تخزين الجلسات
// ==========================
const sessions = {};

// ==========================
// إرسال رسالة واتساب عبر Ultramsg
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
// البحث عن طلب في Shopify
// ==========================
async function fetchOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders/${orderId}.json`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_API_KEY,
      },
    });
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return null;
  }
}

// ==========================
// البحث عن منتج في Shopify
// ==========================
async function searchProduct(query) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/products.json?title=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_API_KEY,
      },
    });
    return res.data.products || [];
  } catch (err) {
    console.error("❌ Shopify product search error:", err.response?.data || err.message);
    return [];
  }
}

// ==========================
// الرد بالذكاء الاصطناعي
// ==========================
async function aiReply(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "انت مساعد افتراضي ودود باسم eSelect | إي سيلكت، ترد باللهجة العمانية فقط، ودود وتقنع الزبون بالشراء. تجاوب عن المنتجات، الطلبات، الدفع، التوصيل، الاستبدال، الضمان، المنتجات الرقمية (بطاقات، اشتراكات، دورات...). إذا المنتج غير متوفر قلها صراحة أو اقترح بديل مشابه.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ OpenAI error:", err.response?.data || err.message);
    return "⚠️ صار خلل مؤقت، حاول مرة ثانية.";
  }
}

// ==========================
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  // أول ترحيب
  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null, lastMessageId: null };
    await sendMessage(
      from,
      "👋 هلا وسهلا فيك في *eSelect | إي سيلكت*! كيف أقدر أخدمك بخصوص المنتجات أو الطلبات؟"
    );
    return;
  }

  // طلب التحدث مع موظف بشري
  if (/(موظف|شخص|بشر|الحقيقي|خدمة|اتصال)/i.test(text)) {
    sessions[from].human = true;
    await sendMessage(
      from,
      `📞 تم تحويلك لأحد موظفينا المختصين. تقدر تتصل مباشرة عبر الضغط هنا: tel:${SUPPORT_NUMBER}\nيرجى الانتظار لغاية ما يرد عليك الموظف.`
    );
    return;
  }

  // استعلام عن الطلب
  if (/(طلب|طلبي|طلبية|اوردري|اوردر)/i.test(text)) {
    const match = text.match(/\d{3,6}/);
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      await sendMessage(
        from,
        `📦 استلمت رقم الطلب: *${orderId}*. ثواني بخبرك عن حالته...`
      );

      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(
          from,
          `✅ تفاصيل الطلب *#${orderId}*:\n👤 ${order.customer?.first_name || "العميل"}\n💵 ${order.total_price} ${order.currency}\n🚚 الحالة: ${order.fulfillment_status || "قيد المعالجة"}`
        );
      } else {
        await sendMessage(from, `⚠️ ما حصلت تفاصيل الطلب *${orderId}*. تأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ عطني رقم الطلب علشان أتحقق لك.");
      return;
    }
  }

  // البحث عن منتج
  if (/(منتج|عندكم|أريد|ابي|available|product)/i.test(text)) {
    const products = await searchProduct(text);
    if (products.length > 0) {
      const first = products[0];
      await sendMessage(
        from,
        `🛒 متوفر عندنا: *${first.title}*\n💵 السعر: ${first.variants[0].price} ${first.variants[0].currency || "OMR"}\n🔗 https://${SHOPIFY_STORE_DOMAIN}/products/${first.handle}`
      );
    } else {
      await sendMessage(from, "🚫 هذا المنتج غير متوفر حالياً.");
    }
    return;
  }

  // الرد بالذكاء الاصطناعي لبقية الأسئلة
  const reply = await aiReply(text);
  await sendMessage(from, reply);
}

// ==========================
// Webhook من Ultramsg
// ==========================
app.post("/webhook", async (req, res) => {
  const data = req.body;
  if (data?.data?.from && data?.data?.body) {
    const from = data.data.from.replace("@c.us", "");
    const text = data.data.body.trim();
    const msgId = data.data.id;

    // تجاهل رسائل البوت نفسه
    if (from === BOT_WHATSAPP_NUMBER) {
      return res.sendStatus(200);
    }

    // منع التكرار على نفس الرسالة
    if (sessions[from]?.lastMessageId === msgId) {
      return res.sendStatus(200);
    }

    sessions[from] = { ...sessions[from], lastMessageId: msgId };

    console.log("📩 رسالة جديدة من", from, ":", text);
    await handleMessage(from, text);
  }
  res.sendStatus(200);
});

// ==========================
// تشغيل السيرفر
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
