// ==========================
// 🧠 eSelect WhatsApp Bot v3.2 (Final Drive Fix)
// Powered by Ultramsg + ChatGPT + Shopify + Google Drive
// ==========================

import express from "express";
import axios from "axios";
import { google } from "googleapis";
import cron from "node-cron";
import stream from "stream";
import fs from 'fs';

const app = express();
app.use(express.json());

// ... (باقي المتغيرات كما هي)
const PORT = process.env.PORT || 3000;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const lastMessages = new Map();
const userConversations = new Map();
const lastResponseTime = new Map();
const shopifyCache = { products: [], storeStatus: "open" };
const REPLY_DELAY_MS = 10000;

let serviceAccountCredentials = {};
const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

if (credentialsPath) {
  try {
    const credentialsJson = fs.readFileSync(credentialsPath, 'utf8');
    serviceAccountCredentials = JSON.parse(credentialsJson);
    console.log("✅ Google Drive credentials loaded successfully.");
  } catch (error) {
    console.error("❌ Fatal Error: Could not read or parse the Google credentials file.", error);
    process.exit(1);
  }
} else {
  console.warn("⚠️ Warning: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS path not set. Google Drive features will be disabled.");
}

const drive = google.drive({
  version: "v3",
  auth: new google.auth.GoogleAuth({
    credentials: serviceAccountCredentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  }),
});

async function sendMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: message,
    });
    console.log(`✅ Sent to ${to}: ${message}`);
  } catch (err) {
    console.error("❌ Send Error:", err.response?.data || err.message);
  }
}

async function saveConversationToDrive(customer, conversation) {
  if (!GOOGLE_DRIVE_FOLDER_ID || !serviceAccountCredentials.client_email) return;
  try {
    const fileName = `${customer}_${new Date().toISOString().split("T")[0]}.txt`;
    const fileMetadata = {
      name: fileName,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
    };
    const media = {
      mimeType: "text/plain",
      body: new stream.Readable({
        read() {
          this.push(conversation);
          this.push(null);
        },
      }),
    };
    // === التعديل هنا ===
    await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
      supportsAllDrives: true, // <-- تم إضافة هذا السطر
    });
    // ===================
    console.log(`📑 Conversation for ${customer} saved to Google Drive.`);
  } catch (err) {
    console.error("❌ Google Drive Save Error:", err.message);
  }
}

