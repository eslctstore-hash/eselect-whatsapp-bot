// server.js
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

// ✅ متغيرات البيئة
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
    const message = data.data.message; // نص الرسالة

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✨ الرد من ChatGPT
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
    console.error("❌ Shopify products error:", err.response?.data || err.message);
    return [];
  }
}

// ✅ جلب السياسات
async function getShopifyPolicies() {
  try {
    const response = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-07/policies.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.policies.map(p => ({
      title: p.title,
      body: p.body
    }));
  } catch (err) {
    console.error("❌ Shopify policies error:", err.response?.data || err.message);
    return [];
  }
}

// ✅ جلب الصفحات
async function getShopifyPages() {
  try {
    const response = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-07/pages.json?limit=5`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.pages.map(p => ({
      title: p.title,
      body: p.body_html.replace(/<[^>]+>/g, "").slice(0, 300) // نص مختصر
    }));
  } catch (err) {
    console.error("❌ Shopify pages error:", err.response?.data || err.message);
    return [];
  }
}

// ✅ جلب القوائم
async function getShopifyNavigation() {
  try {
    const response = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-07/menus.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.menus.map(m => ({
      title: m.title,
      items: m.items.map(i => i.title).join(", ")
    }));
  } catch (err) {
    console.error("❌ Shopify navigation error:", err.response?.data || err.message);
    return [];
  }
}

// ✅ طلب من ChatGPT مع سياق كامل من المتجر
async function askChatGPT(userMessage) {
  try {
    const [products, policies, pages, menus] = await Promise.all([
      getShopifyProducts(),
      getShopifyPolicies(),
      getShopifyPages(),
      getShopifyNavigation()
    ]);

    const context = `
🛒 المنتجات:
${products.map(p => `- ${p.title}: ${p.price} OMR (${p.url})`).join("\n")}

📜 السياسات:
${policies.map(p => `- ${p.title}: ${p.body.slice(0, 150)}...`).join("\n")}

📄 الصفحات:
${pages.map(p => `- ${p.title}: ${p.body}`).join("\n")}

📂 الأقسام:
${menus.map(m => `- ${m.title}: ${m.items}`).join("\n")}
`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
أنت مساعد دردشة لمتجر eSelect | إي سيلكت.
- تجاوب بسرعة واحترافية باللهجة العمانية أو العربية الفصحى.
- تعطي معلومات دقيقة عن المنتجات والأسعار والسياسات.
- لو العميل يسأل شيء حساس (زي معلومات شخصية أو مالية)، تجاوب بأدب أنك ما تقدر تعطيه.
- اجعل ردودك ودية، قصيرة وواضحة.
`
          },
          { role: "user", content: `رسالة العميل: ${userMessage}\n\nمحتوى المتجر:\n${context}` }
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
    console.error("❌ ChatGPT error:", err.response?.data || err.message);
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
