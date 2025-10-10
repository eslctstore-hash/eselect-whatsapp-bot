// ==========================
// 🧠 eSelect WhatsApp Bot v3.7 (Advanced Context & Intelligence)
// ==========================

import express from "express";
import axios from "axios";
// ... (باقي الـ imports كما هي)
import { google } from "googleapis";
import cron from "node-cron";
import stream from "stream";
import fs from 'fs';

// ... (معالج الأخطاء يبقى كما هو)
process.on('unhandledRejection', (reason, promise) => { console.error('CRITICAL ERROR: Unhandled Rejection at:', promise, 'reason:', reason); });
process.on('uncaughtException', (err, origin) => { console.error('CRITICAL ERROR: Uncaught Exception:', err, 'Origin:', origin); });

const app = express();
app.use(express.json());

// ... (المتغيرات تبقى كما هي)
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
const userSession = new Map(); 
const lastResponseTime = new Map();
const shopifyCache = { products: [], storeStatus: "open" };
const REPLY_DELAY_MS = 10000;

// ... (إعداد Google Drive والدوال المساعدة تبقى كما هي)
// ... (Google Drive setup and helper functions remain the same)
let serviceAccountCredentials = {};
const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
if (credentialsPath) { /* ... */ }
const drive = google.drive({ /* ... */ });
function detectLanguage(text) { /* ... */ }
async function sendMessage(to, message) { /* ... */ }
async function saveConversationToDrive(customer, conversation) { /* ... */ }
async function getPreviousConversation(customer) { /* ... */ }
async function refreshShopifyCache() { /* ... */ }
function searchProductInCache(query, lang) { /* ... */ }
async function fetchOrderByNumber(orderNumber, lang) { /* ... */ }
async function fetchStorePolicy(keyword) { /* ... */ }

