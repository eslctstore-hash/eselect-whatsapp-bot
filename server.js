// ==========================
// 🧠 eSelect WhatsApp Bot v3.6 (Smarter & More Efficient)
// ==========================

import express from "express";
import axios from "axios";
import { google } from "googleapis";
import cron from "node-cron";
import stream from "stream";
import fs from 'fs';

// ... (معالج الأخطاء يبقى كما هو)
process.on('unhandledRejection', (reason, promise) => { console.error('CRITICAL ERROR: Unhandled Rejection at:', promise, 'reason:', reason); });
process.on('uncaughtException', (err, origin) => { console.error('CRITICAL ERROR: Uncaught Exception:', err, 'Origin:', origin); });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
// ... (باقي متغيرات البيئة كما هي)
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const lastMessages = new Map();
const userConversations = new Map();
const userSession = new Map(); // <-- ذاكرة مؤقتة جديدة
const lastResponseTime = new Map();
const shopifyCache = { products: [], storeStatus: "open" };
const REPLY_DELAY_MS = 10000;

// ... (إعداد Google Drive يبقى كما هو)
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
const drive = google.drive({ version: "v3", auth: new google.auth.GoogleAuth({ credentials: serviceAccountCredentials, scopes: ["https://www.googleapis.com/auth/drive"] }) });


// ... (الدوال المساعدة تبقى كما هي)
function detectLanguage(text) { const arabicRegex = /[\u0600-\u06FF]/; return arabicRegex.test(text) ? 'ar' : 'en'; }
async function sendMessage(to, message) { /* ... no changes ... */ 
    try {
        const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
        const response = await axios.post(url, { token: ULTRAMSG_TOKEN, to, body: message });
        console.log(`✅ Sent to ${to}: ${message}`);
        console.log(">>> Ultramsg API Response:", JSON.stringify(response.data));
    } catch (err) {
        console.error("❌ Send Error:", err.response?.data || err.message);
    }
}
async function saveConversationToDrive(customer, conversation) { /* ... no changes ... */ 
    if (!GOOGLE_DRIVE_FOLDER_ID || !serviceAccountCredentials.client_email) return;
    try {
        const fileName = `${customer}_${new Date().toISOString().split("T")[0]}.txt`;
        const fileMetadata = { name: fileName, parents: [GOOGLE_DRIVE_FOLDER_ID] };
        const media = { mimeType: "text/plain", body: new stream.Readable({ read() { this.push(conversation); this.push(null); } }) };
        await drive.files.create({ resource: fileMetadata, media: media, fields: "id", supportsAllDrives: true, });
        console.log(`📑 Conversation for ${customer} saved to Google Drive.`);
    } catch (err) { console.error("❌ Google Drive Save Error:", err.message); }
}
async function getPreviousConversation(customer) { /* ... no changes ... */
    if (!GOOGLE_DRIVE_FOLDER_ID || !serviceAccountCredentials.client_email) return "";
    try {
        const res = await drive.files.list({ q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name contains '${customer}'`, fields: "files(id, name)", orderBy: "createdTime desc", pageSize: 1, supportsAllDrives: true, });
        if (res.data.files.length > 0) {
            const fileId = res.data.files[0].id;
            const file = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true });
            return typeof file.data === 'string' ? file.data : JSON.stringify(file.data);
        } return "";
    } catch (err) { console.error("❌ Google Drive Fetch Error:", err.message); return ""; }
}
async function refreshShopifyCache() { /* ... no changes ... */ 
    try {
        const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
        const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } });
        shopifyCache.products = res.data.products;
        shopifyCache.storeStatus = "open";
        console.log("🔄 Shopify cache updated successfully.");
    } catch (err) {
        shopifyCache.storeStatus = "maintenance";
        console.error("⚠️ Shopify store is currently unavailable. Error: " + (err.response?.data?.errors || err.message));
    }
}


// === تعديل الدوال لتكون متعددة اللغات ===
function searchProductInCache(query, lang) {
    const replies = {
        ar: "لم أجد هذا المنتج في المتجر.",
        en: "I couldn't find this product in the store."
    };
    const product = shopifyCache.products.find((p) => p.title.toLowerCase().includes(query.toLowerCase()));
    if (product) {
        const variant = product.variants?.[0];
        const available = variant?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌";
        return `📦 المنتج: ${product.title}\n💰 السعر: ${variant?.price || "غير محدد"} ر.ع\n📦 الحالة: ${available}`;
    }
    return replies[lang];
}

async function fetchOrderByNumber(orderNumber, lang) {
    const replies = {
        ar: { not_found: "⚠️ لم أجد أي طلب بهذا الرقم.", error: "⚠️ تعذر التحقق من الطلب حالياً." },
        en: { not_found: "⚠️ I couldn't find an order with this number.", error: "⚠️ Could not check the order status at this time." }
    };
    try {
        const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders.json?name=${orderNumber.replace("#", "")}`;
        const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } });
        if (res.data.orders?.length > 0) {
            const o = res.data.orders[0];
            const status = o.fulfillment_status || "Processing";
            const total = o.total_price;
            const currency = o.currency;
            if (lang === 'ar') {
                return `🔎 حالة طلبك ${o.name}: ${status}\n💰 المجموع: ${total} ${currency}`;
            } else {
                return `🔎 Order status for ${o.name}: ${status}\n💰 Total: ${total} ${currency}`;
            }
        } else return replies[lang].not_found;
    } catch {
        return replies[lang].error;
    }
}
// ... (fetchStorePolicy لا تحتاج تعديل لأنها تجلب المحتوى كما هو)
async function fetchStorePolicy(keyword) { /* ... no changes ... */ }

