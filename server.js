const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// ============ GOOGLE DRIVE CONFIG ============
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync("eselect-bot-storage-3268fdefd526.json", "utf8")),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// ============ MEMORY ============
const memoryFileId = "1VrfDaD-T-3UptZXVILYvrDVnmzmq7g0E";
let messageCache = {};
let lastMessageTime = {};

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ============ SEND MESSAGE ============
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

// ============ CHATGPT RESPONSE ============
async function getChatGPTResponse(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `أنت ماسعود، مساعد eSelect الذكي باللهجة العمانية. تجاوب بطريقة ودودة ومهذبة. إذا تكررت الأسئلة لا تكرر نفس الرد.`,
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

// ============ SHOPIFY ORDER ============
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

// ============ SHOPIFY PRODUCTS ============
async function searchProducts(query) {
  try {
    const res = await axios.get(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/products.json?title=${encodeURIComponent(query)}`,
      { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN } }
    );
    const items = res.data.products;
    if (!items.length) return "ما حصلت منتجات بهذا الاسم.";
    const p = items[0];
    return `📦 ${p.title}\n💰 ${p.variants[0].price} OMR\n🔗 https://eselect.store/products/${p.handle}`;
  } catch (err) {
    console.error("❌ Shopify Error:", err.message);
    return "⚠️ ما قدرت أجيب بيانات المنتجات.";
  }
}

// ============ WEBHOOK ============
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const { from, body } = req.body;
  if (!from || !body) return;
  console.log(`📩 رسالة جديدة من ${from}: ${body}`);

  const now = Date.now();
  lastMessageTime[from] = now;
  if (!messageCache[from]) messageCache[from] = [];
  messageCache[from].push(body.trim());

  await delay(10000);
  if (Date.now() - lastMessageTime[from] < 10000) return;

  const fullMessage = messageCache[from].join(" ");
  messageCache[from] = [];
  console.log(`🧠 معالجة ${from}: ${fullMessage}`);

  let reply;
  if (/(\d{3,6})/.test(fullMessage)) {
    const id = fullMessage.match(/(\d{3,6})/)[0];
    reply = await getOrderStatus(id);
  } else if (/منتج|منتجات|سعر|كم|يتوفر/.test(fullMessage)) {
    reply = await searchProducts(fullMessage);
  } else {
    reply = await getChatGPTResponse(fullMessage);
  }

  await sendMessage(from, reply);

  // حفظ المحادثة في Google Drive
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

// ============ HOME ============
app.get("/", (req, res) => {
  res.send("🚀 eSelect | Masoud AI Bot يعمل بنجاح!");
});

// ============ RUN ============
app.listen(PORT, () => console.log(`🚀 eSelect Bot يعمل على المنفذ ${PORT}`));
