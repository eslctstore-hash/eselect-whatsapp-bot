// server.cjs

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
app.use(bodyParser.json());

// ==========================
// إعداد المتغيرات
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // smm-arab.myshopify.com
const SHOPIFY_API_TOKEN = process.env.SHOPIFY_API_TOKEN; // shpat_xxx

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SUPPORT_NUMBER = "96894682186"; // رقم الدعم (واتساب)

// OpenAI Client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ==========================
// تخزين الجلسات
// ==========================
const sessions = {}; // { from: { human: bool, lastOrder: id, takeoverUntil: timestamp } }

// ==========================
// إرسال رسالة واتساب
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
// جلب الطلب من Shopify
// ==========================
async function fetchOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders/${orderId}.json`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_API_TOKEN,
      },
    });
    return res.data.order;
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return null;
  }
}

// ==========================
// ردود الذكاء الاصطناعي
// ==========================
async function generateAIResponse(userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "أنت بوت خدمة عملاء لمتجر eSelect | إي سيلكت. ردودك ودودة، احترافية، قصيرة، وتركز على المساعدة في المنتجات، الطلبات، الدفع والشحن.",
        },
        { role: "user", content: userMessage },
      ],
      max_tokens: 200,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    return "⚠️ حدث خطأ غير متوقع. حاول لاحقًا.";
  }
}

// ==========================
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  const now = Date.now();

  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null, takeoverUntil: null };
    await sendMessage(
      from,
      "👋 أهلاً بك في eSelect | إي سيلكت! كيف أقدر أساعدك اليوم بخصوص المنتجات أو الطلبات؟"
    );
    return;
  }

  // تحقق من جلسة takeover (موظف بشري)
  if (sessions[from].takeoverUntil && now < sessions[from].takeoverUntil) {
    console.log("⏸️ Ignoring", from, "(human takeover active)");
    return;
  }

  // إذا العميل طلب محادثة موظف
  if (/(موظف|شخص|احد|بشر|الحقيقي|خدمة)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      sessions[from].takeoverUntil = now + 60 * 60 * 1000; // ساعة توقف
      await sendMessage(
        from,
        "👨‍💼 تم تحويلك إلى أحد موظفينا المختصين، يرجى الانتظار لحين الرد عليك من قبل الموظف."
      );
    }
    return;
  }

  // 🔹 التحقق من الاستفسار عن طلب
  if (
    /(طلب|طلبي|طلبيتي|طلبتي|طلبياتي|طلبية|طلباتي|اوردري|اوردر|اوردراتي|أوردري|أوردراتي)/i.test(
      text
    )
  ) {
    const match = text.match(/\d{3,6}/); // رقم من 3 إلى 6 خانات
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      await sendMessage(
        from,
        `📦 تم استلام رقم الطلب: ${orderId}\n⏳ يرجى الانتظار، جاري التحقق...`
      );

      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(
          from,
          `✅ تفاصيل الطلب #${orderId}:\n👤 العميل: ${
            order.customer?.first_name || "غير معروف"
          }\n💵 الإجمالي: ${order.total_price} ${order.currency}\n📌 الحالة: ${
            order.fulfillment_status || "قيد المعالجة"
          }`
        );
      } else {
        await sendMessage(
          from,
          `⚠️ لم أتمكن من العثور على تفاصيل الطلب رقم ${orderId}. يرجى التأكد من الرقم.`
        );
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ يرجى تزويدي برقم الطلب للتحقق.");
      return;
    }
  }

  // 🔹 باقي الرسائل → تمرير للذكاء الاصطناعي
  const aiReply = await generateAIResponse(text);
  await sendMessage(from, aiReply);
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
