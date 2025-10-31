// ==========================
// 🤖 eSelect WhatsApp Bot v10.2 (Whisper + Vision + Intent + Link Analyzer)
// إعداد: سالم السليمي | https://eselect.store
// ==========================

import express from "express";
import axios from "axios";
import cron from "node-cron";
import fs from "fs";
import stream from "stream";
import FormData from "form-data";
import multer from "multer";
import fileType from "file-type";
import { google } from "googleapis";

const app = express();
app.use(express.json());
const upload = multer();

// ==========================
// 🌍 Environment Variables
// ==========================
const PORT = process.env.PORT || 3000;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHISPER_API_KEY = process.env.WHISPER_API_KEY || OPENAI_API_KEY;
const VISION_API_KEY = process.env.VISION_API_KEY || OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN || "";

// ==========================
// 🧰 System Variables
// ==========================
const lastMessages = new Map();
const userSession = new Map();
const shopifyCache = { products: [] };
const REPLY_DELAY_MS = 10000;

// ==========================
// 📊 Google Sheets Setup
// ==========================
let serviceAccountCredentials = {};
if (GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
  try {
    const credentialsJson = fs.readFileSync(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS, "utf8");
    serviceAccountCredentials = JSON.parse(credentialsJson);
    console.log("✅ Google Sheets credentials loaded.");
  } catch (err) {
    console.error("❌ Could not read Google credentials:", err.message);
  }
}
const sheetsClient = google.sheets({
  version: "v4",
  auth: new google.auth.GoogleAuth({
    credentials: serviceAccountCredentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  }),
});

// ==========================
// 🔔 Helper Functions
// ==========================
function detectLanguage(text) {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text) ? "ar" : "en";
}

async function sendMessage(to, body) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, { token: ULTRAMSG_TOKEN, to, body });
    console.log(`💬 Sent to ${to}: ${body}`);
  } catch (err) {
    console.error("❌ Send Error:", err.response?.data || err.message);
  }
}

async function refreshShopifyCache() {
  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });
    shopifyCache.products = res.data.products;
    console.log("🔄 Shopify cache updated successfully.");
  } catch (err) {
    console.error("⚠️ Failed to refresh Shopify cache:", err.message);
  }
}

async function logToSheet(from, message, reply) {
  if (!GOOGLE_SHEETS_ID) return;
  try {
    const values = [[new Date().toLocaleString(), from, message, reply]];
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: "Sheet1!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    console.log("📊 Logged to Google Sheets.");
  } catch (err) {
    console.error("❌ Google Sheets Error:", err.message);
  }
}

async function searchProductByKeyword(keyword) {
  const found = shopifyCache.products.find((p) =>
    p.title.toLowerCase().includes(keyword.toLowerCase())
  );
  if (!found) return null;
  const v = found.variants[0];
  const available = v?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌";
  return `📦 ${found.title}\n💰 ${v?.price || "غير محدد"} ر.ع\n📦 الحالة: ${available}`;
}

