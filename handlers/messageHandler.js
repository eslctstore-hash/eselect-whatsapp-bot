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
            responseText = await handleOrderVerification(from, log
