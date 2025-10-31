// ai/vision.js
// ----------------------------------------------------------------
// وحدة تحليل الصور (Vision) باستخدام OpenAI
// ----------------------------------------------------------------

const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // يستخدم OPENAI_API_KEY من .env
});

/**
 * تحليل محتوى صورة من رابط URL
 * @param {string} imageUrl - رابط الصورة (mediaUrl من Ultramsg)
 * @returns {Promise<string>} - وصف نصي لمحتوى الصورة
 */
async function analyzeImage(imageUrl) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // gpt-4o يدعم Vision
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ما هو المنتج الظاهر في هذه الصورة؟ صفه باختصار للبحث عنه في المتجر.' },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 300,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing image with OpenAI:', error);
    return 'خطأ في تحليل الصورة';
  }
}

module.exports = {
  analyzeImage,
};
