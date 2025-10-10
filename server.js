// ==========================
// 🧠 eSelect WhatsApp Bot v3.11 (Full Knowledge Base Update)
// ==========================

import express from "express";
import axios from "axios";
import { google } from "googleapis";
import cron from "node-cron";
import stream from "stream";
import fs from 'fs';

// ... (CRASH HANDLER remains the same)
process.on('unhandledRejection', (reason, promise) => { console.error('CRITICAL ERROR: Unhandled Rejection at:', promise, 'reason:', reason); });
process.on('uncaughtException', (err, origin) => { console.error('CRITICAL ERROR: Uncaught Exception:', err, 'Origin:', origin); });

const app = express();
app.use(express.json());

// ... (Environment variables remain the same)
const PORT = process.env.PORT || 3000;
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// ... (System variables and Google Drive setup remain the same)
const lastMessages = new Map();
const userConversations = new Map();
const userSession = new Map();
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
const drive = google.drive({ version: "v3", auth: new google.auth.GoogleAuth({ credentials: serviceAccountCredentials, scopes: ["https://www.googleapis.com/auth/drive"] }) });

// ... (Helper functions remain the same)
function detectLanguage(text) { /* ... */ }
async function sendMessage(to, message) { /* ... */ }
async function saveConversationToDrive(customer, conversation) { /* ... */ }
async function getPreviousConversation(customer) { /* ... */ }
async function refreshShopifyCache() { /* ... */ }
function searchProductInCache(query, lang) { /* ... */ }
async function fetchOrderByNumber(orderNumber, lang) { /* ... */ }
async function fetchStorePolicy(keyword) { /* ... */ }

