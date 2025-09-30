import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import 'dotenv/config';
// استيراد مكتبة OpenAI
import OpenAI from 'openai';

// --- إعدادات أساسية ---
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// --- متغيرات البيئة (التي يجب وضعها في Render) ---
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BOT_WHATSAPP_NUMBER = process.env.BOT_WHATSAPP_NUMBER; // رقم البوت لمنع الرد على النفس
const SUPPORT_PHONE_NUMBER = process.env.SUPPORT_PHONE_NUMBER;
const YOUR_STORE_API_URL = process.env.YOUR_STORE_API_URL; 
const YOUR_STORE_API_TOKEN = process.env.YOUR_STORE_API_TOKEN;

// --- إعداد OpenAI ---
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// --- ذاكرة مؤقتة لتخزين بيانات العملاء وحالة التوقف ---
const userSessions = new Map();
const pausedUsers = new Map();


// --- دوال مساعدة ---

// لإرسال الرسائل عبر Ultramsg
async function sendWhatsappMessage(to, body) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    try {
        await axios.post(url, { token: ULTRAMSG_TOKEN, to, body, priority: 10 });
        console.log(`Message sent to ${to}`);
    } catch (error) {
        console.error("Error sending message:", error.response ? error.response.data : error.message);
    }
}

// لإرسال زر الاتصال
async function sendCallButton(to, body, phoneNumber) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/buttons`;
    try {
        await axios.post(url, { token: ULTRAMSG_TOKEN, to, body, buttons: [{ "type": "call", "title": "اتصل بالدعم الفني", "payload": phoneNumber }] });
        console.log(`Call button sent to ${to}`);
    } catch (error) {
        console.error("Error sending call button:", error.response ? error.response.data : error.message);
    }
}

// للحصول على معلومات من API المتجر (مثال يجب تعديله)
async function getOrderDetails(orderId) {
    try {
        const response = await axios.get(`${YOUR_STORE_API_URL}/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${YOUR_STORE_API_TOKEN}` }
        });
        return `حالة طلبك رقم ${orderId} هي: ${response.data.status}. شركة الشحن: ${response.data.shipping_company}. رابط التتبع: ${response.data.tracking_link || 'لا يوجد'}.`;
    } catch (error) {
        return `عذراً، لم أتمكن من العثور على طلب بالرقم ${orderId}. يرجى التأكد من الرقم والمحاولة مرة أخرى.`;
    }
}

// --- نقطة استقبال الويب هوك من Ultramsg ---
app.post('/webhook', async (req, res) => {
    const messageData = req.body.data;
    if (!messageData) { return res.sendStatus(200); }

    const from = messageData.from;
    const messageBody = messageData.body;
    
    // --- FIX: تجاهل الرسائل التي تأتي من البوت نفسه (لمنع الحلقة المفرغة) ---
    if (from === BOT_WHATSAPP_NUMBER) {
        console.log("Ignoring echo message from self.");
        return res.sendStatus(200);
    }

    // التحقق إذا كان المستخدم في وضع التوقف المؤقت
    if (pausedUsers.has(from)) {
        await sendWhatsappMessage(from, "أهلاً بك مجدداً. موظف الدعم الفني سيقوم بالرد على استفسارك في أقرب وقت ممكن. شكراً لانتظاركم.");
        return res.sendStatus(200);
    }
    
    // التعرف على رقم الطلب (3-6 أرقام)
    const orderIdMatch = messageBody.match(/\b\d{3,6}\b/);
    if (orderIdMatch) {
        const orderId = orderIdMatch[0];
        await sendWhatsappMessage(from, `شكراً لك، لقد استلمت رقم الطلب (${orderId}). جاري البحث عن تفاصيله...`);
        const orderDetails = await getOrderDetails(orderId);
        await sendWhatsappMessage(from, orderDetails);
        
        let session = userSessions.get(from) || {};
        session.lastOrderId = orderId;
        userSessions.set(from, session);
        
        return res.sendStatus(200);
    }
    
    // التحقق من طلب التحدث مع موظف
    if (messageBody.toLowerCase().includes("موظف") || messageBody.includes("دعم فني") || messageBody.includes("مساعدة")) {
        pausedUsers.set(from, Date.now());
        setTimeout(() => { pausedUsers.delete(from); }, 30 * 60 * 1000); // إيقاف لمدة 30 دقيقة
        await sendCallButton(from, "لتسهيل خدمتك، يمكنك التواصل مباشرة مع موظف الدعم الفني بالضغط على الزر أدناه.", SUPPORT_PHONE_NUMBER);
        return res.sendStatus(200);
    }
    
    // إذا لم يكن هناك طلب محدد، استخدم OpenAI للرد
    try {
        const isNewCustomer = !userSessions.has(from);
        if (isNewCustomer) {
            userSessions.set(from, { history: [] });
        }
        const session = userSessions.get(from);

        // بناء سجل المحادثة لـ OpenAI
        const messages = [
            {
                role: "system",
                content: `أنت مساعد خدمة عملاء ذكي لمتجر إلكتروني في سلطنة عمان. اسمك "مساعد المتجر الذكي". مهمتك هي مساعدة العملاء بأسلوب ودود ومحترف وباللهجة العمانية فقط. كن مقنعاً ولطيفاً وحاول كسب رضا العميل. إذا كان السؤال معقداً أو طلب العميل موظفاً، قم بعرض خيار الاتصال بالدعم. معلومات عن المتجر: [ضع هنا معلومات متجرك: سياسة الشحن، الاسترجاع، طرق الدفع، إلخ]`
            },
            ...session.history,
            {
                role: "user",
                content: messageBody
            }
        ];
        
        // استدعاء النموذج
        const completion = await openai.chat.completions.create({
            messages: messages,
            model: "gpt-4o", // gpt-4o هو الأحدث والأفضل حالياً
        });
        
        const aiResponse = completion.choices[0].message.content;
        
        // تحديث سجل المحادثة
        session.history.push({ role: "user", content: messageBody });
        session.history.push({ role: "assistant", content: aiResponse });
        if(session.history.length > 10) { // أبقِ السجل قصيراً
            session.history.splice(0, 2);
        }

        await sendWhatsappMessage(from, aiResponse);

    } catch (error) {
        console.error("Error with OpenAI API:", error.response ? error.response.data : error);
        await sendWhatsappMessage(from, "عذراً، أواجه مشكلة فنية في الوقت الحالي. يرجى المحاولة مرة أخرى لاحقاً.");
    }
    
    res.sendStatus(200);
});


// --- نقطة بداية تشغيل السيرفر ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
