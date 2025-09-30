import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import 'dotenv/config';
// تم التغيير: استيراد مكتبة OpenAI
import OpenAI from 'openai';

// --- إعدادات أساسية ---
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// --- متغيرات البيئة (تُضاف في Render) ---
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const YOUR_STORE_API_URL = process.env.YOUR_STORE_API_URL;
const YOUR_STORE_API_TOKEN = process.env.YOUR_STORE_API_TOKEN;
const SUPPORT_PHONE_NUMBER = process.env.SUPPORT_PHONE_NUMBER;

// --- متغير جديد خاص بـ OpenAI ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- إعداد OpenAI ---
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// --- ذاكرة مؤقتة لتخزين بيانات العملاء وحالة التوقف ---
const userSessions = new Map();
const pausedUsers = new Map();

// ... (باقي الدوال مثل sendWhatsappMessage, sendCallButton, getOrderDetails تبقى كما هي)
async function sendWhatsappMessage(to, body) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    try {
        await axios.post(url, { token: ULTRAMSG_TOKEN, to, body, priority: 10 });
        console.log(`Message sent to ${to}`);
    } catch (error) {
        console.error("Error sending message:", error.response ? error.response.data : error.message);
    }
}
async function sendCallButton(to, body, phoneNumber) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/buttons`;
    try {
        await axios.post(url, { token: ULTRAMSG_TOKEN, to, body, buttons: [{ "type": "call", "title": "اتصل بالدعم الفني", "payload": phoneNumber }] });
        console.log(`Call button sent to ${to}`);
    } catch (error) {
        console.error("Error sending call button:", error.response ? error.response.data : error.message);
    }
}
// ...

// --- نقطة استقبال الويب هوك من Ultramsg ---
app.post('/webhook', async (req, res) => {
    const messageData = req.body.data;
    if (!messageData) { return res.sendStatus(200); }

    const from = messageData.from;
    const messageBody = messageData.body;

    if (pausedUsers.has(from)) {
        await sendWhatsappMessage(from, "أهلاً بك مجدداً. موظف الدعم الفني سيقوم بالرد على استفسارك في أقرب وقت ممكن. شكراً لانتظاركم.");
        return res.sendStatus(200);
    }

    if (messageBody.includes("موظف") || messageBody.includes("دعم فني") || messageBody.includes("مساعدة")) {
        pausedUsers.set(from, Date.now());
        setTimeout(() => { pausedUsers.delete(from); }, 30 * 60 * 1000);
        await sendCallButton(from, "لتسهيل خدمتك، يمكنك التواصل مباشرة مع موظف الدعم الفني بالضغط على الزر أدناه.", SUPPORT_PHONE_NUMBER);
        return res.sendStatus(200);
    }
    
    try {
        const isNewCustomer = !userSessions.has(from);
        if (isNewCustomer) {
            userSessions.set(from, { history: [] });
        }
        const session = userSessions.get(from);

        // تم التغيير: بناء سجل المحادثة لـ OpenAI
        const messages = [
            {
                role: "system",
                content: `أنت مساعد خدمة عملاء ذكي لمتجر إلكتروني في سلطنة عمان. اسمك "مساعد المتجر الذكي". مهمتك هي مساعدة العملاء بأسلوب ودود ومحترف وباللهجة العمانية فقط... [أكمل باقي التعليمات هنا]`
            },
            ...session.history,
            {
                role: "user",
                content: messageBody
            }
        ];
        
        // تم التغيير: طريقة استدعاء النموذج
        const completion = await openai.chat.completions.create({
            messages: messages,
            model: "gpt-4o", // gpt-4o هو الأحدث والأفضل حالياً
        });
        
        // تم التغيير: طريقة قراءة الرد
        const aiResponse = completion.choices[0].message.content;
        
        session.history.push({ role: "user", content: messageBody });
        session.history.push({ role: "assistant", content: aiResponse });
        if(session.history.length > 10) {
            session.history.splice(0, 2);
        }

        await sendWhatsappMessage(from, aiResponse);

    } catch (error) {
        console.error("Error with OpenAI API:", error);
        await sendWhatsappMessage(from, "عذراً، أواجه مشكلة فنية في الوقت الحالي. يرجى المحاولة مرة أخرى لاحقاً.");
    }
    
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
