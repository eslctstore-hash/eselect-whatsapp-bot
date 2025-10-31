// core/sessionManager.js
// ----------------------------------------------------------------
// (ملف جديد) ذاكرة البوت لإدارة حالة المحادثة
// ----------------------------------------------------------------

// سيتم فقدان هذه الذاكرة عند إعادة تشغيل السيرفر
// هذا حل بسيط. (الحل الاحترافي المتقدم هو استخدام Redis)
const userSessions = new Map();

/**
 * حفظ حالة العميل
 * @param {string} from - رقم العميل
 * @param {string} state - الحالة (e.g., 'awaiting_order_number')
 * @param {object} context - بيانات إضافية (e.g., { orderId: 123 })
 */
function setState(from, state, context = {}) {
  userSessions.set(from, { state, context, timestamp: Date.now() });
  console.log(`[Session] State set for ${from}: ${state}`);
}

/**
 * جلب حالة العميل الحالية
 * @param {string} from - رقم العميل
 * @returns {object | null} - الحالة الحالية أو null
 */
functiongetState(from) {
  const session = userSessions.get(from);
  if (!session) {
    return null;
  }

  // حذف الجلسة إذا مر عليها أكثر من 10 دقائق (لمنع بقاء العميل "عالقاً")
  const TEN_MINUTES = 10 * 60 * 1000;
  if (Date.now() - session.timestamp > TEN_MINUTES) {
    userSessions.delete(from);
    console.log(`[Session] Expired state for ${from}`);
    return null;
  }
  
  return session;
}

/**
 * مسح حالة العميل (بعد إتمام العملية)
 * @param {string} from - رقم العميل
 */
function clearState(from) {
  userSessions.delete(from);
  console.log(`[Session] Cleared state for ${from}`);
}

module.exports = {
  setState,
  getState,
  clearState,
};
