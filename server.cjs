const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// =============== المتغيرات من البيئة ===============
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // مثال: https://eselect.myshopify.com
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+968XXXXXXXX"; // رقم الدعم

// =============== ذاكرة مؤقتة ===============
const conversationCache = new Map();
const humanOverride = new Map();
const failedAttempts = new Map();

// =============== وظائف مساعدة ===============
function normalizePhone(phone) {
  return phone.replace(/^968/, "").replace(/\D/g, ""); // يحذف 968 ورموز
}

function isHumanRequest(text) {
  const keywords = [
    /موظف/i,
    /شخص حقيقي/i,
    /اكلم/i,
    /خدمة العملاء/i,
    /بشر/i,
    /اتواصل/i,
    /تكلم مع/i
  ];
  return keywords.some(rx => rx.test(text));
}

// التحقق إذا كان العميل تحت وضع الموظف
function isInHumanOverride(userId) {
  const until = humanOverride.get(userId);
  return until && Date.now() < until;
}

// جلب الطلبات من Shopify عبر رقم الهاتف
async function getCustomerOrdersByPhone(phone) {
  try {
    const cleanPhone = normalizePhone(phone);
    const url = `${SHOPIFY_STORE_URL}/admin/api/2023-10/orders.json?status=any&fields=id,phone,customer,financial_status,fulfillment_status,order_number,total_price,current_total_price,shipping_address,note,created_at`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    });
    const orders = res.data.orders || [];
    return orders.filter(o => normalizePhone(o.phone || "") === cleanPhone);
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return [];
  }
}

// إرسال رسالة عبر Ultramsg
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    const res = await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: message
    });
    console.log("✅ Sent via Ultramsg:", {
      to,
      ok: true,
      replyPreview: message.slice(0, 50)
    });
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.response?.data || err.message);
  }
}

// رد ذكي باستخدام OpenAI
async function generateAIResponse(userId, text, context = "") {
  try {
    const history = conversationCache.get(userId) || [];
    const messages = [
      { role: "system", content: "أنت بوت خدمة عملاء لمتجر eSelect | إي سيلكت. رد بود واحترام واحترافية." },
      ...history,
      { role: "user", content: text }
    ];

    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
        temperature: 0.6
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = res.data.choices[0].message.content;
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: reply });
    conversationCache.set(userId, history.slice(-10)); // حفظ آخر 10 رسائل فقط
    return reply;
  } catch (err) {
    console.error("❌ ChatGPT error:", err.response?.data || err.message);
    return "عذرًا، صار خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// منطق الرد على العملاء
async function handleCustomerQuery(userId, phone, text) {
  // تحقق من وضع الموظف
  if (isInHumanOverride(userId)) {
    return `تم تحويلك لموظف خدمة عملاء 👨‍💼، يرجى الانتظار.`;
  }

  // إذا طلب موظف
  if (isHumanRequest(text)) {
    humanOverride.set(userId, Date.now() + 60 * 60 * 1000); // ساعة
    return `تم تحويلك لأحد موظفينا المختصين 👨‍💼. يمكنك أيضًا الاتصال على ${SUPPORT_PHONE} ☎️`;
  }

  // تحقق من وجود طلبات
  const orders = await getCustomerOrdersByPhone(phone);
  if (orders.length > 0) {
    const order = orders[0]; // أول طلب
    if (/طلب|order|حالة/i.test(text)) {
      return `🔎 تفاصيل طلبك #${order.order_number}:\n- الحالة المالية: ${order.financial_status}\n- حالة التوصيل: ${order.fulfillment_status || "قيد المعالجة"}\n- المبلغ: ${order.total_price} OMR\n- ملاحظات: ${order.note || "لا توجد"}\n\n📦 شكرًا لتسوقك معنا 🙏`;
    }
  } else {
    // زبون جديد
    return `👋 أهلاً بك في eSelect | إي سيلكت! يبدو أنك زبون جديد 🌟\n\nلدينا مجموعة واسعة من المنتجات (أجهزة كهربائية، ملحقات سيارات، منتجات العناية والجمال، الرياضة وغيرها).\n\nطرق الدفع: 💳 بطاقة / 💵 عند الاستلام / 🔗 تحويل مصرفي\nالتوصيل 🚚 خلال 2-4 أيام.\n\nهل ترغب أن أرسل لك بعض المنتجات المميزة اليوم؟`;
  }

  // الرد الافتراضي عبر GPT
  let attempts = failedAttempts.get(userId) || 0;
  const reply = await generateAIResponse(userId, text);

  if (reply.includes("عذرًا") || reply.includes("لا أستطيع")) {
    attempts++;
    failedAttempts.set(userId, attempts);
    if (attempts >= 3) {
      humanOverride.set(userId, Date.now() + 60 * 60 * 1000);
      failedAttempts.delete(userId);
      return `ألاحظ أن استفسارك يحتاج متابعة خاصة 🤔، سأحوّلك الآن إلى أحد موظفينا المختصين 👨‍💼`;
    }
  } else {
    failedAttempts.set(userId, 0);
  }

  return reply;
}

// =============== Webhook ===============
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📩 Incoming:", JSON.stringify(body, null, 2));

    const event = body.event_type || body.eventType;
    if (event !== "message_received") {
      console.log("↩️ Ignored event_type:", event);
      return res.sendStatus(200);
    }

    const msg = body.data || body;
    const userId = msg.from;
    const phone = msg.from.replace(/@c\.us$/, "");
    const text = msg.body?.trim();

    if (!text) return res.sendStatus(200);

    const reply = await handleCustomerQuery(userId, phone, text);
    await sendWhatsAppMessage(userId, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// =============== تشغيل السيرفر ===============
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
