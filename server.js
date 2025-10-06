import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import fs from "fs";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// ============ GOOGLE DRIVE CONFIG ============
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync("eselect-bot-storage-3268fdefd526.json", "utf8")),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// ============ MEMORY & CACHE ============
const memoryFileId = "1VrfDaD-T-3UptZXVILYvrDVnmzmq7g0E";
let messageCache = {};
let userMemory = {}; // محفوظ في الذاكرة و Drive

// تحميل البيانات من Google Drive عند بدء السيرفر
async function loadMemory() {
  try {
    const res = await drive.files.list({ q: `'${memoryFileId}' in parents` });
    console.log("📁 ذاكرة Google Drive متصلة:", res.data.files.length);
  } catch (err) {
    console.error("⚠️ فشل تحميل الذاكرة:", err.message);
  }
}
loadMemory();

// ============ HELPER FUNCTIONS ============
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendMessage(to, message) {
  try {
    await axios.post(`https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`, {
      token: process.env.ULTRAMSG_TOKEN,
      to,
      body: message,
    });
    console.log(`✅ أُرسلت إلى ${to}: ${message.slice(0, 60)}...`);
  } catch (err) {
    console.error("❌ فشل الإرسال:", err.response?.data || err.message);
  }
}

async function getChatGPTResponse(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `أنت ماسعود، مساعد متجر eSelect الذكي. 
            تجاوب باللهجة العمانية بأسلوب ودود. 
            تجيب عن المنتجات، الطلبات، الأسعار، الضمان، الدفع، والشحن.
            إذا المنتج أو الطلب غير متوفر، قل "ما متوفر حاليا".
            لا ترد بكلمة "كيف يمكنني مساعدتك اليوم؟" أكثر من مرة بالمحادثة الواحدة.`,
          },
          { role: "user", content: prompt },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    return res.data.choices[0].message.content;
  } catch (err) {
    console.error("⚠️ خطأ من OpenAI:", err.response?.data || err.message);
    return "⚠️ صار خلل مؤقت في النظام. حاول مرة ثانية.";
  }
}

async function getOrderStatus(orderId) {
  try {
    const res = await axios.get(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/orders/${orderId}.json`,
      { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN } }
    );
    const o = res.data.order;
    return `🔎 حالة طلبك #${o.id}: ${o.fulfillment_status || "قيد المعالجة"}\n💰 المجموع: ${o.total_price} ${o.currency}`;
  } catch {
    return "❌ لم أجد طلب بهذا الرقم.";
  }
}

async function searchProducts(query) {
  try {
    const res = await axios.get(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/products.json?title=${encodeURIComponent(query)}`,
      { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN } }
    );
    const items = res.data.products;
    if (!items.length) return "لم أجد هذا المنتج في المتجر.";
    const first = items[0];
    return `📦 المنتج: ${first.title}\n💰 السعر: ${first.variants[0].price} ${first.variants[0].currency || "OMR"}\n🔗 ${first.online_store_url || "https://eselect.store"}`;
  } catch {
    return "⚠️ ما قدرت أوصل لبيانات المنتجات حالياً.";
  }
}

// ============ CORE BOT LOGIC ============
const lastMessageTime = {};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const data = req.body;
  const from = data.from;
  const message = data.body?.trim();

  if (!from || !message) return;
  console.log(`📩 رسالة جديدة من ${from}: ${message}`);

  const now = Date.now();
  lastMessageTime[from] = now;

  if (!messageCache[from]) messageCache[from] = [];
  messageCache[from].push(message);

  await delay(10000);

  if (Date.now() - lastMessageTime[from] < 10000) return; // لا ترد إذا أرسل بعدها

  const fullMessage = messageCache[from].join(" ");
  messageCache[from] = [];

  console.log(`🧠 معالجة ${from}: ${fullMessage}`);

  // تحليل نوع الرسالة
  let reply;
  if (/(\d{3,6})/.test(fullMessage)) {
    const orderId = fullMessage.match(/(\d{3,6})/)[0];
    reply = await getOrderStatus(orderId);
  } else if (/منتج|منتجات|سعر|كم|يتوفر/.test(fullMessage)) {
    reply = await searchProducts(fullMessage);
  } else {
    reply = await getChatGPTResponse(fullMessage);
  }

  await sendMessage(from, reply);

  // حفظ في Google Drive
  try {
    await drive.files.create({
      requestBody: {
        name: `chat-${from}-${Date.now()}.txt`,
        parents: [memoryFileId],
      },
      media: {
        mimeType: "text/plain",
        body: `From: ${from}\n\n${fullMessage}\n\nReply:\n${reply}`,
      },
    });
  } catch (err) {
    console.error("⚠️ فشل الحفظ في Drive:", err.message);
  }
});

// ============ DEFAULT ROUTE ============
app.get("/", (req, res) => {
  res.send("🚀 eSelect | Masoud AI Bot يعمل بنجاح!");
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`🚀 eSelect | Masoud AI Bot يعمل على المنفذ ${PORT}`);
});
