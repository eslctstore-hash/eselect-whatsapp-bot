import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- إعدادات أساسية ---
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// --- متغيرات البيئة (تُضاف في Render) ---
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const YOUR_STORE_API_URL = process.env.YOUR_STORE_API_URL; // رابط API لمتجرك
const YOUR_STORE_API_TOKEN = process.env.YOUR_STORE_API_TOKEN; // مفتاح الوصول لـ API متجرك
const SUPPORT_PHONE_NUMBER = process.env.SUPPORT_PHONE_NUMBER; // رقم الدعم الفني (نفس رقم البوت)

// --- إعداد Gemini AI ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- ذاكرة مؤقتة لتخزين بيانات العملاء وحالة التوقف ---
const userSessions = new Map();
const pausedUsers = new Map();


// --- دالة لإرسال الرسائل عبر Ultramsg ---
async function sendWhatsappMessage(to, body) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    try {
        await axios.post(url, {
            token: ULTRAMSG_TOKEN,
            to: to,
            body: body,
            priority: 10
        });
        console.log(`Message sent to ${to}`);
    } catch (error) {
        console.error("Error sending message:", error.response ? error.response.data : error.message);
    }
}

// --- دالة لإرسال زر الاتصال ---
async function sendCallButton(to, body, phoneNumber) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/buttons`;
    try {
        await axios.post(url, {
            token: ULTRAMSG_TOKEN,
            to: to,
            body: body,
            buttons: [
                { "type": "call", "title": "اتصل بالدعم الفني", "payload": phoneNumber }
            ]
        });
        console.log(`Call button sent to ${to}`);
    } catch (error) {
        console.error("Error sending call button:", error.response ? error.response.data : error.message);
    }
}

// --- دالة للحصول على معلومات من API المتجر (مثال) ---
// **مهم:** يجب تعديل هذه الدوال لتناسب API الخاص بمتجرك
async function getOrderDetails(orderId) {
    // مثال: يفترض أن متجرك لديه API للبحث عن الطلبات
    try {
        const response = await axios.get(`${YOUR_STORE_API_URL}/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${YOUR_STORE_API_TOKEN}` }
        });
        return `حالة طلبك رقم ${orderId} هي: ${response.data.status}. شركة الشحن: ${response.data.shipping_company}. رابط التتبع: ${response.data.tracking_link || 'لا يوجد'}.`;
    } catch (error) {
        return `عذراً، لم أتمكن من العثور على طلب بالرقم ${orderId}. يرجى التأكد من الرقم والمحاولة مرة أخرى.`;
    }
}

async function findProduct(productName) {
    // مثال: للبحث عن منتج
    try {
        const response = await axios.get(`${YOUR_STORE_API_URL}/products?search=${encodeURIComponent(productName)}`, {
            headers: { 'Authorization': `Bearer ${YOUR_STORE_API_TOKEN}` }
        });
        if (response.data.length > 0) {
            const product = response.data[0];
            return `نعم، منتج "${product.name}" متوفر. السعر: ${product.price} ريال عماني.`;
        } else {
            return `عذراً، منتج "${productName}" غير متوفر حالياً. هل تود البحث عن منتج آخر؟`;
        }
    } catch (error) {
        return "حدث خطأ أثناء البحث عن المنتج. الرجاء المحاولة لاحقاً.";
    }
}


// --- نقطة استقبال الويب هوك من Ultramsg ---
app.post('/webhook', async (req, res) => {
    const messageData = req.body.data;
    if (!messageData) {
        return res.sendStatus(200);
    }

    const from = messageData.from;
    const messageBody = messageData.body;

    // التحقق إذا كان المستخدم في وضع التوقف المؤقت
    if (pausedUsers.has(from)) {
        console.log(`User ${from} is paused. Ignoring message.`);
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
        
        // حفظ رقم الطلب في الجلسة
        let session = userSessions.get(from) || {};
        session.lastOrderId = orderId;
        userSessions.set(from, session);
        
        return res.sendStatus(200);
    }
    
    // التحقق من طلب التحدث مع موظف
    if (messageBody.includes("موظف") || messageBody.includes("دعم فني") || messageBody.includes("مساعدة")) {
        pausedUsers.set(from, Date.now());
        setTimeout(() => {
            pausedUsers.delete(from);
            console.log(`User ${from} is no longer paused.`);
        }, 30 * 60 * 1000); // إيقاف لمدة 30 دقيقة

        await sendCallButton(
            from,
            "لتسهيل خدمتك، يمكنك التواصل مباشرة مع موظف الدعم الفني بالضغط على الزر أدناه. سيتوقف البوت عن الرد مؤقتاً لإعطاء الأولوية للموظف المختص.",
            SUPPORT_PHONE_NUMBER
        );
        return res.sendStatus(200);
    }

    // إذا لم يكن هناك طلب محدد، استخدم Gemini للرد
    try {
         // تحديد إذا كان العميل جديداً أم لا
        const isNewCustomer = !userSessions.has(from);
        if (isNewCustomer) {
            userSessions.set(from, { history: [] }); // إنشاء جلسة جديدة
        }
        const session = userSessions.get(from);

        // بناء السياق لـ Gemini
        const context = `
            أنت مساعد خدمة عملاء ذكي لمتجر إلكتروني في سلطنة عمان.
            اسمك "مساعد المتجر الذكي".
            مهمتك هي مساعدة العملاء بأسلوب ودود ومحترف وباللهجة العمانية فقط.
            
            معلومات عن المتجر: [أضف هنا معلومات متجرك: سياسة الشحن، الاسترجاع، طرق الدفع، معلومات عن المنتجات الرقمية، كيفية استرداد الأكواد، إلخ]
            
            خصائصك:
            - ترحيب بالعملاء الجدد بحرارة.
            - إذا سأل العميل عن منتج، ابحث عنه.
            - إذا سأل عن طلب، اطلب منه رقم الطلب (3-6 أرقام).
            - إذا كان السؤال معقداً أو طلب العميل موظفاً، قم بعرض خيار الاتصال بالدعم.
            - كن مقنعاً ولطيفاً وحاول كسب رضا العميل.
            
            العميل هذا ${isNewCustomer ? 'جديد' : 'عميل سابق'}.
            تاريخ المحادثة:
            ${session.history.join('\n')}
            العميل: ${messageBody}
            أنت:
        `;

        const result = await model.generateContent(context);
        const aiResponse = await result.response.text();

        // تحديث سجل المحادثة
        session.history.push(`العميل: ${messageBody}`);
        session.history.push(`أنت: ${aiResponse}`);
        // أبقِ السجل قصيراً لتجنب استهلاك الذاكرة الزائد
        if(session.history.length > 10) {
            session.history.splice(0, 2);
        }

        await sendWhatsappMessage(from, aiResponse);

    } catch (error) {
        console.error("Error with Gemini API:", error);
        await sendWhatsappMessage(from, "عذراً، أواجه مشكلة فنية في الوقت الحالي. يرجى المحاولة مرة أخرى لاحقاً.");
    }
    
    res.sendStatus(200);
});


// --- نقطة بداية تشغيل السيرفر ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