// === تعديل دالة الرد الذكي لتكون أكثر ذكاءً ووعيًا بالسياق ===
async function generateAIReply(userMessage, conversationHistory, from) {
    if (shopifyCache.storeStatus === "maintenance") {
        return "يبدو أن المتجر حالياً في صيانة مؤقتة، يمكنك العودة لاحقاً. 🙏";
    }

    const lang = detectLanguage(userMessage);

    const closingKeywords = ['thank', 'شكرا', 'مشكور', 'جزاك الله', 'ما قصرت', 'مع السلامة'];
    if (closingKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
        userSession.delete(from); // إنهاء الجلسة عند الشكر
        return lang === 'ar' ? "العفو! في خدمتك دائمًا. إذا احتجت أي شيء آخر، فلا تتردد في التواصل معنا." : "You're welcome! Always here to help. If you need anything else, feel free to reach out.";
    }

    try {
        let orderMatch = userMessage.match(/#?\d{3,6}/);
        const session = userSession.get(from) || {};

        if (!orderMatch) {
            const orderKeywords = lang === 'ar' ? ['طلبي', 'الطلب'] : ['my order', 'the order'];
            if (orderKeywords.some(kw => userMessage.toLowerCase().includes(kw))) {
                if (session.lastOrderNumber) {
                    orderMatch = [session.lastOrderNumber];
                }
            }
        }

        if (orderMatch) {
            const orderNumber = orderMatch[0];
            session.lastOrderNumber = orderNumber;
            userSession.set(from, session);
            return await fetchOrderByNumber(orderNumber, lang);
        }
        
        // ... (التحقق من المنتجات والسياسات يبقى كما هو)
        if (userMessage.includes("منتج") || userMessage.includes("product") || userMessage.includes("price")) { /* ... */ }
        const policies = ["الشحن", "الإرجاع", "الخصوصية", "الشروط", "shipping", "return", "privacy", "terms"];
        for (const k of policies) { /* ... */ }

        // ---  التحسين الأهم: تزويد ChatGPT بسياق أفضل وتعليمات أذكى ---
        const prompts = {
            ar: `أنت مساعد ذكي لمتجر "eSelect" في عمان. هدفك هو تقديم خدمة عملاء ممتازة.
            - كن ودودًا ومتعاونًا دائمًا.
            - إذا كانت المحادثة مستمرة، لا تبدأ بردك بـ "مرحباً" أو "أهلاً بك". واصل الحوار بشكل طبيعي.
            - إذا طرح المستخدم سؤالاً جديدًا بعد فترة من الصمت، يمكنك الترحيب به مجددًا.
            - إذا أرسل المستخدم رسالة قصيرة جدًا (مثل إيموجي أو "تمام" أو "ممتاز") بعد أن تم حل استفساره، قم بالرد برد قصير ومناسب مثل "👍" أو "في خدمتك!" بدلاً من سؤاله كيف يمكنك المساعدة مجددًا.
            - حافظ على السياق. استخدم سجل المحادثة لفهم ما يدور بينك وبين العميل.`,
            en: `You are a smart AI assistant for "eSelect", a store in Oman. Your goal is to provide excellent customer service.
            - Always be friendly and helpful.
            - If a conversation is ongoing, do not start your reply with "Hello" or "Welcome". Continue the conversation naturally.
            - If the user asks a new question after a period of silence, you can greet them again.
            - If the user sends a very short message (like an emoji, "Ok", or "Great") after their issue has been resolved, reply with a short, appropriate acknowledgment like "👍" or "Happy to help!" instead of asking how you can help again.
            - Maintain context. Use the conversation history to understand what's being discussed.`
        };

        const messages = [{ role: "system", content: prompts[lang] }];
        
        // إضافة آخر رسالتين من وإلى البوت كـ "ذاكرة قصيرة المدى"
        if (conversationHistory.length > 0) {
            messages.push({ role: "system", content: `This is the recent conversation history for context:\n${conversationHistory}` });
        }
        
        messages.push({ role: "user", content: userMessage });

        const response = await axios.post("https://api.openai.com/v1/chat/completions",
            { model: "gpt-4o-mini", messages, max_tokens: 300 },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );

        let reply = response.data.choices[0].message.content.trim();
        
        // تحديث سجل المحادثة في الذاكرة المؤقتة
        session.history = (session.history || []).slice(-4); // الاحتفاظ بآخر 4 رسائل (2 من العميل و 2 من البوت)
        session.history.push({role: 'user', content: userMessage});
        session.history.push({role: 'assistant', content: reply});
        userSession.set(from, session);

        return reply;

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
            
            // جلب سجل المحادثة من الذاكرة المؤقتة
            const session = userSession.get(from) || {};
            const recentHistory = (session.history || []).map(h => `${h.role}: ${h.content}`).join('\n');

            console.log(`🧠 معالجة ${from}: ${allMsgsText}`);
            const reply = await generateAIReply(allMsgsText, recentHistory, from);
            if (reply) {
                // استخدام سجل جوجل درايف يبقى كما هو للتخزين طويل الأمد
                const fullHistoryForDrive = userConversations.get(from) || await getPreviousConversation(from);
                const newConversation = `${fullHistoryForDrive}\nالعميل: ${allMsgsText}\nالبوت: ${reply}`;
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
app.listen(PORT, () => { console.log(`🚀 eSelect WhatsApp Bot is running on port ${PORT}`); refreshShopifyCache(); });

// (Full helper functions that were unchanged for brevity)
async function fetchStorePolicy(keyword) {
    const map = { "الشحن": "shipping", "الإرجاع": "return", "الخصوصية": "privacy", "الشروط": "terms", "shipping": "shipping", "return": "return", "privacy": "privacy", "terms": "terms" };
    const handle = map[keyword.toLowerCase()]; if (!handle) return null;
    try {
        const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/pages.json`;
        const res = await axios.get(url, { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN } });
        const page = res.data.pages.find((p) => p.handle.includes(handle));
        return page ? `📘 ${keyword}:\n${page.body_html.replace(/<[^>]*>?/gm, "").slice(0, 400)}...` : null;
    } catch { return null; }
}
