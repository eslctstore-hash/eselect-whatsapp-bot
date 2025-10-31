import axios from "axios";

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

// 🛒 تحليل رابط المنتج
export async function analyzeProductLink(link) {
  try {
    const handle = link.split("/products/")[1]?.split("?")[0];
    if (!handle) return "⚠️ الرابط غير صالح.";

    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?handle=${handle}`;
    const res = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });

    const product = res.data.products?.[0];
    if (!product) return "😔 لم أجد المنتج في المتجر.";

    const variant = product.variants?.[0];
    const available =
      variant?.inventory_quantity > 0 ? "متوفر ✅" : "غير متوفر ❌";

    return `📦 ${product.title}\n💰 ${variant?.price} ر.ع\n📦 الحالة: ${available}\n📅 الشحن خلال 2-5 أيام عمل.`;
  } catch (err) {
    console.error("❌ analyzeProductLink Error:", err.message);
    return "⚠️ لم أتمكن من قراءة المنتج من الرابط.";
  }
}
