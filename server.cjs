const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ================== ENV VARS ==================
const PORT = process.env.PORT || 10000;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // myshopify domain
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "96894682186"; // رقم الدعم
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@eselect.store";

// ================== MEMORY ==================
let conversations = new Map();
let humanTakeover = new Map(); // userId => timestamp

// ================ HELPERS =================
async function sendMessage(to, body, buttons = null) {
  try {
    const payload = {
      token: ULTRAMSG_TOKEN,
      to,
      body
    };

    // لو فيه أزرار
    if (buttons) payload.buttons = buttons;

    const res = await axios.post(
      `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`,
      payload
    );
    console.log("✅ Sent via Ultramsg:", res.data);
  } catch (err) {
    console.error("❌ Ultramsg send error:", err.response?.data || err.message);
  }
}

// Normalize phone numbers (remove +, 00, keep last 8–9 digits)
function normalizePhone(num) {
  if (!num) return "";
  return num.replace(/\D/g, "") // remove non-digits
            .replace(/^968/, "") // remove Oman code if present
            .replace(/^00/, "")
            .replace(/^\+/, "")
            .slice(-8); // keep last 8 digits
}

// Get Shopify orders by phone
async function getOrdersByPhone(phone) {
  try {
    const res = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2023-07/orders.json?status=any&fields=id,name,phone,customer,shipping_address,total_price,financial_status,fulfillment_status,note,order_number`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const orders = res.data.orders || [];
    const normalized = normalizePhone(phone);

    return orders.filter((o) => {
      const shopifyPhone = normalizePhone(o.phone || o.customer?.phone || o.shipping_address?.phone || "");
      return shopifyPhone === normalized;
    });
  } catch (err) {
    console.error("❌ Shopify fetch error:", err.response?.data || err.message);
    return [];
  }
}

// GPT reply with full conversation memory
async function getGPTReply(userId, message) {
  try {
    if (!conversations.has(userId)) {
      conversations.set(userId, [
        { role: "system", content: "أنت موظف خدمة عملاء لمتجر eSelect | إي سيلكت. تجاوب بود واحتراف، باللهجة العمانية إن أمكن، وتركز على البيع وخدمة الزبون." }
      ]);
    }

    const history = conversations.get(userId);
    history.push({ role: "user", content: message });

    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: history,
        max_tokens: 400
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = res.data.choices[0].message.content.trim();
    history.push({ role: "assistant", content: reply });

    // save backup to file
    fs.writeFileSync("conversations.json", JSON.stringify([...conversations]));

    return reply;
  } catch (err) {
    console.error("❌ ChatGPT error:", err.response?.data || err.message);
    return "عذرًا، صار خطأ مؤقت. حاول مرة ثانية 🙏";
  }
}

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body.data;
    if (!data || data.type !== "chat" || data.fromMe) {
      return res.sendStatus(200);
    }

    const from = data.from; // 9689xxxx@c.us
    const msg = (data.body || "").trim();
    const userId = from.replace("@c.us", "");

    // Human takeover active?
    if (humanTakeover.has(userId)) {
      const since = Date.now() - humanTakeover.get(userId);
      if (since < 60 * 60 * 1000) {
        console.log(`⏸️ Ignoring ${userId} (human takeover active)`);
        return res.sendStatus(200);
      } else {
        humanTakeover.delete(userId);
      }
    }

    // Check if wants human
    if (/موظف|شخص|حقيقي|اكلم/.test(msg)) {
      await sendMessage(from, "تم تحويلك لأحد موظفينا المختصين 👨‍💼.", [
        { id: "call_support", title: "📞 الاتصال بخدمة العملاء", url: `https://wa.me/${SUPPORT_PHONE}` }
      ]);
      humanTakeover.set(userId, Date.now());
      return res.sendStatus(200);
    }

    // Get orders
    const orders = await getOrdersByPhone(userId);

    let reply;
    if (orders.length > 0) {
      reply = `مرحبًا بك! ✅ وجدنا ${orders.length} طلب(ات) مرتبطة برقمك:\n\n`;
      orders.forEach((o) => {
        reply += `🆔 الطلب #${o.order_number}\n💰 السعر: ${o.total_price} OMR\n💳 الدفع: ${o.financial_status}\n📦 التوصيل: ${o.fulfillment_status || "قيد التجهيز"}\n`;
        if (o.note) reply += `📝 ملاحظات: ${o.note}\n`;
        reply += `\n`;
      });
    } else {
      reply = await getGPTReply(userId, msg);
    }

    await sendMessage(from, reply);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp bot running on port ${PORT}`);
});