async function fetchOrderStatus(orderNumber) {
  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders.json?name=${orderNumber.replace(
      "#",
      ""
    )}`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });
    const o = res.data.orders[0];
    if (!o) return "⚠️ لم أجد أي طلب بهذا الرقم.";
    return `🔎 حالة طلبك ${o.name}: ${o.fulfillment_status || "قيد المعالجة"}\n💰 المجموع: ${o.total_price} ${o.currency}`;
  } catch {
    return "⚠️ حدث خطأ أثناء التحقق من الطلب.";
  }
}

async function analyzeLink(url) {
  try {
    if (url.includes("eselect.store")) {
      const handle = url.split("/products/")[1]?.split("?")[0];
      const product = shopifyCache.products.find((p) => p.handle === handle);
      if (product) {
        const v = product.variants[0];
        return `📦 ${product.title}\n💰 ${v?.price || "غير محدد"} ر.ع\n📦 الحالة: ${
          v?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌"
        }`;
      }
    }
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد ذكي يقرأ روابط المنتجات ويصف محتواها بشكل مختصر ومهذب بالعربية أو الإنجليزية حسب اللغة.",
          },
          { role: "user", content: `حلل هذا الرابط باختصار: ${url}` },
        ],
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return aiResponse.data.choices[0].message.content;
  } catch (err) {
    return "⚠️ لم أستطع تحليل الرابط.";
  }
}
// ==========================
// 🎧 Whisper (Audio to Text)
// ==========================
async function transcribeAudio(fileUrl) {
  try {
    const audioRes = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const formData = new FormData();
    formData.append("file", audioRes.data, "audio.ogg");
    formData.append("model", "whisper-1");

    const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
      headers: { Authorization: `Bearer ${WHISPER_API_KEY}`, ...formData.getHeaders() },
    });

    return res.data.text;
  } catch (err) {
    console.error("❌ Whisper Error:", err.message);
    return null;
  }
}

// ==========================
// 🖼️ Vision (Image/Video Analysis)
// ==========================
async function analyzeMedia(url) {
  try {
    const ft = await fileType.fromStream((await axios.get(url, { responseType: "stream" })).data);
    const isVideo = ft?.mime?.startsWith("video");
    const prompt = isVideo
      ? "وصف سريع لمحتوى الفيديو من الصورة الأولى"
      : "صف محتوى الصورة باختصار مع تحديد نوع المنتج الظاهر فيها";

    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      },
      { headers: { Authorization: `Bearer ${VISION_API_KEY}` } }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Vision Error:", err.message);
    return "⚠️ لم أستطع تحليل الصورة أو الفيديو.";
  }
}

// ==========================
// 🧠 Intent Engine (فهم نية العميل)
// ==========================
async function detectIntent(text) {
  const lang = detectLanguage(text);
  const prompt =
    lang === "ar"
      ? `حلل نية المستخدم التالية وحدد نوعها باختصار من بين الخيارات: 
         (طلب منتج - سؤال عن طلب - استفسار عام - شكوى - دردشة عادية - رابط أو صورة منتج)
         الجملة: ${text}`
      : `Analyze the user's intent and classify it as: 
         (product inquiry, order status, general question, complaint, casual chat, link/media). Sentence: ${text}`;

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return res.data.choices[0].message.content.trim().toLowerCase();
  } catch (err) {
    console.error("❌ Intent Error:", err.message);
    return "unknown";
  }
}

// ==========================
// 🧠 Smart Reply Engine
// ==========================
async function generateSmartReply(userMessage, from) {
  const lang = detectLanguage(userMessage);
  const intent = await detectIntent(userMessage);
  console.log(`🧠 Intent detected for ${from}: ${intent}`);

  // التعامل مع الروابط
  if (userMessage.includes("http")) {
    const urlMatch = userMessage.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const linkAnalysis = await analyzeLink(urlMatch[0]);
      return linkAnalysis;
    }
  }

  // التعامل مع أرقام الطلبات
  if (/#?\d{3,6}/.test(userMessage)) {
    const orderNumber = userMessage.match(/#?\d{3,6}/)[0];
    return await fetchOrderStatus(orderNumber);
  }

  // التعامل مع الكلمات المفتاحية عن المنتجات
  if (intent.includes("منتج") || intent.includes("product")) {
    const keyword = userMessage.split(" ")[0];
    const found = await searchProductByKeyword(keyword);
    if (found) return found;
  }

  // الردود الذكية الافتراضية
  if (intent.includes("شكوى") || intent.includes("complaint")) {
    return lang === "ar"
      ? "نعتذر عن أي إزعاج، وسنسعى لحل المشكلة بأسرع وقت. تقدر توضح لي المشكلة أكثر؟ 🙏"
      : "We’re sorry for any inconvenience. Could you please share more details?";
  }

  if (intent.includes("طلب") || intent.includes("order")) {
    return lang === "ar"
      ? "فضلاً زودني برقم الطلب للتحقق من حالته بدقة. 😊"
      : "Please provide your order number so I can check it for you.";
  }

  if (intent.includes("استفسار") || intent.includes("question")) {
    return lang === "ar"
      ? "أكيد! تفضل سؤالك وأنا جاهز أساعدك بكل سرور 😊"
      : "Sure! Please share your question and I’ll be happy to assist.";
  }

  if (intent.includes("دردشة") || intent.includes("casual")) {
    return lang === "ar"
      ? "😊 هلا وسهلا! خبرني كيف أقدر أخدمك اليوم؟"
      : "Hey there! How can I assist you today?";
  }

  return lang === "ar"
    ? "ما فهمت سؤالك تمامًا، ممكن توضح أكثر؟ 😊"
    : "I didn’t quite understand, could you please clarify?";
}
// ==========================
// 📩 Webhook Handler
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body;
  if (!msg || !msg.data) return;

  const from = msg.data.from;
  const type = msg.data.type || "chat";
  const body = msg.data.body || "";
  console.log(`📩 New message from ${from}: ${body || type}`);

  let userMessage = body.trim();

  try {
    // 🎧 إذا كانت الرسالة صوتية
    if (type === "audio" && msg.data.media) {
      const audioUrl = msg.data.media.url;
      const transcript = await transcribeAudio(audioUrl);
      if (transcript) userMessage = transcript;
    }

    // 🖼️ إذا كانت الرسالة تحتوي على صورة أو فيديو
    if ((type === "image" || type === "video") && msg.data.media) {
      const mediaUrl = msg.data.media.url;
      const analysis = await analyzeMedia(mediaUrl);
      const reply = analysis;
      await sendMessage(from, reply);
      await logToSheet(from, userMessage || type, reply);
      return;
    }

    // نصوص عادية أو روابط
    const reply = await generateSmartReply(userMessage, from);
    await sendMessage(from, reply);
    await logToSheet(from, userMessage, reply);
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    await sendMessage(from, "⚠️ حدث خلل مؤقت أثناء معالجة الرسالة. حاول لاحقاً 🙏");
  }
});

// ==========================
// 📅 Scheduled Tasks
// ==========================
cron.schedule("*/30 * * * *", refreshShopifyCache);

// ==========================
// 🚀 Start Server
// ==========================
app.listen(PORT, () => {
  console.log(`🚀 eSelect WhatsApp Bot v10.2 running on port ${PORT}`);
  refreshShopifyCache();
});
