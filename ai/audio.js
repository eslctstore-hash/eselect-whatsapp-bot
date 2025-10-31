// ai/audio.js
// ----------------------------------------------------------------
// (إصلاح) تم تغيير الطريقة إلى حفظ الملف مؤقتاً على القرص
// لضمان التوافق مع Whisper API وحل خطأ 'ReadableState'
// ----------------------------------------------------------------

const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.WHISPER_API_KEY, // يستخدم WHISPER_API_KEY من .env
});

const publicDir = path.join(__dirname, '../public');

/**
 * تحويل ملف صوتي من رابط URL إلى نص
 * @param {string} mediaUrl - رابط الملف الصوتي (من Ultramsg)
 * @returns {Promise<string>} - النص المفرغ من الصوت
 */
async function transcribeAudio(mediaUrl) {
  let tempFilePath = null;
  try {
    // 1. تحميل الملف الصوتي من الرابط
    const audioResponse = await fetch(mediaUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
    }
    
    const audioBuffer = await audioResponse.buffer();
    
    // 2. حفظ الملف الصوتي مؤقتاً في مجلد /public
    // نحتاج إلى تحديد الامتداد، نفترض 'ogg' بناءً على واتساب
    const tempFileName = `temp_audio_${Date.now()}.ogg`;
    tempFilePath = path.join(publicDir, tempFileName);
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    console.log(`Temporary audio file saved to: ${tempFilePath}`);

    // 3. إرسال الملف المحفوظ إلى Whisper API
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(tempFilePath),
    });

    // 4. حذف الملف المؤقت
    fs.unlinkSync(tempFilePath);
    console.log(`Deleted temporary audio file: ${tempFilePath}`);

    return response.text;
    
  } catch (error) {
    console.error('Error transcribing audio with Whisper:', error.message);
    
    // التأكد من حذف الملف المؤقت حتى لو فشلت العملية
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`Cleaned up failed audio file: ${tempFilePath}`);
    }
    
    return 'خطأ في تفريغ الرسالة الصوتية';
  }
}

module.exports = {
  transcribeAudio,
};
