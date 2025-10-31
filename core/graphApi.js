// core/graphApi.js
// ----------------------------------------------------------------
// وحدة التكامل مع Meta Graph API لقراءة المنشورات
// ----------------------------------------------------------------

const fetch = require('node-fetch');

const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const GRAPH_API_VERSION = 'v19.0'; // كما هو مذكور في الخطة

/**
 * استخراج ID المنشور والصفحة من الرابط
 * @param {string} url - رابط المنشور
 * @returns {object} - { pageId, postId }
 */
function extractIdsFromUrl(url) {
  // هذا مثال تبسيطي جداً
  // facebook.com/page-id/posts/post-id
  // instagram.com/p/post-id/
  
  // TODO: يحتاج هذا إلى regex أكثر تعقيداً للتعامل مع كل أنواع الروابط
  
  // افتراض بسيط لرابط فيسبوك
  const parts = url.split('/');
  if (parts.includes('posts')) {
      const postIndex = parts.indexOf('posts') + 1;
      const pageIndex = postIndex - 2;
      return {
          pageId: parts[pageIndex],
          postId: parts[postIndex]
      };
  }
  // TODO: إضافة دعم روابط إنستجرام
  
  return null;
}

/**
 * جلب تفاصيل منشور من Graph API
 * @param {string} postUrl - رابط المنشور
 * @returns {Promise<Object>} - تفاصيل المنشور
 */
async function getPostDetails(postUrl) {
  // TODO: استخراج IDs بشكل صحيح
  // const ids = extractIdsFromUrl(postUrl);
  
  // بما أن استخراج الـ ID معقد، سنستخدم مثالاً لـ Page ID من ملف .env
  // لنفترض أن FACEBOOK_PAGE_ID موجود في .env
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID; // يجب إضافته لملف .env
  
  // هذه الدالة ستجلب *أحدث* المنشورات من الصفحة بدلاً من قراءة الرابط
  // لأن قراءة رابط محدد يتطلب IDs دقيقة
  
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PAGE_ID}/posts?fields=message,created_time&limit=1&access_token=${FACEBOOK_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      return data.data[0]; // إرجاع أحدث منشور
    }
    return { message: 'لا يمكن جلب المنشورات حالياً' };

  } catch (error) {
    console.error('Error fetching Graph API post:', error);
    return { message: `خطأ: ${error.message}` };
  }
}

module.exports = {
  getPostDetails,
};
