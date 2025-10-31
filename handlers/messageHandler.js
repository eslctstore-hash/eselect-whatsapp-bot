// handlers/messageHandler.js
// ----------------------------------------------------------------
// (تحديث احترافي V3.0)
// - إضافة "عقل المبيعات" (salesAgent)
// - إضافة "ذاكرة العملاء" (customerDB)
// - معالجة احترافية للأخطاء (لا مزيد من إظهار الأخطاء للعميل)
// - منطق متخصص للأسئلة العامة عن المنتجات
// ----------------------------------------------------------------

const ultramsg = require('../core/ultramsg');
const vision = require('../ai/vision');
const audio = require('../ai/audio');
const intentEngine = require('../ai/intentEngine');
const shopify = require('../core/shopify');
const graphApi = require('../core/graphApi');
const customerDB = require('../crm/googleSheets'); // (تحديث) أصبح الآن يدير الـ CRM والعملاء
const tts = require('../ai/tts');
const drive = require('../core/googleDrive');
const session = require('../core/sessionManager');
const salesAgent = require('../ai/salesAgent'); // (جديد) عقل المبيعات

async function handleWebhook(payload) {
  // 1. فلتر احترافي: تجاهل رسائلنا ورسائل التأكيد
  if (payload.event_type !== 'message_received' || !payload.data || payload.data.fromMe) {
    return;
  }

  const messageData = payload.data;
  const from = messageData.from;
  const name = messageData.pushname;
  const type = messageData.type;
  const body = messageData.body;
  const mediaUrl = messageData.media;
  const quotedMsg = messageData.quotedMsg;

  let textInput = body;
  let responseText = '';
  let logIntent = 'General';
  let logOrderNo = null;
  let isAudioResponse = false;
  
  // (احترافي) تعريف حالة خاصة لفشل التحليل
  const MEDIA_ANALYSIS_FAILED = 'MEDIA_ANALYSIS_FAILED';

  try {
    await ultramsg.sendTypingIndicator(from);
    
    // (جديد) حفظ العميل في الذاكرة للترحيب لاحقاً
    if(name) await customerDB.upsertCustomer(from, name);

    // 2. التحقق من الذاكرة (State) أولاً
    const currentState = session.getState(from);
    if (currentState) {
      console.log(`[State] Handling state: ${currentState.state}`);
      // ... (منطق الذاكرة يبقى كما هو من v2.0) ...
      if (currentState.state === 'awaiting_order_number') {
        textInput = body;
        responseText = await handleOrderVerification(from, textInput);
        logIntent = 'Order (State)';
        logOrderNo = textInput;
      } else if (currentState.state === 'awaiting_order_verification') {
         const orderNumber = currentState.context.orderNumber;
         const order = await shopify.getOrderByNumber(orderNumber);
         if (order && (body.toLowerCase() === order.email.toLowerCase() || body.includes(order.phone.substring(1)))) {
             responseText = formatOrderDetails(order);
         } else {
             responseText = 'المعلومات غير متطابقة. لا يمكن عرض تفاصيل الطلب.';
         }
      }
      session.clearState(from); // تنظيف الذاكرة بعد الاستخدام

    } else {
      // --- لا يوجد حالة سابقة، نبدأ تحليل جديد ---

      // 3. تحليل الوسائط (مع معالجة أخطاء احترافية)
      if (type === 'image' && mediaUrl) {
        try {
          textInput = await vision.analyzeImage(mediaUrl);
          logIntent = 'Product (Vision)';
        } catch (visionError) {
          console.error('Vision analysis failed:', visionError.message);
          textInput = MEDIA_ANALYSIS_FAILED; // (احترافي) لا نمرر الخطأ
        }
      } else if ((type === 'voice' || type === 'ptt') && mediaUrl) {
        isAudioResponse = true;
        try {
          textInput = await audio.transcribeAudio(mediaUrl);
          logIntent = 'Product (Voice)';
        } catch (audioError) {
          console.error('Audio transcription failed:', audioError.message);
          textInput = MEDIA_ANALYSIS_FAILED; // (احترافي) لا نمرر الخطأ
        }
      } else if (quotedMsg && quotedMsg.body) {
        textInput = `${body}\n\n[الرسالة المقتبسة]: ${quotedMsg.body}`;
        console.log(`[Quoted] Handling quoted message: ${textInput}`);
      }

      // 4. تحليل النية (إذا لم نفشل في تحليل الوسائط)
      let analysis = { intent: 'GeneralGreeting', entities: {} };
      if (textInput !== MEDIA_ANALYSIS_FAILED) {
        analysis = await intentEngine.analyzeIntent(textInput);
        logIntent = analysis.intent;
      }
      const entities = analysis.entities || {};

      // 5. توجيه الطلب (العقل الجديد V3.0)
      switch (analysis.intent) {
        case 'OrderInquiry':
          const orderNumber = entities.order_number || body.match(/\d+/);
          if (orderNumber) {
            logOrderNo = orderNumber.toString();
            responseText = await handleOrderVerification(from, logOrderNo);
          } else {
            responseText = 'بالتأكيد، الرجاء تزويدي برقم الطلب الذي يبدأ بـ #.';
            session.setState(from, 'awaiting_order_number');
          }
          break;

        case 'ProductInquiry':
          const query = entities.product_name || textInput;
          const products = await shopify.searchProduct(query);
          if (products.length > 0) {
            const p = products[0];
            responseText = `وجدنا المنتج: ${p.title}\n${p.description.substring(0, 100)}...\n\nالسعر: ${p.price} ${p.currency}\nالمخزون: ${p.stock > 0 ? 'متوفر ✅' : 'نفد ❌'}\nالرابط: ${p.product_url}`;
          } else {
            // (احترافي) فشل البحث؟ اعرض بدائل.
            responseText = await salesAgent.suggestAlternatives(query);
          }
          break;
        
        case 'GeneralProductInquiry': // (جديد) الرد على "ويش متوفر عندكم؟"
          responseText = await salesAgent.getStoreSummary();
          break;
        
        case 'LinkInquiry':
            if (entities.link_url && (entities.link_url.includes('facebook') || entities.link_url.includes('instagram'))) {
                const post = await graphApi.getPostDetails(entities.link_url);
                responseText = `اطلعت على المنشور. هذا ما وجدته:\n\n${post.message || 'لا يوجد نص'}\n\nكيف يمكنني مساعدتك بخصوصه؟`;
            } else {
                responseText = `شكراً لإرسال الرابط ${name}. سأقوم بالاطلاع عليه. كيف يمكنني مساعدتك؟`;
            }
            break;

        case 'Complaint':
          responseText = `نأسف جداً لسماع ذلك ${name}. سيتم تحويل شكواك إلى الفريق المختص. هل يمكنك تزويدنا بتفاصيل إضافية؟`;
          break;
        
        case MEDIA_ANALYSIS_FAILED: // (احترافي) رد لطيف عند فشل التحليل
           responseText = `عفواً ${name}، لم أتمكن من تحليل (الصورة/الرسالة الصوتية) التي أرسلتها. هل يمكنك المحاولة مرة أخرى أو كتابة طلبك نصاً؟`;
           isAudioResponse = false; // لا نرد بصوت على خطأ صوتي
           break;

        case 'GeneralGreeting':
        default:
          // (احترافي) جلب الاسم من ذاكرتنا أولاً
          const knownName = await customerDB.getCustomerName(from);
          responseText = `أهلاً ${knownName || name}. كيف يمكنني مساعدتك اليوم بخصوص منتجاتنا أو طلباتك؟`;
          break;
      }
    }

    // 6. إرسال الرد (نصي أو صوتي)
    if (isAudioResponse) {
      const tempAudioPath = await tts.generateTTS(responseText);
      const fileLink = await drive.uploadAudioAndGetLink(tempAudioPath);
      
      if (fileLink) { // نجح الرفع على Drive
        const ttsMessage = `الرد الصوتي:\n${fileLink}\n\nالنص:\n${responseText}`;
        await ultramsg.sendMessage(from, ttsMessage);
      } else {
        // (احترافي) فشل الرفع؟ أرسل الرد كنص عادي ولا تظهر الخطأ.
        console.error('TTS Upload Failed, sending text fallback.');
        await ultramsg.sendMessage(from, responseText);
      }
    } else {
      await ultramsg.sendMessage(from, responseText); // رد نصي عادي
    }

    // 7. تسجيل المحادثة
    await customerDB.logToCRM({
      timestamp: new Date().toISOString(),
      name: name,
      phone: from,
      message: textInput,
      intent: logIntent,
      response: responseText,
      orderNo: logOrderNo,
      language: 'ar',
      sentiment: 'neutral',
    });

  } catch (error) {
    console.error('Error in handleWebhook (v3):', error.message);
    session.clearState(from);
    await ultramsg.sendMessage(from, 'عذراً، حدث خطأ فني فادح. تم إعادة تعيين المحادثة. يرجى المحاولة مرة أخرى.');
  }
}

