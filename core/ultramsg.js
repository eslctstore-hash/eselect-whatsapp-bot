// core/ultramsg.js
// ----------------------------------------------------------------
// وحدة إرسال الرسائل و "جاري الكتابة" عبر Ultramsg API
// ----------------------------------------------------------------

const fetch = require('node-fetch');

const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const ULTRAMSG_API_URL = 'https://api.ultramsg.com';

/**
 * إرسال رسالة نصية إلى العميل
 * @param {string} to - رقم العميل (e.g., "968...")
 * @param {string} body - نص الرسالة
 */
async function sendMessage(to, body) {
  const url = `${ULTRAMSG_API_URL}/${ULTRAMSG_INSTANCE_ID}/messages/chat`;

  const params = new URLSearchParams();
  params.append('token', ULTRAMSG_TOKEN);
  params.append('to', to);
  params.append('body', body);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await response.json();
    console.log('Ultramsg send response:', data);
  } catch (error) {
    console.error('Error sending Ultramsg message:', error);
  }
}

/**
 * إرسال حالة "جاري الكتابة"
 * @param {string} to - رقم العميل
 */
async function sendTypingIndicator(to) {
  const url = `${ULTRAMSG_API_URL}/${ULTRAMSG_INSTANCE_ID}/messages/typing`;

  const params = new URLSearchParams();
  params.append('token', ULTRAMSG_TOKEN);
  params.append('to', to);

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
  } catch (error) {
    console.error('Error sending typing indicator:', error);
  }
}

module.exports = {
  sendMessage,
  sendTypingIndicator,
};
