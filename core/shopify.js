// core/shopify.js
// ----------------------------------------------------------------
// (تحديث احترافي) إضافة دوال جلب الطلب، والبحث عن العميل، والتحقق من المخزون
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
 * البحث عن منتج (تم تحسينه)
 * @param {string} query - اسم المنتج
 * @returns {Promise<Array>} - قائمة بالمنتجات
 */
async function searchProduct(query) {
  // استخدام GraphQL للبحث أدق، ولكن REST API أسرع للتنفيذ الآن
  const url = `${BASE_URL}/products.json?title=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return data.products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.body_html.replace(/<[^>]*>?/gm, ''), // إزالة HTML
      product_url: `${SHOPIFY_STORE_URL}/products/${p.handle}`,
      image: p.image ? p.image.src : null,
      price: p.variants[0].price,
      currency: 'OMR', // افتراضي
      // (تطوير احترافي) التحقق من المخزون
      stock: p.variants.reduce((total, v) => total + v.inventory_quantity, 0)
    }));

  } catch (error) {
    console.error('Error searching Shopify product:', error);
    return [];
  }
}

/**
 * (احترافي) جلب تفاصيل الطلب باستخدام رقمه (e.g., 1145)
 * @param {string} orderName - رقم الطلب الذي يراه العميل (e.g., "#1145")
 * @returns {Promise<Object | null>} - بيانات الطلب
 */
async function getOrderByNumber(orderName) {
    // إزالة # إذا أرسلها العميل
    const cleanOrderName = orderName.replace('#', '').trim();
    
    // البحث باستخدام "name" للعثور على رقم الطلب الصحيح
    const url = `${BASE_URL}/orders.json?name=${cleanOrderName}&status=any&fields=id,name,financial_status,fulfillment_status,contact_email,phone,total_price,currency,line_items,shipping_address`;
    
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        if (data.orders && data.orders.length > 0) {
            const order = data.orders[0];
            // تنسيق رقم الهاتف ليتطابق مع واتساب
            const formattedPhone = formatPhone(order.phone);
            
            return {
                id: order.name, // e.g., "#1145"
                status: order.fulfillment_status || order.financial_status,
                email: order.contact_email,
                phone: formattedPhone, // رقم هاتف العميل في الطلب
                total: `${order.total_price} ${order.currency}`,
                items: order.line_items.map(item => `${item.name} (x${item.quantity})`).join('\n'),
                address: order.shipping_address ? `${order.shipping_address.address1}, ${order.shipping_address.city}` : 'N/A'
            };
        }
        return null; // لم يتم العثور على الطلب

    } catch (error) {
        console.error('Error getting Shopify order by number:', error);
        return null;
    }
}

/**
 * (احترافي) جلب العميل باستخدام رقم الهاتف
 * @param {string} customerPhone - رقم هاتف العميل (صيغة واتساب)
 * @returns {Promise<Object | null>} - بيانات العميل
 */
async function getCustomerByPhone(customerPhone) {
    // يجب علينا تنسيق الرقم للبحث (e.g., +968...)
    const formattedPhone = formatPhone(customerPhone);
    const url = `${BASE_URL}/customers/search.json?query=phone:${formattedPhone}`;
    
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        if (data.customers && data.customers.length > 0) {
            return data.customers[0]; // إرجاع أول عميل مطابق
        }
        return null;
    } catch (error) {
        console.error('Error getting customer by phone:', error);
        return null;
    }
}

// دالة مساعدة لتنسيق أرقام الهواتف للمطابقة
function formatPhone(phone) {
    if (!phone) return null;
    // إزالة @c.us من رقم واتساب
    let cleanPhone = phone.replace('@c.us', '');
    // إضافة + إذا لم يكن موجوداً
    if (!cleanPhone.startsWith('+')) {
        cleanPhone = `+${cleanPhone}`;
    }
    return cleanPhone;
}


module.exports = {
  searchProduct,
  getOrderByNumber,
  getCustomerByPhone,
};
