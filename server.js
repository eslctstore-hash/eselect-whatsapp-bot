// ==========================
// 🧠 eSelect WhatsApp Bot v4.0 (Intelligent Agent Architecture)
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

// ... (All Environment Variables and System Variables remain the same)
// ...

// ==========================
// 🤖 AI Reply Generator (v4.0 - Agent Architecture)
// ==========================
async function generateAIReply(userMessage, conversationHistory, from) {
    if (shopifyCache.storeStatus === "maintenance") { return "يبدو أن المتجر حالياً في صيانة مؤقتة، يمكنك العودة لاحقاً. 🙏"; }

    const session = userSession.get(from) || {};
    
    if (!session.lang) {
        session.lang = detectLanguage(userMessage);
    }
    const lang = session.lang;

    const closingKeywords = ['thank', 'شكرا', 'مشكور', 'جزاك الله', 'ما قصرت', 'مع السلامة'];
    if (closingKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
        userSession.delete(from);
        return lang === 'ar' ? "العفو! في خدمتك دائمًا. إذا احتجت أي شيء آخر، فلا تتردد في التواصل معنا." : "You're welcome! Always here to help. If you need anything else, feel free to reach out.";
    }

    try {
        const knowledgeBase = `... (Full knowledge base from v3.11) ...`;

        const prompts = {
            ar: `أنت وكيل خدمة عملاء ذكي جدا ومتعاطف لمتجر "eSelect".
            قواعدك الصارمة:
            1.  **فهم النية أولاً:** إذا كان العميل محبطًا أو غاضبًا، اعترف بمشاعره وتعاطف معه قبل فعل أي شيء آخر.
            2.  **استخدام الأدوات:** لديك أداة اسمها 'check_order_status'. إذا طلب العميل حالة طلبه، يجب عليك أولاً أن تسأله عن رقم الطلب إذا لم يكن متوفرًا. إذا كان متوفرًا، يجب أن ترد بجملة مثل "لحظات من فضلك، سأتحقق من حالة طلبك رقم [OrderNumber]".
            3.  **لا تقدم معلومات لم تُطلب:** لا تذكر سياسة الإرجاع إذا سأل العميل عن شحن الألعاب فقط. أجب على السؤال المطروح بدقة.
            4.  **التواصل مع البشر:** إذا طلب العميل التحدث مع موظف، اعترف بطلبه وقدم له وسائل الاتصال من قاعدة المعرفة.
            5.  **اللهجة واللغة:** حافظ على اللغة واللهجة (عمانية/خليجية) طوال المحادثة.`,
            en: `You are a highly intelligent and empathetic customer service agent for "eSelect".
            Your Strict Rules:
            1.  **Intent First:** If the customer is frustrated or angry, acknowledge their feelings and empathize before doing anything else.
            2.  **Tool Use:** You have a tool named 'check_order_status'. If a customer asks for their order status, you must first ask for the order number if it's not available. If it is available, you MUST respond with a phrase like "One moment please, I will check the status of your order #[OrderNumber]".
            3.  **Don't Offer Unsolicited Information:** Don't mention the return policy if a customer only asks about game currency. Answer the specific question asked.
            4.  **Human Handoff:** If the customer asks for a human agent, acknowledge the request and provide contact methods from the knowledge base.
            5.  **Language & Tone:** Maintain the language and a natural, helpful tone.`
        };

        const messages = [
            { role: "system", content: prompts[lang] + knowledgeBase },
            ...conversationHistory,
            { role: "user", content: userMessage }
        ];

        const firstApiResponse = await axios.post("https://api.openai.com/v1/chat/completions",
            { model: "gpt-4o", messages },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );

        let aiMessage = firstApiResponse.data.choices[0].message;
        let aiReply = aiMessage.content.trim();

        // Check if the AI decided to use our "tool"
        const orderNumberMatch = userMessage.match(/#?\d{3,6}/);
        if (orderNumberMatch && (aiReply.includes("سأتحقق") || aiReply.toLowerCase().includes("i will check"))) {
            const orderNumber = orderNumberMatch[0];
            const orderStatusResult = await fetchOrderByNumber(orderNumber, lang);

            // Add the AI's "I'm checking" response to the history
            messages.push(aiMessage);
            // Add the tool's result for the AI to process
            messages.push({ role: "system", content: `Tool check_order_status result for order ${orderNumber}: ${orderStatusResult}` });

            const finalApiResponse = await axios.post("https://api.openai.com/v1/chat/completions",
                { model: "gpt-4o", messages },
                { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
            );
            aiReply = finalApiResponse.data.choices[0].message.content.trim();
        }
        
        session.history = (session.history || []).slice(-4);
        session.history.push({ role: 'user', content: userMessage });
        session.history.push({ role: 'assistant', content: aiReply });
        session.lang = lang; // Persist language
        userSession.set(from, session);

        return aiReply;

    } catch (err) {
        console.error("ChatGPT Error:", err.message);
        const errorReply = { ar: "⚠️ حدث خلل مؤقت في النظام. حاول لاحقًا.", en: "⚠️ A temporary system error occurred. Please try again later."};
        return errorReply[lang];
    }
}

// ... Rest of the file (webhook handler, helpers) should be included, ensuring no duplicates.
