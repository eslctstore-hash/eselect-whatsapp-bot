// server.js
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

// ✅ بيئة من ملف .env
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ✅ Webhook من UltraMsg
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.data || !data.data.message) {
      return res.sendStatus(200);
    }

    const from = data.data.from;   // رقم العميل
    const message = data.data.message; // رسالة العميل

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✨ الرد من ChatGPT (مع منتجات Shopify)
    const gptReply = await askChatGPT(message);

    // ✨ إرسال الرد للعميل
    await sendWhatsAppMessage(from, gptReply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});

// ✅ جلب المنتجات من Shopify
async function getShopifyProducts() {
  try {
    const response = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-07/products.json?limit=5`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.products.map(p => ({
      title: p.title,
      price: p.variants[0]?.price,
      url: `https://${SHOPIFY_STORE_URL.replace("https://", "").replace("http://", "")}/products/${p.handle}`
    }));
  } catch (err) {
    console.error("❌ Shopify error:", err.response?.data || err.message);
    return [];
  }
}

// ✅ طلب من ChatGPT مع سياق المتجر
async function askChatGPT(userMessage) {
  try {
    const products = await getShopifyProducts();

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
أنت مساعد دردشة لمتجر eSelect | إي سيلكت.
تجاوب بسرعة واحترافية باللهجة العمانية (أو العربية الفصحى عند الحاجة).
مهمتك:
- تشرح للعميل المنتجات والأسعار بشكل مبسط.
- تذكر روابط المنتجات عند الحاجة.
- تعطي معلومات عن الدفع عند الاستلام، التحويل البنكي، باي بال.
- توضح سياسات الشحن والإرجاع حسب ما هو في الموقع.
- تعيد صياغة الردود بشكل ودّي وواضح.
`
          },
          {
            role: "user",
            content: `
رسالة العميل: ${userMessage}
قائمة أحدث المنتجات:
${products.map(p => `- ${p.title}: ${p.price} OMR (${p.url})`).join("\n")}
`
          }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("❌ Error from ChatGPT:", err.response?.data || err.message);
    return "عذرًا، صار خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// ✅ إرسال رسالة عبر UltraMsg
async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to,
      body: text,
    });
    console.log(`✅ أُرسلت رسالة إلى ${to}: ${text}`);
  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 WhatsApp Bot running on port ${PORT}`));
