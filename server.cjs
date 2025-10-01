// server.cjs

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ==========================
// إعداد المتغيرات من .env
// ==========================
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // مثال: eselect.store
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SUPPORT_NUMBER = "96894682186"; // رقم الدعم الفني

// ==========================
// تخزين الجلسات
// ==========================
const sessions = {};

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
// استدعاء OpenRouter للذكاء الاصطناعي
// ==========================
async function askAI(userMessage) {
  try {
    const safeMessage =
      userMessage && typeof userMessage === "string" && userMessage.trim() !== ""
        ? userMessage.trim()
        : "مرحبا"; // ✅ fallback

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "انت بوت خدمة عملاء لمتجر eSelect | إي سيلكت. رد باللهجة العمانية، كن ودود وذكي، ساعد في الطلبات، المنتجات، الشحن، الدفع، الضمان، المنتجات الرقمية والكروت، واشرح التفاصيل باحترافية."
          },
          {
            role: "user",
            content: safeMessage
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        }
      }
    );

    const reply =
      response.data.choices?.[0]?.message?.content ||
      "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.";
    return reply;
  } catch (err) {
    console.error("❌ OpenRouter error:", err.response?.data || err.message);
    return "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.";
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
// معالجة الرسائل
// ==========================
async function handleMessage(from, text) {
  if (!sessions[from]) {
    sessions[from] = { human: false, lastOrder: null };
    await sendMessage(
      from,
      "👋 هلا وسهلا بك في eSelect | إي سيلكت! كيف أقدر أخدمك اليوم؟"
    );
    return;
  }

  // التحقق إذا العميل يطلب موظف بشري
  if (/(موظف|بشر|شخص|أحد|خدمة)/i.test(text)) {
    if (!sessions[from].human) {
      sessions[from].human = true;
      await sendMessage(
        from,
        "📞 تم تحويلك لأحد موظفينا المختصين. تقدر تتصل مباشرة بالضغط على زر الاتصال.\nيرجى الانتظار لحين الرد."
      );
    }
    return;
  }

  // التحقق من الاستفسار عن الطلب
  if (/(طلب|طلبي|طلبيتي|طلبية|اوردري|اوردر)/i.test(text)) {
    const match = text.match(/\d{3,6}/); // رقم طلب
    if (match) {
      const orderId = match[0];
      sessions[from].lastOrder = orderId;

      await sendMessage(from, `📦 تم استلام رقم الطلب: ${orderId}\n⏳ جاري التحقق...`);

      const order = await fetchOrder(orderId);
      if (order) {
        await sendMessage(
          from,
          `✅ تفاصيل الطلب #${orderId}:\n👤 العميل: ${order.customer?.first_name || "غير معروف"}\n💵 الإجمالي: ${order.total_price} ${order.currency}\n📌 الحالة: ${order.fulfillment_status || "قيد المعالجة"}`
        );
      } else {
        await sendMessage(from, `⚠️ ما حصلت تفاصيل الطلب رقم ${orderId}. تأكد من الرقم.`);
      }
      return;
    } else {
      await sendMessage(from, "ℹ️ عطنا رقم الطلب علشان أتحقق لك.");
      return;
    }
  }

  // 🔹 الرد بالذكاء الاصطناعي على أي استفسار آخر
  const aiReply = await askAI(text);
  await sendMessage(from, aiReply);
}

// ==========================
// Webhook من Ultramsg
// ==========================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body?.data || req.body;
    const from = data.from?.replace("@c.us", "") || null;
    let text = data.body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      console.log("⚠️ استقبلت رسالة فاضية/غير صالحة من:", from);
      text = "مرحبا"; // ✅ fallback
    } else {
      text = text.trim();
    }

    console.log("📩 رسالة جديدة من", from, ":", text);

    if (from) {
      await handleMessage(from, text);
    } else {
      console.log("⚠️ رسالة بدون مرسل تم تجاهلها");
    }
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
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