// ... (دوال 'handleOrderVerification' و 'formatOrderDetails' تبقى كما هي من v2.0) ...
async function handleOrderVerification(customerPhone, orderNumber) {
    const order = await shopify.getOrderByNumber(orderNumber);
    
    if (!order) {
        return 'عذراً، لم أتمكن من العثور على طلب بهذا الرقم. يرجى التأكد من الرقم والمحاولة مرة أخرى.';
    }

    const customerPhoneFormatted = customerPhone.replace('@c.us', '');
    
    if (order.phone && order.phone.includes(customerPhoneFormatted)) {
        await customerDB.upsertCustomer(customerPhone, order.email.split('@')[0]); // حفظ اسم العميل من الطلب
        return formatOrderDetails(order);
    } else {
        session.setState(customerPhone, 'awaiting_order_verification', { orderNumber });
        return `لحماية خصوصيتك، لاحظت أن رقم الهاتف (${customerPhoneFormatted}) مختلف عن المسجل في الطلب.\n\nالرجاء إرسال **البريد الإلكتروني** أو **رقم الهاتف** المسجل في الطلب للتحقق.`;
    }
}

function formatOrderDetails(order) {
    return `تفاصيل طلبك #${order.id}:\n\n` +
           `الحالة: ${order.status}\n` +
           `الإجمالي: ${order.total}\n` +
           `المنتجات:\n${order.items}\n` +
           `العنوان: ${order.address}\n\n` +
           `هل لديك أي استفسارات أخرى؟`;
}

module.exports = { handleWebhook };
