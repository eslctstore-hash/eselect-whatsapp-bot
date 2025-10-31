// ai/intentEngine.js
// ----------------------------------------------------------------
// وحدة فهم نية العميل (Intent Engine) باستخدام gpt-4o
// ----------------------------------------------------------------

const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
أنت محرك تصنيف نوايا لـ "بوت" واتساب خاص بمتجر إلكتروني.
مهمتك هي قراءة رسالة العميل وتصنيفها إلى واحدة من الفئات التالية فقط:
[Order]: إذا كان العميل يسأل عن حالة طلب، أو تأخير، أو تتبع شحنة.
[Product]: إذا كان العميل يسأل عن منتج، سعره، توفره، أو يصف منتجاً.
[Complaint]: إذا كان العميل يشتكي من خدمة، أو منتج تالف، أو مشكلة.
[Promotion]: إذا كان العميل يسأل عن عروض، تخفيضات، أو كوبونات.
[General]: لأي شيء آخر (ترحيب، شكر، استفسار عام لا يندرج تحت ما سبق).

أريد منك الرد بالكلمة الإنجليزية للفئة فقط. مثال: "Order" أو "Product".
`;

/**
 * تصنيف نية العميل
 * @param {string} message - رسالة العميل
 * @returns {Promise<string>} - النية (e.g., "Order", "Product")
 */
async function getIntent(message) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0, // لضمان دقة التصنيف
      max_tokens: 10,
    });

    const intent = response.choices[0].message.content.trim();
    
    // التحقق من أن الرد هو أحد الفئات المسموحة
    const validIntents = ['Order', 'Product', 'Complaint', 'Promotion', 'General'];
    if (validIntents.includes(intent)) {
      return intent;
    }
    
    // إذا كان الرد غير متوقع، نعتبره "عام"
    console.warn(`Unexpected intent received: ${intent}. Defaulting to 'General'.`);
    return 'General';

  } catch (error) {
    console.error('Error getting intent:', error);
    return 'General'; // العودة إلى النية الافتراضية عند الخطأ
  }
}

module.exports = {
  getIntent,
};
