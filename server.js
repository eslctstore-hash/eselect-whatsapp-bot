/**
 * eSelect | إي سيلكت
 * WhatsApp AI Bot v10.0 – Phase 1: Core Infrastructure Setup
 * إعداد: سالم السليمي | Elite Select SPC
 * التكامل: Shopify + Ultramsg + Google Drive + Google Sheets + OpenAI
 */

import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "@google-cloud/sheets";
import OpenAI from "openai";
import cron from "node-cron";

// =============================
// 🔧 إعداد الأساسيات
// =============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// =============================
// 🔑 المتغيرات الأساسية
// =============================
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;

// =============================
// 🤖 عميل OpenAI
// =============================
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// =============================
// ☁️ إعداد Google Drive + Sheets
// =============================
let serviceAccountCredentials = {};
try {
  const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  const credentialsJson = fs.readFileSync(credentialsPath, "utf8");
  serviceAccountCredentials = JSON.parse(credentialsJson);
  console.log("✅ Google credentials loaded.");
} catch (err) {
  console.error("❌ Failed to load Google credentials:", err.message);
}

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountCredentials,
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

// =============================
// 🧠 وظائف المساعدة الأساسية
// =============================
function detectLanguage(text) {
  const arabic = /[\u0600-\u06FF]/;
  return arabic.test(text) ? "ar" : "en";
}

async function sendMessage(to, body) {
  const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
  await axios.post(url, { token: ULTRAMSG_TOKEN, to, body });
  console.log(`💬 Sent to ${to}: ${body}`);
}

// =============================
// 🗂️ Google Sheets: حفظ المحادثة
// =============================
async function logToSheet(data) {
  try {
    const row = [
      new Date().toLocaleString("en-OM", { timeZone: "Asia/Muscat" }),
      data.name || "Unknown",
      data.phone,
      data.message,
      data.intent,
      data.response,
      data.language,
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: "Sheet1!A:G",
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    console.log("📊 Logged to Google Sheets.");
  } catch (err) {
    console.error("❌ Google Sheets Error:", err.message);
  }
}

// =============================
// 🧩 Webhook الرسائل من واتساب
// =============================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body;
  if (!msg?.data?.body || !msg?.data?.from) return;

  const from = msg.data.from;
  const text = msg.data.body.trim();
  const lang = detectLanguage(text);

  console.log(`📩 New message from ${from}: ${text}`);

  // 🔹 تحويل الصوت إلى نص (Whisper)
  if (msg.data.type === "audio") {
    try {
      const audioUrl = msg.data.mediaUrl;
      const response = await axios.get(audioUrl, { responseType: "arraybuffer" });
      const buffer = Buffer.from(response.data);
      const transcription = await openai.audio.transcriptions.create({
        file: buffer,
        model: "whisper-1",
      });
      console.log("🎧 Transcribed audio:", transcription.text);
    } catch (err) {
      console.error("❌ Audio Processing Error:", err.message);
    }
  }

  // 🔹 رد مبدئي بالذكاء الاصطناعي (placeholder)
  const aiResponse =
    lang === "ar"
      ? "هلا! كيف أقدر أساعدك اليوم؟ 😊"
      : "Hello! How can I assist you today? 😊";

  await sendMessage(from, aiResponse);

  await logToSheet({
    name: "Client",
    phone: from,
    message: text,
    intent: "General",
    response: aiResponse,
    language: lang,
  });
});

// =============================
// ⏱️ المهام المجدولة (تحديث الكاش لاحقًا)
// =============================
cron.schedule("*/30 * * * *", () => {
  console.log("🔄 Scheduled task running...");
});

// =============================
// 🚀 بدء التشغيل
// =============================
app.listen(PORT, () => console.log(`🚀 eSelect Bot v10.0 Phase 1 running on port ${PORT}`));
