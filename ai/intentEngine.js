// ai/intentEngine.js
// ----------------------------------------------------------------
// (تحديث احترافي) أصبح المحرك يعيد JSON بدلاً من كلمة واحدة
// ----------------------------------------------------------------

const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
أنت العقل المفكر لـ "بوت" خدمة عملاء واتساب لمتجر إلكتروني.
مهمتك هي تحليل رسالة العميل وإرجاع ملف JSON فقط بناءً على نية العميل.

الفئات المسموحة للـ "intent" هي:
- "OrderInquiry": يسأل عن طلب (e.g., "متى يوصل طلبي", "أعطني تفاصيل طلب 1145").
- "ProductInquiry": يسأل عن منتج (e.g., "عندكم شاحن", "كم سعر هذا", "ما هي المنتجات المتوفرة").
- "Complaint": شكوى (e.g., "المنتج تالف", "الخدمة سيئة").
- "PromotionInquiry": يسأل عن عروض.
- "GeneralGreeting": ترحيب أو استفسار عام (e.g., "مرحبا", "السلام عليكم").
- "LinkInquiry": أرسل رابط (فيسبوك، انستجرام، أو رابط منتج).

الـ "entities" هي البيانات التي تستخرجها من النص:
- "order_number": رقم الطلب (استخرجه إذا وجد).
- "product_name": اسم المنتج (استخرجه إذا وجد).
- "link_url": الرابط (استخرجه إذا وجد).

أمثلة على المخرجات:
- User: "متى يوصل طلبي 1145؟" -> {"intent": "OrderInquiry", "entities": {"order_number": "1145"}}
- User: "عندكم شواحن ايفون؟" -> {"intent": "ProductInquiry", "entities": {"product_name": "شاحن ايفون"}}
- User: "السلام عليكم" -> {"intent": "GeneralGreeting", "entities": {}}
- User: "شفت هذا المنشور عندكم https://instagram.com/p/..." -> {"intent": "LinkInquiry", "entities": {"link_url": "https://instagram.com/p/..."}}

قم بالرد بملف JSON فقط.
`;

/**
 * تحليل نية العميل واستخراج البيانات
 * @param {string} message - رسالة العميل
 * @returns {Promise<object>} - النية والبيانات المستخرجة
 */
async function analyzeIntent(message) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' }, // طلب إخراج بصيغة JSON
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log('[IntentEngine] Analysis result:', result);
    return result;

  } catch (error) {
    console.error('Error getting intent (JSON):', error);
    // العودة إلى النية الافتراضية عند الخطأ
    return { intent: 'GeneralGreeting', entities: {} };
  }
}

module.exports = {
  analyzeIntent,
};
