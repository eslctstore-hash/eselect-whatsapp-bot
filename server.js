/**
 * eSelect | إي سيلكت
 * WhatsApp AI Bot v10.3 — Whisper + Vision + Product Link Analysis
 * إعداد وتطوير: سالم السليمي | Elite Select SPC
 */

import express from "express";
import axios from "axios";
import { google } from "googleapis";
import cron from "node-cron";
import fs from "fs";
import * as fileType from "file-type";

// ==========================
// 🛡️ CRASH HANDLER
// ==========================
process.on("unhandledRejection", (r) => console.error("Unhandled Rejection:", r));
process.on("uncaughtException", (e) => console.error("Uncaught Exception:", e));

const app = express();
app.use(express.json());

// ==========================
// 🌍 Environment Variables
// ==========================
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

// ==========================
// ☁️ Google Sheets Setup
// ==========================
let sheets;
try {
  const credentials = JSON.parse(fs.readFileSync(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  sheets = google.sheets({ version: "v4", auth });
  console.log("✅ Google Sheets credentials loaded.");
} catch (err) {
  console.error("❌ Google Sheets init error:", err.message);
}

// ==========================
// 📊 Log to Google Sheets
// ==========================
async function logToSheet(from, message, reply) {
  try {
    const row = [new Date().toISOString(), from, message, reply];
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: "Sheet1!A:D",
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    console.log("📊 Logged to Google Sheets.");
  } catch (err) {
    console.error("❌ Google Sheets Error:", err.message);
  }
}

// ==========================
// 📩 Send WhatsApp Message
// ==========================
async function sendMessage(to, message) {
  try {
    await axios.post(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body: message
    });
    console.log(`💬 Sent to ${to}: ${message}`);
  } catch (err) {
    console.error("❌ WhatsApp Send Error:", err.message);
  }
}

// ==========================
// 🎧 Whisper: Audio Transcription
// ==========================
async function transcribeAudio(audioUrl) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        file: audioUrl,
        model: "whisper-1",
        language: "ar"
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return response.data.text;
  } catch (err) {
    console.error("🎧 Whisper Error:", err.message);
    return "ما قدرت أسمع التسجيل تمام، ممكن تكتب لي؟";
  }
}

// ==========================
// 🖼️ Vision: Image/Video Analysis
// ==========================
async function analyzeMedia(mediaUrl) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "أنت مساعد ذكي لتحليل الصور والفيديوهات للمنتجات." },
          {
            role: "user",
            content: [
              { type: "text", text: "صف الصورة أو الفيديو وحدد المنتج إن أمكن." },
              { type: "image_url", image_url: mediaUrl }
            ]
          }
        ]
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("🖼️ Vision Error:", err.message);
    return "ما قدرت أتعرف على الصورة للأسف 😅، ممكن تشرح لي أكثر؟";
  }
}

// ==========================
// 🔗 Analyze Product Links
// ==========================
async function analyzeProductLink(url) {
  try {
    const handle = url.split("/products/")[1]?.split("?")[0];
    if (!handle) return "الرابط غير واضح أو لا يخص منتج.";

    const res = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } }
    );

    const product = res.data.products.find(p => p.handle === handle);
    if (!product) return "ما حصلت هذا المنتج في المتجر.";

    const variant = product.variants?.[0];
    const available = variant?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌";

    return `📦 ${product.title}\n💰 السعر: ${variant?.price || "غير محدد"} ر.ع\n📦 الحالة: ${available}\n🚚 التوصيل: 1-5 أيام داخل عمان | 7-21 يوم للخليج.\n🛡️ الضمان: سنة واحدة على الأقل من تاريخ الشراء.`;
  } catch (err) {
    console.error("🔗 Link Analyzer Error:", err.message);
    return "واجهت مشكلة أثناء تحليل الرابط 😅.";
  }
}

// ==========================
// 🤖 Smart AI Reply
// ==========================
async function generateSmartReply(userMessage, from) {
  try {
    if (userMessage.includes("https://")) {
      return await analyzeProductLink(userMessage);
    }

    const lang = /[\u0600-\u06FF]/.test(userMessage) ? "ar" : "en";
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              lang === "ar"
                ? "أنت مساعد ذكي ودود من eSelect ترد باللهجة العمانية الرسمية حسب سياق العميل."
                : "You are a friendly AI assistant for eSelect, respond naturally."
          },
          { role: "user", content: userMessage }
        ]
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("🤖 AI Reply Error:", err.message);
    return "حدث خلل بسيط في النظام، حاول مرة أخرى بعد قليل 🙏";
  }
}

// ==========================
// 📩 Webhook
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body;
  if (!msg || !msg.data) return;

  const from = msg.data.from;
  const type = msg.data.type || "chat";
  const body = msg.data.body || "";
  const media = msg.data.media;
  let userMessage = body.trim();

  try {
    if (type === "audio" && media?.url) {
      userMessage = await transcribeAudio(media.url);
    } else if ((type === "image" || type === "video") && media?.url) {
      const reply = await analyzeMedia(media.url);
      await sendMessage(from, reply);
      await logToSheet(from, type, reply);
      return;
    }

    const reply = await generateSmartReply(userMessage, from);
    await sendMessage(from, reply);
    await logToSheet(from, userMessage, reply);
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    await sendMessage(from, "⚠️ حدث خطأ أثناء المعالجة، حاول مجددًا 🙏");
  }
});

// ==========================
// 🕒 Cron + Start Server
// ==========================
cron.schedule("*/30 * * * *", () => console.log("⏰ Bot active & synced"));
app.listen(PORT, () => console.log(`🚀 eSelect WhatsApp Bot v10.3 running on port ${PORT}`));