async function getPreviousConversation(customer) {
  if (!GOOGLE_DRIVE_FOLDER_ID || !serviceAccountCredentials.client_email) return "";
  try {
    const res = await drive.files.list({
      q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name contains '${customer}'`,
      fields: "files(id, name)",
      orderBy: "createdTime desc",
      pageSize: 1,
      supportsAllDrives: true, // إضافة احترازية هنا أيضاً
    });
    if (res.data.files.length > 0) {
      const fileId = res.data.files[0].id;
      const file = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }); // إضافة احترازية هنا أيضاً
      return typeof file.data === 'string' ? file.data : JSON.stringify(file.data);
    }
    return "";
  } catch (err) {
    console.error("❌ Google Drive Fetch Error:", err.message);
    return "";
  }
}

// ... (باقي الكود الخاص بـ Shopify و ChatGPT والـ Webhook كما هو بدون تغيير)
// ... (The rest of the Shopify, ChatGPT, and Webhook code remains unchanged)

async function refreshShopifyCache() {
  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });
    shopifyCache.products = res.data.products;
    shopifyCache.storeStatus = "open";
    console.log("🔄 Shopify cache updated successfully.");
  } catch (err) {
    shopifyCache.storeStatus = "maintenance";
    console.error("⚠️ Shopify store is currently unavailable. Error: " + (err.response?.data?.errors || err.message));
  }
}

function searchProductInCache(query) {
  const product = shopifyCache.products.find((p) =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );

  if (product) {
    const variant = product.variants?.[0];
    const available = variant?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌";
    return `📦 المنتج: ${product.title}\n💰 السعر: ${variant?.price || "غير محدد"} ر.ع\n📦 الحالة: ${available}`;
  }
  return "لم أجد هذا المنتج في المتجر.";
}

async function fetchOrderByNumber(orderNumber) {
    try {
        const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders.json?name=${orderNumber}`;
        const res = await axios.get(url, {
            headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
        });

        if (res.data.orders?.length > 0) {
            const o = res.data.orders[0];
            const status = o.fulfillment_status || "قيد المعالجة";
            const total = o.total_price;
            const currency = o.currency;
            return `🔎 حالة طلبك ${o.name}: ${status}\n💰 المجموع: ${total} ${currency}`;
        } else return "⚠️ لم أجد أي طلب بهذا الرقم.";
    } catch {
        return "⚠️ تعذر التحقق من الطلب حالياً.";
    }
}

async function fetchStorePolicy(keyword) {
    const map = { "الشحن": "shipping", "الإرجاع": "return", "الخصوصية": "privacy", "الشروط": "terms" };
    const handle = map[keyword];
    if (!handle) return null;

    try {
        const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/pages.json`;
        const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } });
        const page = res.data.pages.find((p) => p.handle.includes(handle));
        return page ? `📘 سياسة ${keyword}:\n${page.body_html.replace(/<[^>]*>?/gm, "").slice(0, 400)}...` : null;
    } catch {
        return null;
    }
}

async function generateAIReply(userMessage, previousContext) {
    if (shopifyCache.storeStatus === "maintenance") {
        return "يبدو أن المتجر حالياً في صيانة مؤقتة، يمكنك العودة لاحقاً. 🙏";
    }

    try {
        const orderMatch = userMessage.match(/#?\d{3,6}/);
        if (orderMatch) return await fetchOrderByNumber(orderMatch[0].replace("#", ""));

        if (userMessage.includes("منتج") || userMessage.includes("سعر") || userMessage.includes("متوفر")) {
            const query = userMessage.replace(/(منتج|سعر|كم|عن)/g, "").trim();
            if (query.length > 2) return searchProductInCache(query);
        }

        const policies = ["الشحن", "الإرجاع", "الخصوصية", "الشروط"];
        for (const k of policies) {
            if (userMessage.includes(k)) {
                const policy = await fetchStorePolicy(k);
                if (policy) return policy;
            }
        }
        
        const messages = [
            {
                role: "system",
                content: `أنت مساعد ذكي لمتجر eSelect | إي سيلكت في عمان. تتحدث بلغة ودودة وتجيب على استفسارات الزبائن. لا تذكر أي متاجر أخرى.`
            }
        ];

        if(previousContext){
            messages.push({ role: "system", content: "هذه محادثة سابقة مع نفس العميل:\n" + previousContext});
        }
        
        messages.push({ role: "user", content: userMessage });

        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages,
                max_tokens: 300,
            },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );

        return response.data.choices[0].message.content.trim();
    } catch (err) {
        console.error("ChatGPT Error:", err.message);
        return "⚠️ حدث خلل مؤقت في النظام. حاول لاحقًا.";
    }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body;

    if (!msg || !msg.data?.body || !msg.data?.from) return;

    const from = msg.data.from;
    const text = msg.data.body.trim();

    if (text.includes("eSelect") || text.includes("⚠️")) return;

    if (!lastMessages.has(from)) lastMessages.set(from, []);
    lastMessages.get(from).push(text);

    console.log(`📩 رسالة جديدة من ${from}: ${text}`);
    lastResponseTime.set(from, Date.now());

    setTimeout(async () => {
        const lastTime = lastResponseTime.get(from);
        if (Date.now() - lastTime >= REPLY_DELAY_MS) {
            const allMsgsText = lastMessages.get(from).join(" ");
            lastMessages.delete(from);
            
            let previousContext = userConversations.get(from) || await getPreviousConversation(from);

            console.log(`🧠 معالجة ${from}: ${allMsgsText}`);
            const reply = await generateAIReply(allMsgsText, previousContext);
            
            const newConversation = `${previousContext}\nالعميل: ${allMsgsText}\nالبوت: ${reply}`;
            userConversations.set(from, newConversation);
            
            await sendMessage(from, reply);
            
            await saveConversationToDrive(from, newConversation);
        }
    }, REPLY_DELAY_MS);
});

cron.schedule("*/30 * * * *", refreshShopifyCache);

cron.schedule("0 3 * * 5", async () => {
    console.log("🦾 Starting weekly training and reporting...");
});

app.listen(PORT, () => {
    console.log(`🚀 eSelect WhatsApp Bot is running on port ${PORT}`);
    refreshShopifyCache();
});
