const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const { OpenAI } = require("openai");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());

// ===================== ENV =====================
const PORT = process.env.PORT || 3000;
const ULTRA_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRA_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// ===================== SETUP =====================
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const sessions = {};
const pendingReplies = {};

// Google Drive Auth
const driveAuth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth: driveAuth });

// ===================== FUNCTIONS =====================

// إرسال رسالة واتساب
async function sendMessage(to, body) {
  try {
    const res = await axios.post(`https://api.ultramsg.com/${ULTRA_INSTANCE}/messages/chat`, {
      token: ULTRA_TOKEN,
      to,
      body,
    });
    console.log("✅ أُرسلت إلى", to, ":", body.slice(0, 80));
  } catch (err) {
    console.error("❌ خطأ في الإرسال:", err.response?.data || err.message);
  }
}

// جلب طلب من Shopify
async function fetchOrder(orderId) {
  try {
    const res = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/orders/${orderId}.json`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    );
    return res.data.order;
  } catch (err) {
    return null;
  }
}

// جلب منتجات من Shopify
async function fetchProducts() {
  try {
    const res = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products.json`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    );
    return res.data.products || [];
  } catch (err) {
    console.error("❌ خطأ في جلب المنتجات:", err.message);
    return [];
  }
}

// حفظ ذاكرة في Google Drive
async function saveToDrive(user, data) {
  try {
    const fileMetadata = {
      name: `${user}-${Date.now()}.txt`,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
    };
    const media = {
      mimeType: "text/plain",
      body: data,
    };
    await drive.files.create({
      resource: fileMetadata,
      media,
      fields: "id",
    });
    console.log("🗂️ تم حفظ محادثة المستخدم:", user);
  } catch (err) {
    console.error("⚠️ فشل الحفظ في Drive:", err.message);
  }
}

// معالجة الذكاء الاصطناعي
async function aiReply(prompt) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "أنت مساعد افتراضي ذكي باسم (مسعود) خاص بمتجر eSelect العماني. تتحدث باللهجة العمانية باحترام وود. تجاوب العملاء حول المنتجات، الطلبات، الأسعار، مدة الشحن، السياسات، والاستبدال. لا تذكر معلومات غير مؤكدة. إذا لم تجد معلومة قل بلطف: 'ما متأكد من هذا الشي، بس ممكن أتحقق لك'.",
        },
        { role: "user", content: prompt },
      ],
    });
    return res.choices[0].message.content;
  } catch (err) {
    console.error("❌ خطأ من OpenAI:", err.message);
    return "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.";
  }
}

// ===================== MESSAGE HANDLER =====================
async function processMessages(phone, fullText) {
  console.log("🧠 معالجة", phone + ":", fullText);

  // حفظ في Google Drive (ذاكرة)
  await saveToDrive(phone, fullText);

  // حالة الطلب
  if (/(\d{3,6})/.test(fullText) && /(طلب|طلبي|طلبية|order|طلباتي)/i.test(fullText)) {
    const orderId = fullText.match(/\d{3,6}/)[0];
    const order = await fetchOrder(orderId);
    if (order) {
      await sendMessage(
        phone,
        `🔎 حالة طلبك #${orderId}: ${order.fulfillment_status || "قيد المعالجة"}\n💰 المجموع: ${order.total_price} ${order.currency}`
      );
      return;
    } else {
      await sendMessage(phone, "❌ ما حصلت رقم الطلب هذا في النظام، تأكد منه لو سمحت.");
      return;
    }
  }

  // المنتجات
  if (/منتج|منتجات|عروض|جديد|خصم|ساعات|ألعاب|الكترونيات|لبان/i.test(fullText)) {
    const products = await fetchProducts();
    if (products.length === 0) {
      await sendMessage(phone, "📦 حالياً ما في منتجات معروضة لأن المتجر في صيانة مؤقتة.");
      return;
    }
    const randoms = products.slice(0, 3).map((p) => `🛍️ ${p.title} - ${p.variants[0].price} OMR`);
    await sendMessage(phone, `بعض المنتجات المتوفرة:\n${randoms.join("\n")}`);
    return;
  }

  // استفسارات عامة
  const reply = await aiReply(fullText);
  await sendMessage(phone, reply);
}

// ===================== WHATSAPP WEBHOOK =====================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    const from = data?.data?.from;
    const text = data?.data?.body?.trim();

    if (!from || !text) return res.sendStatus(200);

    if (!sessions[from]) sessions[from] = { messages: [] };
    sessions[from].messages.push(text);

    clearTimeout(pendingReplies[from]);
    pendingReplies[from] = setTimeout(async () => {
      const fullText = sessions[from].messages.join(" ");
      sessions[from].messages = [];
      await processMessages(from, fullText);
    }, 10000); // انتظار 10 ثواني بعد آخر رسالة
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
  }
  res.sendStatus(200);
});

// ===================== START =====================
app.listen(PORT, () => {
  console.log(`🚀 eSelect | Masoud AI Bot يعمل على المنفذ ${PORT}`);
});
