// core/shopify.js
// ----------------------------------------------------------------
// وحدة التكامل مع Shopify REST API للبحث عن المنتجات والطلبات
// ----------------------------------------------------------------

const fetch = require('node-fetch');

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const BASE_URL = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}`;

const headers = {
  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
};

/**
 * البحث عن منتج في Shopify
 * @param {string} query - اسم المنتج أو وصفه
 * @returns {Promise<Array>} - قائمة بالمنتجات المطابقة
 */
async function searchProduct(query) {
  const url = `${BASE_URL}/products.json?title=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    // إعادة صياغة بيانات المنتج لتكون أبسط
    return data.products.map(p => ({
      id: p.id,
      title: p.title,
      product_url: `${SHOPIFY_STORE_URL}/products/${p.handle}`,
      image: p.image ? p.image.src : null,
      variants: p.variants.map(v => ({ price: v.price })),
      currency: 'OMR' // افتراضي، يمكن سحبه من API
    }));

  } catch (error) {
    console.error('Error searching Shopify product:', error);
    return [];
  }
}

/**
 * جلب حالة طلب معين
 * @param {string} orderId - رقم الطلب
 * @returns {Promise<Object>} - بيانات الطلب
 */
async function getOrderStatus(orderId) {
  // ملاحظة: الـ ID الحقيقي قد يختلف عن رقم الطلب الظاهر.
  // البحث بالرقم الظاهر يحتاج GraphQL أو بحث بـ 'name'
  const url = `${BASE_URL}/orders/${orderId}.json?fields=id,name,financial_status,fulfillment_status`;
  
  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    if (data.order) {
        return {
            id: data.order.name, // .name هو الرقم الظاهر للعميل
            status: data.order.fulfillment_status || data.order.financial_status,
        };
    }
    throw new Error('Order not found');

  } catch (error) {
    console.error('Error getting Shopify order status:', error);
    return { id: orderId, status: 'Not Found' };
  }
}

module.exports = {
  searchProduct,
  getOrderStatus,
};
