// handlers/messageHandler.js
// ----------------------------------------------------------------
// العقل المدبر: ينسق جميع العمليات من استلام الرسالة حتى الرد
// ----------------------------------------------------------------

const ultramsg = require('../core/ultramsg');
const vision = require('../ai/vision');
const audio = require('../ai/audio');
const intentEngine = require('../ai/intentEngine');
const shopify = require('../core/shopify');
const graphApi = require('../core/graphApi');
const googleSheets = require('../crm/googleSheets');
const tts = require('../ai/tts');
const drive = require('../core/googleDrive');

async function handleWebhook(payload) {
  // تجاهل الرسائل التي نرسلها نحن (حالة "sent")
  if (payload.status === 'sent') {
    return;
  }

  // استخراج البيانات الأساسية من رسالة Ultramsg
  const messageData = payload.data;
  if (!messageData) {
    console.log('No data found in webhook payload.');
    return;
  }

  const from = messageData.from; // رقم العميل
  const name = messageData.pushname; // اسم العميل
  const type = messageData.type; // نوع الرسالة (chat, image, voice)
  const body = messageData.body; // محتوى الرسالة النصية
  const mediaUrl = messageData.media; // رابط الصورة أو الصوت

  let textInput = body; // النص الذي سيتم تحليله
  let intent = 'General';
  let responseText = '';
  let orderNo = null;

  try {
    // 1. إرسال "جاري الكتابة" (المرحلة 7)
    await ultramsg.sendTypingIndicator(from);

    // 2. تحليل الوسائط (المرحلة 2)
    if (type === 'image') {
      console.log('Analyzing image...');
      textInput = await vision.analyzeImage(mediaUrl);
      console.log('Vision Analysis:', textInput);
      intent = 'Product (Vision)';
    } else if (type === 'voice') {
      console.log('Transcribing audio...');
      textInput = await audio.transcribeAudio(mediaUrl);
      console.log('Whisper Transcription:', textInput);
      intent = 'Product (Voice)';
    } else if (type === 'chat' && (body.includes('http://') || body.includes('https://'))) {
        if (body.includes('facebook.com') || body.includes('instagram.com')) {
            intent = 'Social Media Link';
        } else {
            intent = 'General Link';
        }
        textInput = body;
    }

    // 3. فهم نية العميل (المرحلة 3)
    if (type === 'chat') {
        intent = await intentEngine.getIntent(textInput);
        console.log(`Intent classified as: ${intent}`);
    }

    // 4. توليد الرد بناءً على النية (المراحل 4 و 6)
    switch (intent) {
      case 'Order':
        // TODO: استخراج رقم الطلب أو الهاتف من textInput
        const orderId = textInput.match(/\d+/); // مثال بسيط
        if (orderId) {
          const order = await shopify.getOrderStatus(orderId[0]);
          responseText = `مرحباً ${name}، حالة طلبك #${order.id} هي ${order.status}.`;
          orderNo = order.id;
        } else {
          responseText = 'الرجاء تزويدي برقم الطلب أو رقم الهاتف المرتبط بالطلب.';
        }
        break;

      case 'Product':
      case 'Product (Vision)':
      case 'Product (Voice)':
        const products = await shopify.searchProduct(textInput);
        if (products.length > 0) {
          const p = products[0];
          responseText = `وجدنا المنتج: ${p.title}\nالسعر: ${p.variants[0].price} ${p.currency}\n${p.product_url}`;
        } else {
          responseText = `عذراً ${name}، لم أتمكن من إيجاد منتج يطابق "${textInput}". هل يمكنك وصفه بشكل مختلف؟`;
        }
        break;

      case 'Complaint':
        responseText = `نأسف جداً لسماع ذلك ${name}. سيتم تحويل شكواك إلى الفريق المختص. هل يمكنك تزويدنا بتفاصيل إضافية؟`;
        break;
        
      case 'Social Media Link':
        console.log('Fetching post from Graph API...');
        const post = await graphApi.getPostDetails(textInput);
        responseText = `شكراً لإرسال هذا الرابط. إليك محتوى المنشور:\n\n${post.message || 'لا يوجد نص'}\n\nتاريخ النشر: ${post.created_time}`;
        break;

      case 'General':
      case 'General Link':
      default:
        responseText = `أهلاً ${name}. كيف يمكنني مساعدتك اليوم بخصوص منتجاتنا أو طلباتك؟`;
        break;
    }

    // 5. إرسال الرد
    // هل العميل يريد رداً صوتياً؟ (بناءً على المرحلة 2)
    if (type === 'voice') {
      console.log('Generating TTS response...');
      // ملاحظتك التقنية: توليد صوت -> رفع لـ Drive -> إرسال رابط
      const tempAudioPath = await tts.generateTTS(responseText);
      const fileLink = await drive.uploadAudioAndGetLink(tempAudioPath);
      const ttsMessage = `الرد الصوتي:\n${fileLink}\n\nالنص:\n${responseText}`;
      await ultramsg.sendMessage(from, ttsMessage);
    } else {
      // رد نصي عادي
      await ultramsg.sendMessage(from, responseText);
    }

    // 6. تسجيل المحادثة في Google Sheets (المرحلة 5)
    await googleSheets.logToCRM({
      timestamp: new Date().toISOString(),
      name: name,
      phone: from,
      message: textInput,
      intent: intent,
      response: responseText,
      orderNo: orderNo,
      language: 'ar', // يمكن تطويره لاحقاً
      sentiment: 'neutral', // يمكن تطويره لاحقاً
    });

  } catch (error) {
    console.error('Error in handleWebhook:', error.message);
    // إرسال رسالة خطأ للعميل في حال الفشل
    await ultramsg.sendMessage(from, 'عذراً، حدث خطأ فني. يرجى المحاولة مرة أخرى.');
  }
}

module.exports = { handleWebhook };
