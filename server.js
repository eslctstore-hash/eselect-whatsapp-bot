import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ==================== STATE ====================
const activeUsers = new Map(); // { phone: { greeted, messages, timer, lastResponded } }

// ==================== UTIL FUNCTIONS ====================

async function sendMessage(to, message) {
  try {
    const response = await axios.post(
      `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`,
      {
        to: `${to}`,
        body: message,
      },
      {
        headers: { "Content-Type": "application/json" },
        params: { token: ULTRAMSG_TOKEN },
      }
    );
    console.log("✅ Sent via Ultramsg:", response.data);
  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
  }
}

// ✳️ معالجة الرسائل بعد الانتظار
async function processUserMessages(from, messages) {
  const fullText = messages.join(" ").trim();

  // 🔍 التحقق إن كان المستخدم يسأل عن الطلبات
  const orderMatch = fullText.match(/\b\d{3,6}\b/);
  if (orderMatch) {
    const orderId = orderMatch[0];
    const order = await getShopifyOrder(orderId);
    if (order) {
      await sendMessage(from, `📦 حالة الطلب رقم ${orderId}: ${order.status}\n${order.tracking}`);
      return;
    } else {
      await sendMessage(from, `🚫 ما حصلت طلب بهذا الرقم ${orderId}. تأكد منه لو سمحت.`);
      return;
    }
  }

  // 🤖 إذا لم يكن طلب، نستخدم ChatGPT
  const aiResponse = await getAIResponse(fullText);
  if (aiResponse) {
    await sendMessage(from, aiResponse);
  } else {
    await sendMessage(from, "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.");
  }
}

// 💬 استدعاء ChatGPT API
async function getAIResponse(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
              أنت مساعد ذكي يمثل متجر eSelect | إي سيلكت.
              تحدث باللهجة العمانية فقط.
              كن ودوداً، مختصراً، ومقنعاً.
              أجب فقط بما له علاقة بالمنتجات، الطلبات، الشحن، الدفع، أو السياسات.
              إذا طلب الزبون الاتصال، أخبره أنه يمكنه الضغط على زر الاتصال ليتحدث مع الدعم الفني.
            `,
          },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ OpenAI Error:", err.response?.data || err.message);
    return null;
  }
}

// 🛍️ جلب الطلب من Shopify
async function getShopifyOrder(orderId) {
  try {
    const res = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/orders.json?name=${orderId}`, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });
    const order = res.data.orders?.[0];
    if (!order) return null;
    return {
      id: order.id,
      status: order.financial_status || "غير محدد",
      tracking:
        order.fulfillments?.[0]?.tracking_url || "لا يوجد رابط تتبع حالياً.",
    };
  } catch (err) {
    console.error("❌ Shopify Error:", err.response?.data || err.message);
    return null;
  }
}

// ==================== CORE BOT LOGIC ====================

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const from = body.from?.replace("@c.us", "");
    const text = body.body?.trim();

    if (!from || !text) return res.sendStatus(200);

    if (!activeUsers.has(from)) {
      activeUsers.set(from, { greeted: false, messages: [], timer: null, lastResponded: false });
    }

    const session = activeUsers.get(from);
    session.messages.push(text);

    // 👋 الترحيب فقط أول مرة
    if (!session.greeted) {
      session.greeted = true;
      await sendMessage(from, "👋 هلا وسهلا بك في eSelect | إي سيلكت! كيف أقدر أخدمك اليوم؟");
    }

    // إذا كان تم الرد مسبقاً — إعادة تفعيل الرد فقط عند وجود رسالة جديدة
    if (session.lastResponded) session.lastResponded = false;

    // إلغاء المؤقت القديم
    if (session.timer) clearTimeout(session.timer);

    // بدء مؤقت جديد
    session.timer = setTimeout(async () => {
      if (!session.lastResponded && session.messages.length > 0) {
        const msgs = [...session.messages];
        session.messages = [];
        await processUserMessages(from, msgs);
        session.lastResponded = true;
      }
    }, 10000); // ← الانتظار 10 ثواني بعد آخر رسالة

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    res.sendStatus(500);
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => console.log(`🚀 eSelect WhatsApp AI Bot running on port ${PORT}`));
