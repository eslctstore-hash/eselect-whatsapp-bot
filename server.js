const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ بيئة
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // https://xxx.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ✅ فحص
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp bot is running");
});

// ✅ Webhook
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body || !body.data || !body.data.body) {
      console.log("❌ Webhook بدون رسالة:", body);
      return res.sendStatus(200);
    }

    const from = body.data.from.replace("@c.us", ""); // رقم العميل
    const message = body.data.body; // نص الرسالة

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✨ الرد من ChatGPT مع بيانات Shopify
    const gptReply = await askChatGPT(message, from);

    // ✨ إرسال الرد للعميل
    await sendWhatsAppMessage(from, gptReply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});


// ================= SHOPIFY HELPERS =================

// ✅ جلب المنتجات
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
      stock: p.variants[0]?.inventory_quantity,
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
      body: p.body.slice(0, 200) // ملخص
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
      `${SHOPIFY_STORE_URL}/admin/api/2024-07/pages.json?limit=3`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.pages.map(p => ({
      title: p.title,
      body: p.body_html.replace(/<[^>]+>/g, "").slice(0, 200)
    }));
  } catch (err) {
    console.error("❌ Shopify pages error:", err.response?.data || err.message);
    return [];
  }
}

// ✅ جلب حالة الطلب
async function getOrderStatus(orderId) {
  try {
    const response = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-07/orders/${orderId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const order = response.data.order;
    return `📦 حالة طلبك #${order.id}: ${order.fulfillment_status || "قيد المعالجة"} | الدفع: ${order.financial_status}`;
  } catch (err) {
    console.error("❌ Shopify order error:", err.response?.data || err.message);
    return "لم أتمكن من العثور على تفاصيل الطلب، تأكد من رقم الطلب.";
  }
}


// ================= CHATGPT =================

async function askChatGPT(userMessage, userNumber) {
  try {
    // جلب بيانات المتجر
    const [products, policies, pages] = await Promise.all([
      getShopifyProducts(),
      getShopifyPolicies(),
      getShopifyPages()
    ]);

    // لو العميل كتب رقم طلب
    let orderReply = "";
    const orderIdMatch = userMessage.match(/\d{6,}/); // يلتقط رقم طلب
    if (orderIdMatch) {
      orderReply = await getOrderStatus(orderIdMatch[0]);
    }

    const context = `
🛒 المنتجات:
${products.map(p => `- ${p.title}: ${p.price} OMR | المخزون: ${p.stock} | ${p.url}`).join("\n")}

📜 السياسات:
${policies.map(p => `- ${p.title}: ${p.body}...`).join("\n")}

📄 الصفحات:
${pages.map(p => `- ${p.title}: ${p.body}`).join("\n")}

${orderReply ? `\n🔎 حالة الطلب:\n${orderReply}` : ""}
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
- رد بسرعة واحترافية باللهجة العمانية أو العربية الفصحى.
- وضّح للعميل المنتجات والأسعار والسياسات.
- إذا سأل عن رقم طلب، أعطه الحالة من Shopify.
- لا تعطي أبداً أي بيانات حساسة (بطاقات، إيميلات عملاء).
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


// ================= ULTRAMSG =================

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


// ================= START =================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
