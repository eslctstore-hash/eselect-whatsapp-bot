const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================== ENV VARS ==================
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // https://xxxx.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ================== TEST ROUTE ==================
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp bot is running - eSelect | إي سيلكت");
});

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body || !body.data || !body.data.body) {
      console.log("❌ Webhook بدون رسالة:", body);
      return res.sendStatus(200);
    }

    const from = body.data.from.replace("@c.us", ""); // رقم العميل
    const message = body.data.body.trim(); // نص الرسالة

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✅ ردود سريعة على التحيات
    const quickReply = handleQuickReplies(message);
    if (quickReply) {
      await sendWhatsAppMessage(from, quickReply);
      return res.sendStatus(200);
    }

    // ✨ الرد من ChatGPT + Shopify
    const gptReply = await askChatGPT(message, from);
    await sendWhatsAppMessage(from, gptReply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});

// ================== QUICK REPLIES ==================
function handleQuickReplies(msg) {
  const normalized = msg.toLowerCase();

  const greetings = ["مرحبا", "مرحبا", "اهلا", "هلا", "hi", "hello"];
  const salam = ["السلام عليكم", "سلام عليكم", "السلام", "سلام"];

  if (greetings.includes(normalized)) {
    return "أهلاً وسهلاً 👋، كيف أقدر أخدمك اليوم؟";
  }
  if (salam.includes(normalized)) {
    return "وعليكم السلام ورحمة الله وبركاته 🌹، تفضل كيف أقدر أساعدك؟";
  }

  return null; // يرسل للـ ChatGPT لو مش موجود هنا
}

// ================== SHOPIFY HELPERS ==================
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
      body: p.body.slice(0, 200)
    }));
  } catch (err) {
    console.error("❌ Shopify policies error:", err.response?.data || err.message);
    return [];
  }
}

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

// ================== CHATGPT ==================
async function askChatGPT(userMessage, userNumber) {
  try {
    const [products, policies, pages] = await Promise.all([
      getShopifyProducts(),
      getShopifyPolicies(),
      getShopifyPages()
    ]);

    // لو فيه رقم طلب
    let orderReply = "";
    const orderIdMatch = userMessage.match(/\d{6,}/);
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
أنت موظف خدمة عملاء افتراضي لمتجر eSelect | إي سيلكت.
- رد بذكاء واحترافية كأنك موظف بشري.
- رحّب بالعميل بطريقة ودودة باللهجة العمانية أو العربية الفصحى.
- إذا كان السؤال تحية فقط → رد بتحية مناسبة.
- إذا كان عن المنتجات أو الأسعار أو السياسات → اعتمد على البيانات المرفقة.
- إذا كان عن الطلبات → اعرض حالة الطلب بوضوح.
- اجعل الردود قصيرة، واضحة، وتركز على ما طلبه العميل فقط.
`
          },
          { role: "user", content: `رسالة العميل: ${userMessage}\n\nبيانات المتجر:\n${context}` }
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

// ================== ULTRAMSG ==================
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

// ================== START ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
