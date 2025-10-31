// ai/audio.js
// ----------------------------------------------------------------
// وحدة تحويل الصوت إلى نص (Whisper) باستخدام OpenAI
// ----------------------------------------------------------------

const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { Readable } = require('stream');

const openai = new OpenAI({
  apiKey: process.env.WHISPER_API_KEY, // يستخدم WHISPER_API_KEY من .env
});

/**
 * تحويل ملف صوتي من رابط URL إلى نص
 * @param {string} mediaUrl - رابط الملف الصوتي (من Ultramsg)
 * @returns {Promise<string>} - النص المفرغ من الصوت
 */
async function transcribeAudio(mediaUrl) {
  try {
    // 1. تحميل الملف الصوتي من الرابط
    const audioResponse = await fetch(mediaUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
    }
    
    // Ultramsg ترسل ملفات OGG. نحتاج لتمريرها كـ stream
    const audioBuffer = await audioResponse.buffer();
    const audioStream = new Readable();
    audioStream.push(audioBuffer);
    audioStream.push(null);

    // 2. إرسال الـ stream إلى Whisper API
    // نحتاج لاستخدام "file" كاسم للملف
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: {
          value: audioStream,
          options: {
              filename: 'audio.ogg', // يجب أن يكون اسماً ذا امتداد
              contentType: audioResponse.headers.get('content-type') || 'audio/ogg',
          }
      },
    });

    return response.text;
  } catch (error) {
    console.error('Error transcribing audio with Whisper:', error);
    return 'خطأ في تفريغ الرسالة الصوتية';
  }
}

module.exports = {
  transcribeAudio,
};