// === تعديل دالة الرد الذكي لتكون أكثر ذكاءً ===
async function generateAIReply(userMessage, previousContext, from) {
    if (shopifyCache.storeStatus === "maintenance") {
        return "يبدو أن المتجر حالياً في صيانة مؤقتة، يمكنك العودة لاحقاً. 🙏";
    }

    const lang = detectLanguage(userMessage);

    // التحقق من عبارات الشكر والختام أولاً
    const closingKeywords = ['thank', 'شكرا', 'مشكور', 'جزاك الله', 'ما قصرت'];
    if (closingKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
        return lang === 'ar' ? "العفو! في خدمتك دائمًا." : "You're welcome! Always here to help.";
    }

    try {
        let orderMatch = userMessage.match(/#?\d{3,6}/);
        
        // التحقق من الذاكرة المؤقتة إذا لم يتم العثور على رقم طلب
        if (!orderMatch) {
            const orderKeywords = lang === 'ar' ? ['طلبي', 'الطلب'] : ['my order', 'the order'];
            if (orderKeywords.some(kw => userMessage.toLowerCase().includes(kw))) {
                const session = userSession.get(from);
                if (session?.lastOrderNumber) {
                    orderMatch = [session.lastOrderNumber];
                }
            }
        }

        if (orderMatch) {
            const orderNumber = orderMatch[0];
            userSession.set(from, { lastOrderNumber: orderNumber }); // حفظ الرقم في الذاكرة
            return await fetchOrderByNumber(orderNumber, lang);
        }

        if (userMessage.includes("منتج") || userMessage.includes("product") || userMessage.includes("price")) {
            const query = userMessage.replace(/(منتج|سعر|كم|عن|product|price|about)/gi, "").trim();
            if (query.length > 2) return searchProductInCache(query, lang);
        }

        const policies = ["الشحن", "الإرجاع", "الخصوصية", "الشروط", "shipping", "return", "privacy", "terms"];
        for (const k of policies) {
            if (userMessage.toLowerCase().includes(k)) {
                const policy = await fetchStorePolicy(k);
                if (policy) return policy;
            }
        }
        
        const prompts = {
            ar: `أنت مساعد ذكي لمتجر eSelect | إي سيلكت في عمان...`, // (نفس النص السابق)
            en: `You are a helpful AI assistant for eSelect, a store in Oman...` // (نفس النص السابق)
        };

        const messages = [{ role: "system", content: prompts[lang] }];
        if(previousContext){ messages.push({ role: "system", content: `Previous conversation:\n${previousContext}`}); }
        messages.push({ role: "user", content: userMessage });

        const response = await axios.post("https://api.openai.com/v1/chat/completions",
            { model: "gpt-4o-mini", messages, max_tokens: 300 },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );
        return response.data.choices[0].message.content.trim();
    } catch (err) {
        console.error("ChatGPT Error:", err.message);
        const errorReply = { ar: "⚠️ حدث خلل مؤقت في النظام. حاول لاحقًا.", en: "⚠️ A temporary system error occurred. Please try again later."};
        return errorReply[lang];
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
            if (!lastMessages.has(from) || lastMessages.get(from).length === 0) return;
            const allMsgsText = lastMessages.get(from).join(" ");
            lastMessages.delete(from);
            let previousContext = userConversations.get(from) || await getPreviousConversation(from);
            console.log(`🧠 معالجة ${from}: ${allMsgsText}`);
            // تمرير "from" إلى دالة الرد للاستفادة من الذاكرة المؤقتة
            const reply = await generateAIReply(allMsgsText, previousContext, from);
            if (reply) {
                const newConversation = `${previousContext}\nالعميل: ${allMsgsText}\nالبوت: ${reply}`;
                userConversations.set(from, newConversation);
                await sendMessage(from, reply);
                await saveConversationToDrive(from, newConversation);
            }
        }
    }, REPLY_DELAY_MS);
});

// ... (باقي الكود يبقى كما هو)
cron.schedule("*/30 * * * *", refreshShopifyCache);
cron.schedule("0 3 * * 5", async () => { console.log("🦾 Starting weekly training and reporting..."); });
app.listen(PORT, () => {
    console.log(`🚀 eSelect WhatsApp Bot is running on port ${PORT}`);
    refreshShopifyCache();
});
