// ai/vision.js
// ----------------------------------------------------------------
// (إصلاح): تم تحديث التعليمات (Prompt) لاستخراج كلمات مفتاحية للبحث
// ----------------------------------------------------------------

const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // يستخدم OPENAI_API_KEY من .env
});

/**
 * تحليل محتوى صورة من رابط URL
 * @param {string} imageUrl - رابط الصورة (mediaUrl من Ultramsg)
 * @returns {Promise<string>} - كلمات مفتاحية للمنتج
 */
async function analyzeImage(imageUrl) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // gpt-4o يدعم Vision
      messages: [
        {
          role: 'system',
          // [** إصلاح البحث **]: تعليمات جديدة لـ AI
          content: 'أنت خبير في تحليل صور المنتجات. انظر إلى الصورة وأعطني فقط اسم المنتج أو كلمتين رئيسيتين (Keywords) مناسبة للبحث عنه في قاعدة بيانات متجر. لا تقم بكتابة جمل كاملة أو أوصاف. مثال: "توربو تشارجر" أو "شاحن آيفون".'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ما هو المنتج الظاهر في هذه الصورة؟' },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 50, // كلمات قليلة تكفي
    });
    
    // تنظيف الإخراج لإزالة أي علامات اقتباس قد يضيفها الـ AI
    return response.choices[0].message.content.replace(/"/g, '').trim();

  } catch (error) {
    console.error('Error analyzing image with OpenAI:', error);
    return 'خطأ في تحليل الصورة';
  }
}

module.exports = {
  analyzeImage,
};
