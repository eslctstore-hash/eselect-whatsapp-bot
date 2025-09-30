// server.cjs

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
app.use(bodyParser.json());

// ==========================
// المتغيرات من .env
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // مثال: eselect.store
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SUPPORT_NUMBER = "96894682186"; // رقم الدعم

// ==========================
// تهيئة OpenAI
// ==========================
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ==========================
// تخزين الجلسات
// ==========================
const sessions = {}; // {from: {human, lastOrder, pausedUntil}}

// ==========================
// إرسال رسالة واتساب
// ==========================
async function sendMessage(to, body, buttons = null) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const payload = {
      token: ULTRAMSG_TOKEN,
      to,
      body,
    };

    if (buttons) {
      payload.buttons = buttons;
    }

    const res = await axios.post(url, payload);
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// ==========================
// جلب الطلب من Shopify
// ==========================
async function fetchOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_API_KEY}:${SHOPIFY_PASSWORD}@${SHOPIFY_STORE}/admin/api/2025-01/orders/${orderId}.json`;
    const res = await axios.get(url);
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return null;
  }
}

// ==========================
// رد من الذكاء الاصطناعي
// ==========================
async function aiReply(userMsg, customerStatus = "جديد") {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت مساعد ودود باللهجة العمانية لمتجر eSelect | إي سيلكت.
          ردودك قصيرة، ذكية، وتقنع الزبون بالشراء.
          ركز على منتجاتنا: إلكترونيات، أجهزة ذكية، منتجات رقمية (بطاقات ألعاب، اشتراكات)، أدوات منزلية، ملابس، وألعاب.
          عند سؤال عن طلب، إذا غير متوفر الرقم قل له يتحقق من الرقم.
          إذا المنتج غير موجود قل بكل ود: "للأسف هذا المنتج غير متوفر حالياً، لكن عندنا بدائل مميزة".
          إذا الزبون ${customerStatus} رحّب به ترحيباً خاصاً.
          لا تقدم معلومات عامة خارج المتجر.`
        },
        { role: "user", content: userMsg },
      ],
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ OpenAI error:", err.response?.data || err.message);
    return "⚠️ عذرًا، صار خلل مؤقت في النظام. حاول مرة ثانية.";
  }
}

// ==========================
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  const now = Date.now();
  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null, pausedUntil: 0, customerStatus: "جديد" };
    await sendMessage(from, "👋 هلا وسهلا فيك فـ eSelect | إي سيلكت! شخبارك؟ كيف نقدر نخدمك اليوم؟");
    return;
  }

  // إذا الجلسة متوقفة (تحويل لموظف)
  if (sessions[from].pausedUntil > now) {
    console.log("⏸️ Session paused for", from);
    return;
  }

  // طلب محادثة موظف
  if (/(موظف|شخص|بشر|الحقيقي|خدمة)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      sessions[from].pausedUntil = now + 30 * 60 * 1000; // توقف نصف ساعة

      await sendMessage(
        from,
        "👨‍💼 تم تحويلك إلى أحد موظفينا المختصين، يرجى الانتظار لغاية الرد عليك من قبل الموظف.",
        [
          {
            type: "call",
            text: "📞 اتصل بالدعم الآن",
            phoneNumber: SUPPORT_NUMBER,
          },
        ]
      );
    }
    return;
  }

  // استفسار عن الطلب
  if (/(طلب|طلبي|طلبيتي|طلبتي|طلبياتي|طلبية|طلباتي|اوردري|اوردر|اوردراتي)/i.test(text)) {
    const match = text.match(/\d{3,6}/);
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      await sendMessage(from, `📦 استلمت رقم الطلب: ${orderId}\nيرجى الانتظار لحظة...`);

      const order = await fetchOrder(orderId);
      if (order) {
        const status = order.fulfillment_status || "قيد المعالجة";
        const tracking = order.fulfillments?.[0]?.tracking_url || "لا يوجد رابط تتبع حالياً";
        await sendMessage(
          from,
          `✅ تفاصيل طلبك #${orderId}:\n👤 ${order.customer?.first_name || "غير معروف"}\n💵 ${order.total_price} ${order.currency}\n📌 الحالة: ${status}\n🔗 تتبع: ${tracking}`
        );
      } else {
        await sendMessage(from, `⚠️ ما حصلت تفاصيل الطلب ${orderId}. تأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ عطني رقم الطلب علشان أتحقق لك.");
      return;
    }
  }

  // رد ذكي من AI
  const reply = await aiReply(text, sessions[from].customerStatus);
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
