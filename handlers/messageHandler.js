// handlers/messageHandler.js
// ----------------------------------------------------------------
// (تحديث احترافي V2.0)
// - تم إصلاح الحلقة اللانهائية (بشكل كامل)
// - تم إضافة "الذاكرة" (Session Manager)
// - تم إضافة "التحقق الأمني" للطلبات
// - تم إصلاح منطق البحث (Intent -> Shopify)
// - تم إضافة دعم الرسائل المقتبسة (Quoted Messages)
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
const session = require('../core/sessionManager'); // (جديد) مدير الذاكرة

async function handleWebhook(payload) {
  // [** إصلاح الحلقة اللانهائية **]
  if (payload.event_type !== 'message_received' || !payload.data || payload.data.fromMe) {
    return; // تجاهل كل شيء ليس رسالة واردة من عميل
  }

  const messageData = payload.data;
  const from = messageData.from;
  const name = messageData.pushname;
  const type = messageData.type;
  const body = messageData.body;
  const mediaUrl = messageData.media;
  const quotedMsg = messageData.quotedMsg; // (جديد) الرسالة المقتبسة

  let textInput = body;
  let responseText = '';
  let logIntent = 'General';
  let logOrderNo = null;
  let isAudioResponse = false;

  try {
    await ultramsg.sendTypingIndicator(from);

    // [** التطوير الاحترافي: التحقق من الذاكرة (State) أولاً **]
    const currentState = session.getState(from);
    if (currentState) {
      console.log(`[State] Handling state: ${currentState.state}`);
      if (currentState.state === 'awaiting_order_number') {
        // العميل أرسل رقم الطلب
        textInput = body;
        responseText = await handleOrderVerification(from, textInput);
        logIntent = 'Order (State)';
        logOrderNo = textInput;
      } else if (currentState.state === 'awaiting_order_verification') {
         // العميل أرسل الإيميل/الهاتف للتحقق
         const orderNumber = currentState.context.orderNumber;
         const order = await shopify.getOrderByNumber(orderNumber);
         if (body.toLowerCase() === order.email.toLowerCase() || body.includes(order.phone.substring(1))) {
             responseText = formatOrderDetails(order);
             session.clearState(from);
         } else {
             responseText = 'المعلومات غير متطابقة. لا يمكن عرض تفاصيل الطلب. يرجى المحاولة مرة أخرى.';
             session.clearState(from);
         }
      }
      
      session.clearState(from); // تنظيف الذاكرة بعد الاستخدام

    } else {
      // --- لا يوجد حالة سابقة، نبدأ تحليل جديد ---

      // 1. تحليل الوسائط (إذا وجدت)
      if (type === 'image' && mediaUrl) {
        textInput = await vision.analyzeImage(mediaUrl);
        logIntent = 'Product (Vision)';
      } else if ((type === 'voice' || type === 'ptt') && mediaUrl) {
        textInput = await audio.transcribeAudio(mediaUrl);
        logIntent = 'Product (Voice)';
        isAudioResponse = true; // الرد يجب أن يكون صوتياً
      } else if (quotedMsg && quotedMsg.body) {
        // (جديد) فهم الرسائل المقتبسة
        textInput = `${body}\n\n[الرسالة المقتبسة]: ${quotedMsg.body}`;
        console.log(`[Quoted] Handling quoted message: ${textInput}`);
      }

      // 2. [** إصلاح المنطق **] إرسال النص (من الدردشة أو الصوت أو الاقتباس) إلى محرك النوايا
      const analysis = await intentEngine.analyzeIntent(textInput);
      logIntent = analysis.intent;
      const entities = analysis.entities || {};

      // 3. توجيه الطلب
      switch (analysis.intent) {
        case 'OrderInquiry':
          const orderNumber = entities.order_number || body.match(/\d+/);
          if (orderNumber) {
            logOrderNo = orderNumber;
            responseText = await handleOrderVerification(from, orderNumber.toString());
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
            // TODO: إضافة نظام "إقناع" احترافي
          } else {
            responseText = `عذراً ${name}، لم أتمكن من إيجاد منتج يطابق "${query}". هل يمكنك وصفه بشكل مختلف؟`;
          }
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
        
        case 'GeneralGreeting':
        default:
          // (احترافي) التحقق إذا كان العميل معروفاً
          const customer = await shopify.getCustomerByPhone(from);
          const customerName = customer ? (customer.first_name || name) : name;
          responseText = `أهلاً ${customerName}. كيف يمكنني مساعدتك اليوم بخصوص منتجاتنا أو طلباتك؟`;
          break;
      }
    }

    // 5. إرسال الرد (نصي أو صوتي)
    if (isAudioResponse) {
      console.log('Generating TTS response...');
      const tempAudioPath = await tts.generateTTS(responseText);
      const fileLink = await drive.uploadAudioAndGetLink(tempAudioPath);
      
      if(fileLink) {
        const ttsMessage = `الرد الصوتي:\n${fileLink}\n\nالنص:\n${responseText}`;
        await ultramsg.sendMessage(from, ttsMessage);
      } else {
         await ultramsg.sendMessage(from, responseText); // إرسال نصي إذا فشل الرفع
      }

    } else {
      await ultramsg.sendMessage(from, responseText);
    }

    // 6. تسجيل المحادثة
    await googleSheets.logToCRM({
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
    console.error('Error in handleWebhook (v2):', error.message);
    session.clearState(from); // تنظيف الذاكرة عند حدوث خطأ فادح
    await ultramsg.sendMessage(from, 'عذراً، حدث خطأ فني فادح. تم إعادة تعيين المحادثة. يرجى المحاولة مرة أخرى.');
  }
}

/**
 * (جديد) دالة احترافية للتعامل مع التحقق من الطلبات
 */
async function handleOrderVerification(customerPhone, orderNumber) {
    const order = await shopify.getOrderByNumber(orderNumber);
    
    if (!order) {
        return 'عذراً، لم أتمكن من العثور على طلب بهذا الرقم. يرجى التأكد من الرقم والمحاولة مرة أخرى.';
    }

    // [** التحقق الأمني **]
    const customerPhoneFormatted = customerPhone.replace('@c.us', '');
    
    if (order.phone && order.phone.includes(customerPhoneFormatted)) {
        // الرقم مطابق، اعرض التفاصيل
        return formatOrderDetails(order);
    } else {
        // الرقم غير مطابق، اطلب التحقق
        session.setState(customerPhone, 'awaiting_order_verification', { orderNumber });
        return `لحماية خصوصيتك، لاحظت أن رقم الهاتف (${customerPhoneFormatted}) مختلف عن المسجل في الطلب.\n\nالرجاء إرسال **البريد الإلكتروني** أو **رقم الهاتف** المسجل في الطلب للتحقق.`;
    }
}

/**
 * (جديد) دالة لتنسيق رد تفاصيل الطلب
 */
function formatOrderDetails(order) {
    return `تفاصيل طلبك #${order.id}:\n\n` +
           `الحالة: ${order.status}\n` +
           `الإجمالي: ${order.total}\n` +
           `المنتجات:\n${order.items}\n` +
           `العنوان: ${order.address}\n\n` +
           `هل لديك أي استفسارات أخرى؟`;
}

module.exports = { handleWebhook };
