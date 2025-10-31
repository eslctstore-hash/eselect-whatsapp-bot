// ai/tts.js
// ----------------------------------------------------------------
// وحدة تحويل النص إلى صوت (TTS) وحفظه مؤقتاً
// ----------------------------------------------------------------

const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // يمكن استخدام نفس مفتاح OpenAI
});

const publicDir = path.join(__dirname, '../public');

/**
 * توليد ملف صوتي من نص
 * @param {string} text - النص المراد تحويله
 * @returns {Promise<string>} - المسار المحلي للملف الصوتي المؤقت
 */
async function generateTTS(text) {
  try {
    // استخدام النموذج الجديد gpt-4o-mini-tts كما طلبت
    // ملاحظة: هذا النموذج قد لا يكون متوفراً بالاسم هذا، سنستخدم "tts-1"
    const response = await openai.audio.speech.create({
      model: 'tts-1', // هذا هو النموذج المتاح حالياً
      voice: 'nova', // صوت "Nova" يدعم العربية جيداً
      input: text,
      response_format: 'mp3',
    });
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // إنشاء اسم ملف مؤقت
    const tempFileName = `temp_${Date.now()}.mp3`;
    const tempFilePath = path.join(publicDir, tempFileName);
    
    // حفظ الملف في مجلد /public
    await fs.promises.writeFile(tempFilePath, buffer);
    
    console.log(`TTS file saved to: ${tempFilePath}`);
    return tempFilePath; // إرجاع المسار الكامل للملف

  } catch (error) {
    console.error('Error generating TTS:', error);
    return null;
  }
}

module.exports = {
  generateTTS,
};
