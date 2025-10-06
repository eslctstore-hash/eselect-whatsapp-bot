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
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ================== STATE MANAGEMENT ==================
const userSessions = new Map(); // { phone: { messages: [], timer: timeout } }

// ================== SEND MESSAGE ==================
async function sendMessage(to, message) {
  try {
    const res = await axios.post(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body: message,
    });
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// ================== FETCH ORDER ==================
async function fetchOrderByNumber(orderNumber) {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/orders.json?name=${orderNumber}`;
    const res = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    const orders = res.data.orders;
    if (orders && orders.length > 0) {
      const order = orders[0];
      const status = order.fulfillment_status || "قيد المعالجة";
      const total = order.total_price + " " + order.currency;
      const date = order.created_at.split("T")[0];
      return `📦 رقم الطلب ${orderNumber}\nالحالة: ${status}\nالإجمالي: ${total}\nتاريخ الطلب: ${date}`;
    } else {
      return "⚠️ ما لقيت أي طلب بهالرقم، تأكد منه زين.";
    }
  } catch (err) {
    console.error("❌ Shopify error:", err.message);
    return "⚠️ صار خلل أثناء التحقق من الطلب.";
  }
}

// ================== PROCESS USER MESSAGES ==================
async function processUserMessages(phone, messages) {
  const text = messages.join(" ").trim();
  console.log(`🧠 معالجة ${messages.length} رسالة من ${phone}:`, text);

  // التحقق من رقم الطلب
  if (/^\d{3,6}$/.test(text)) {
    const reply = await fetchOrderByNumber(text);
    await sendMessage(phone, reply);
    return;
  }

  // استفسارات الطلب
  if (/(طلبي|طلبية|اوردر|طلب|order)/i.test(text)) {
    await sendMessage(phone, "ℹ️ أرسل لي رقم الطلب علشان أتحقق لك من حالته يا الغالي.");
    return;
  }

  // توليد رد من الذكاء الاصطناعي
  const prompt = `
  الزبون قال: "${text}"
  رد عليه باللهجة العمانية، تكون ودودة واحترافية.
  لا تذكر مواقع أو مصادر خارجية.
  إذا سأل عن منتجات غير موجودة في متجر eSelect قل إنها غير متوفرة حالياً.
  إذا تكلم عن الشحن أو الدفع أو الإرجاع، استخدم سياسات eSelect.
  اختصر الرد بحيث يكون طبيعي وواقعي.
  `;

  try {
    const aiRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت مساعد ذكي لمتجر eSelect في سلطنة عمان، تتحدث بلهجة عمانية لطيفة ومهذبة." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const reply = aiRes.choices[0].message.content || "عذرًا، ما قدرت أفهمك، ممكن توضح أكثر؟";
    await sendMessage(phone, reply);
  } catch (err) {
    console.error("❌ AI error:", err.message);
    await sendMessage(phone, "⚠️ صار خلل مؤقت في النظام. حاول بعد شوي.");
  }
}

// ================== HANDLE INCOMING MESSAGE ==================
async function handleIncomingMessage(from, text) {
  if (!from || !text) return;
  text = text.trim();

  // إنشاء جلسة المستخدم إذا غير موجودة
  if (!userSessions.has(from)) {
    userSessions.set(from, { messages: [], timer: null });
    await sendMessage(from, "👋 هلا وسهلا بك في eSelect | إي سيلكت! كيف أقدر أخدمك اليوم؟");
  }

  const session = userSessions.get(from);
  session.messages.push(text);

  // إذا فيه مؤقت سابق، ألغِه
  if (session.timer) clearTimeout(session.timer);

  // بدء مؤقت جديد (10 ثواني)
  session.timer = setTimeout(async () => {
    const msgs = [...session.messages];
    session.messages = []; // تصفير الرسائل
    await processUserMessages(from, msgs);
  }, 10000);
}

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.data;
    const from = msg?.from?.replace("@c.us", "");
    const text = msg?.body;
    console.log("📩 رسالة جديدة من", from, ":", text);
    await handleIncomingMessage(from, text);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ================== TEST ROUTE ==================
app.get("/", (req, res) => {
  res.send("🚀 eSelect WhatsApp Bot (Smart Oman AI Version)");
});

// ================== START ==================
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