// ==========================
// 🤖 AI Reply Generator (with New Detailed Knowledge-Base)
// ==========================
async function generateAIReply(userMessage, conversationHistory, from) {
    if (shopifyCache.storeStatus === "maintenance") { return "يبدو أن المتجر حالياً في صيانة مؤقتة، يمكنك العودة لاحقاً. 🙏"; }

    const lang = detectLanguage(userMessage);
    const session = userSession.get(from) || {};

    const closingKeywords = ['thank', 'شكرا', 'مشكور', 'جزاك الله', 'ما قصرت', 'مع السلامة'];
    if (closingKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
        userSession.delete(from);
        return lang === 'ar' ? "العفو! في خدمتك دائمًا. إذا احتجت أي شيء آخر، فلا تتردد في التواصل معنا." : "You're welcome! Always here to help. If you need anything else, feel free to reach out.";
    }

    try {
        // === NEW DETAILED KNOWLEDGE BASE ===
        const knowledgeBase = `
         --- Knowledge Base for eSelect Store ---
         
         **About Us & Legal Info:**
         - Store Name: eSelect | إي سيلكت
         - Legal Owner: Elite Select SPC (شركة النخبة المختارة ش.ش.و)
         - Official Status: Licensed by the Ministry of Commerce, Industry and Investment Promotion in Oman.
         - Commercial Registration (CR) No.: 1397149
         - Our Mission: To provide a trusted, high-quality, and easy integrated shopping experience (digital and physical products).
         - Product Types: We sell licensed physical products (electronics, home appliances, cosmetics, clothing, sports gear, etc.) and digital products (gift cards, game currencies like coins/gems, app subscriptions, software, social media services, etc.).

         **Shipping & Delivery:**
         - Shipping Areas: We ship to all of Oman (via a local carrier) and all GCC countries (via international carriers).
         - Local (Oman) Delivery Time: 1 to 5 business days.
         - International/Imported Products Delivery Time: 7 to 21 business days.
         - Oman Shipping Fees: 2 OMR for online payments. 3 OMR for Cash on Delivery (includes a 1 OMR COD service fee).
         - GCC Shipping Fees: Calculated automatically at checkout based on country, location, and product.
         - Order Tracking: A tracking number is sent via email and WhatsApp once the order is shipped.

         **Return & Refund Policy:**
         - Return Window: Physical products can be returned within 14 days of receipt.
         - Return Conditions: Product must be in its original, unused condition, with all tags and original packaging.
         - **NON-RETURNABLE PRODUCTS:** **ALL DIGITAL PRODUCTS ARE FINAL SALE**. This includes codes, gift cards, subscriptions, game accounts, social media services, etc. They CANNOT be returned or refunded. Also, discounted, health, beauty, or personal items are non-returnable unless there's a proven manufacturing defect.
         - Return Process: Contact customer service to get approval and return instructions.
         - Return Fees (Customer Fault): If the return reason is from the customer, a 5% service fee + shipping costs will be deducted.
         - Refund Time: Takes 3-5 business days for internal processing, plus 3-14 business days for the payment gateway/bank to process the refund.

         **Pricing & Fees Policy:**
         - Payment Gateway Fee: A 3% fee is added to the total order value. This is a fee from the payment gateway provider.
         - Cash on Delivery (COD) Fee: An additional 1 OMR is charged for COD service in Oman.
         - Prices are subject to change based on supply/demand and supplier costs.

         **Contact Information:**
         - General Inquiries Email: info@eselect.store
         - Customer Service & Order Notifications WhatsApp: +96894682186
         - Direct Contact Number (Local/International - No WhatsApp): +96879303771

         **General Rules:**
         - You cannot see images.
         - To check an order status, the user must provide an order number.
         --------------------`;

        const prompts = {
            ar: `أنت مساعد خبير وممثل خدمة عملاء لمتجر "eSelect" في سلطنة عمان.
            شخصيتك: دقيق جدًا، واثق، ودود، ومتعاون.
            
            قواعدك الصارمة:
            1.  **اعتمد على قاعدة المعرفة فقط:** مهمتك الأساسية هي الإجابة على أسئلة العملاء بدقة **باستخدام المعلومات المتوفرة حصريًا في "Knowledge Base"**. لا تقدم أي معلومة غير موجودة فيها.
            2.  **كن محددًا:** عند الإجابة، كن مباشرًا وقدم التفاصيل كما هي في قاعدة المعرفة (مثل رسوم الشحن، مدة الإرجاع، المنتجات غير القابلة للاسترداد).
            3.  **إذا كانت المعلومة غير موجودة:** إذا سأل العميل عن شيء غير موجود في قاعدة المعرفة، قل بوضوح "لا أمتلك هذه المعلومة حاليًا، ولكن يمكنني مساعدتك في شيء آخر". لا تخترع إجابات أبدًا.
            4.  **المنتجات:** للأسئلة العامة عن المنتجات، قم بدعوة العميل لزيارة الموقع. للأسئلة عن منتج معين، استخدم أداة البحث.
            5.  **فهم النية واللهجة:** تعاطف مع العميل المحبط قبل الإجابة. استخدم لهجة خليجية/عمانية طبيعية في ردودك.
            6.  **حافظ على السياق:** واصل الحوار بشكل طبيعي ولا تكرر التحية.`,
            en: `You are an expert customer service representative for "eSelect", a store in Oman.
            Your Persona: Highly accurate, confident, friendly, and collaborative.
            
            Your Strict Rules:
            1.  **Rely ONLY on the Knowledge Base:** Your primary mission is to accurately answer questions using **information exclusively from the "Knowledge Base"**. Do not provide any information not listed there.
            2.  **Be Specific:** When answering, be direct and provide details as they are in the knowledge base (e.g., shipping fees, return window, non-refundable items).
            3.  **If Information is Missing:** If a customer asks something not covered, clearly state "I don't have that information right now, but I can help with something else." Never invent answers.
            4.  **Products:** For general product questions, refer the user to the website. For specific products, use the search tool.
            5.  **Intent & Tone:** Empathize with frustrated users first. Maintain a natural, context-aware conversation.
            6.  Use the conversation history to understand the dialogue.`
        };

        const messages = [ { role: "system", content: prompts[lang] + knowledgeBase } ];
        
        if (conversationHistory.length > 0) {
            messages.push({ role: "system", content: `Recent conversation history for context:\n${conversationHistory}` });
        }
        
        messages.push({ role: "user", content: userMessage });

        const response = await axios.post("https://api.openai.com/v1/chat/completions",
            { model: "gpt-4o", messages, max_tokens: 500 },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );

        let aiReply = response.data.choices[0].message.content.trim();
        
        const orderMatch = userMessage.match(/#?\d{3,6}/);
        if (orderMatch) {
            const orderNumber = orderMatch[0];
            const orderStatus = await fetchOrderByNumber(orderNumber, lang);
            aiReply += `\n\n${orderStatus}`;
            session.lastOrderNumber = orderNumber;
            userSession.set(from, session);
        }
        
        session.history = (session.history || []).slice(-4); 
        session.history.push({role: 'user', content: userMessage});
        session.history.push({role: 'assistant', content: aiReply});
        userSession.set(from, session);

        return aiReply;

    } catch (err) {
        console.error("ChatGPT Error:", err.message);
        const errorReply = { ar: "⚠️ حدث خلل مؤقت في النظام. حاول لاحقًا.", en: "⚠️ A temporary system error occurred. Please try again later."};
        return errorReply[lang];
    }
}

// ... (Rest of the file remains unchanged. Full helper functions and webhook handler below for completeness.)

// Full helper functions
function detectLanguage(text) { const arabicRegex = /[\u0600-\u06FF]/; return arabicRegex.test(text) ? 'ar' : 'en'; }
async function sendMessage(to, message) { try { const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`; const response = await axios.post(url, { token: ULTRAMSG_TOKEN, to, body: message }); console.log(`✅ Sent to ${to}: ${message}`); console.log(">>> Ultramsg API Response:", JSON.stringify(response.data)); } catch (err) { console.error("❌ Send Error:", err.response?.data || err.message); } }
async function saveConversationToDrive(customer, conversation) { if (!GOOGLE_DRIVE_FOLDER_ID || !serviceAccountCredentials.client_email) return; try { const fileName = `${customer}_${new Date().toISOString().split("T")[0]}.txt`; const fileMetadata = { name: fileName, parents: [GOOGLE_DRIVE_FOLDER_ID] }; const media = { mimeType: "text/plain", body: new stream.Readable({ read() { this.push(conversation); this.push(null); } }) }; await drive.files.create({ resource: fileMetadata, media: media, fields: "id", supportsAllDrives: true, }); console.log(`📑 Conversation for ${customer} saved to Google Drive.`); } catch (err) { console.error("❌ Google Drive Save Error:", err.message); } }
async function getPreviousConversation(customer) { if (!GOOGLE_DRIVE_FOLDER_ID || !serviceAccountCredentials.client_email) return ""; try { const res = await drive.files.list({ q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name contains '${customer}'`, fields: "files(id, name)", orderBy: "createdTime desc", pageSize: 1, supportsAllDrives: true, }); if (res.data.files.length > 0) { const fileId = res.data.files[0].id; const file = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }); return typeof file.data === 'string' ? file.data : JSON.stringify(file.data); } return ""; } catch (err) { console.error("❌ Google Drive Fetch Error:", err.message); return ""; } }
async function refreshShopifyCache() { try { const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`; const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } }); shopifyCache.products = res.data.products; shopifyCache.storeStatus = "open"; console.log("🔄 Shopify cache updated successfully."); } catch (err) { shopifyCache.storeStatus = "maintenance"; console.error("⚠️ Shopify store is currently unavailable. Error: " + (err.response?.data?.errors || err.message)); } }
function searchProductInCache(query, lang) { const replies = { ar: "لم أجد هذا المنتج في المتجر.", en: "I couldn't find this product in the store." }; const product = shopifyCache.products.find((p) => p.title.toLowerCase().includes(query.toLowerCase())); if (product) { const variant = product.variants?.[0]; const available = variant?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌"; return `📦 المنتج: ${product.title}\n💰 السعر: ${variant?.price || "غير محدد"} ر.ع\n📦 الحالة: ${available}`; } return replies[lang]; }
async function fetchOrderByNumber(orderNumber, lang) { const replies = { ar: { not_found: "⚠️ لم أجد أي طلب بهذا الرقم.", error: "⚠️ تعذر التحقق من الطلب حالياً." }, en: { not_found: "⚠️ I couldn't find an order with this number.", error: "⚠️ Could not check the order status at this time." } }; try { const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders.json?name=${orderNumber.replace("#", "")}`; const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } }); if (res.data.orders?.length > 0) { const o = res.data.orders[0]; const status = o.fulfillment_status || "Processing"; const total = o.total_price; const currency = o.currency; if (lang === 'ar') { return `🔎 حالة طلبك ${o.name}: ${status}\n💰 المجموع: ${total} ${currency}`; } else { return `🔎 Order status for ${o.name}: ${status}\n💰 Total: ${total} ${currency}`; } } else return replies[lang].not_found; } catch { return replies[lang].error; } }
async function fetchStorePolicy(keyword) { const map = { "الشحن": "shipping", "الإرجاع": "return", "الخصوصية": "privacy", "الشروط": "terms", "shipping": "shipping", "return": "return", "privacy": "privacy", "terms": "terms" }; const handle = map[keyword.toLowerCase()]; if (!handle) return null; try { const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/pages.json`; const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } }); const page = res.data.pages.find((p) => p.handle.includes(handle)); return page ? `📘 ${keyword}:\n${page.body_html.replace(/<[^>]*>?/gm, "").slice(0, 400)}...` : null; } catch { return null; } }
app.post("/webhook", async (req, res) => { res.sendStatus(200); const msg = req.body; if (!msg || !msg.data?.body || !msg.data?.from) return; const from = msg.data.from; const text = msg.data.body.trim(); if (text.includes("eSelect") || text.includes("⚠️")) return; if (!lastMessages.has(from)) lastMessages.set(from, []); lastMessages.get(from).push(text); console.log(`📩 رسالة جديدة من ${from}: ${text}`); lastResponseTime.set(from, Date.now()); setTimeout(async () => { const lastTime = lastResponseTime.get(from); if (Date.now() - lastTime >= REPLY_DELAY_MS) { if (!lastMessages.has(from) || lastMessages.get(from).length === 0) return; const allMsgsText = lastMessages.get(from).join(" "); lastMessages.delete(from); const session = userSession.get(from) || {}; const recentHistory = (session.history || []).map(h => `${h.role}: ${h.content}`).join('\n'); console.log(`🧠 معالجة ${from}: ${allMsgsText}`); const reply = await generateAIReply(allMsgsText, recentHistory, from); if (reply) { const fullHistoryForDrive = userConversations.get(from) || await getPreviousConversation(from); const newConversation = `${fullHistoryForDrive}\nالعميل: ${allMsgsText}\nالبوت: ${reply}`; userConversations.set(from, newConversation); await sendMessage(from, reply); await saveConversationToDrive(from, newConversation); } } }, REPLY_DELAY_MS); });
cron.schedule("*/30 * * * *", refreshShopifyCache);
cron.schedule("0 3 * * 5", async () => { console.log("🦾 Starting weekly training and reporting cycle..."); });
app.listen(PORT, () => { console.log(`🚀 eSelect WhatsApp Bot is running on port ${PORT}`); refreshShopifyCache(); });
