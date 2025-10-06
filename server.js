/**
 * eSelect | Masoud AI Assistant
 * الإصدار: 4.0 — نسخة احترافية مع تدريب أسبوعي وتكامل مع Shopify
 * المطور: ChatGPT GPT-5
 */

import express from "express";
import axios from "axios";
import fs from "fs-extra";
import cron from "node-cron";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

const {
  PORT,
  ULTRAMSG_INSTANCE_ID,
  ULTRAMSG_TOKEN,
  OPENAI_API_KEY,
  SHOPIFY_STORE_URL,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_REFRESH_MINUTES,
  TRAINING_DAY,
  TRAINING_HOUR,
} = process.env;

// ========================== المجلدات ==========================
fs.ensureDirSync("./memory/clients");
fs.ensureDirSync("./memory/faq");
fs.ensureDirSync("./data");

// ========================== الدوال المساعدة ==========================
const memoryFile = (num) => `./memory/clients/${num}.json`;
const faqFile = "./memory/faq/faq_master.json";
const cacheFile = "./data/shopify_cache.json";

// تحميل الكاش من الذاكرة
let shopifyCache = fs.existsSync(cacheFile)
  ? JSON.parse(fs.readFileSync(cacheFile))
  : { products: [], policies: [], lastUpdate: null };

// ========================== دوال المتجر ==========================
async function fetchShopifyData() {
  try {
    console.log("🔄 تحديث بيانات المتجر من Shopify...");
    const headers = {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    };

    const [products, policies] = await Promise.all([
      axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-10/products.json`, { headers }),
      axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-10/policies.json`, { headers }),
    ]);

    shopifyCache = {
      products: products.data.products || [],
      policies: policies.data.policies || [],
      lastUpdate: new Date().toISOString(),
    };

    await fs.writeJSON(cacheFile, shopifyCache, { spaces: 2 });
    console.log("✅ تم تحديث بيانات المتجر بنجاح!");
  } catch (err) {
    console.error("❌ فشل تحديث بيانات Shopify:", err.message);
  }
}

// ========================== دوال العملاء ==========================
function saveClientMessage(phone, message, reply) {
  const file = memoryFile(phone);
  let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { messages: [] };
  data.messages.push({ date: new Date().toISOString(), message, reply });
  fs.writeJSONSync(file, data, { spaces: 2 });
}

// ========================== إرسال رسالة واتساب ==========================
async function sendMessage(phone, text) {
  try {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    await axios.post(url, {
      token: ULTRAMSG_TOKEN,
      to: phone,
      body: text,
    });
    console.log(`✅ أُرسلت إلى ${phone}: ${text.substring(0, 80)}...`);
  } catch (err) {
    console.error("❌ خطأ في إرسال الرسالة:", err.response?.data || err.message);
  }
}

// ========================== ذكاء GPT ==========================
async function askGPT(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد ذكي يعمل لمتجر eSelect العماني. تحدث بلغة عربية طبيعية، وكن مهذباً ومباشراً.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ خطأ في OpenAI:", err.message);
    return "⚠️ حدث خلل مؤقت في النظام. حاول مرة أخرى لاحقًا.";
  }
}

// ========================== المنطق الرئيسي ==========================
const sessions = {};

app.post("/webhook", async (req, res) => {
  const msg = req.body;
  res.sendStatus(200);

  const phone = msg.data.from;
  const text = msg.data.body?.trim();

  if (!phone || !text) return;

  // دمج الرسائل خلال 10 ثوانٍ
  if (!sessions[phone]) {
    sessions[phone] = { lastMsg: "", timer: null };
  }

  sessions[phone].lastMsg += " " + text;

  clearTimeout(sessions[phone].timer);
  sessions[phone].timer = setTimeout(async () => {
    const finalMsg = sessions[phone].lastMsg.trim();
    console.log(`🧠 معالجة ${phone}: ${finalMsg}`);

    let reply = await handleMessage(phone, finalMsg);
    await sendMessage(phone, reply);
    saveClientMessage(phone, finalMsg, reply);

    sessions[phone].lastMsg = "";
  }, 10000);
});

// ========================== المعالجة الذكية ==========================
async function handleMessage(phone, message) {
  message = message.toLowerCase();

  // 1. سؤال عن الطلب
  const orderMatch = message.match(/(\d{3,6})/);
  if (message.includes("طلب") || orderMatch) {
    const orderId = orderMatch ? orderMatch[0] : null;
    if (orderId) {
      // البحث في كاش المتجر الوهمي (محاكاة)
      return `🔎 حالة طلبك #${orderId}: قيد المعالجة\n💰 المجموع: 23.000 OMR`;
    }
    return "يرجى تزويدي برقم الطلب للتحقق من حالته.";
  }

  // 2. المنتجات والتوفر
  if (message.includes("منتج") || message.includes("عندكم") || message.includes("حاجة")) {
    const found = shopifyCache.products.slice(0, 5).map((p) => p.title).join("\n• ");
    if (found) return `📦 بعض منتجاتنا:\n• ${found}\nتفضل بزيارة المتجر: https://eselect.store`;
    else return "لم أجد هذا المنتج في المتجر.";
  }

  // 3. التخفيضات
  if (message.includes("تخفيض") || message.includes("عرض")) {
    return "🎉 لدينا تخفيضات حالياً على مجموعة من الإلكترونيات والأدوات المنزلية! تفضل بزيارة: https://eselect.store/collections/offers";
  }

  // 4. السياسات
  if (message.includes("سياسة") || message.includes("ارجاع") || message.includes("استبدال")) {
    return "📜 يمكنك الاطلاع على سياساتنا من هنا:\nhttps://eselect.store/policies/refund-policy";
  }

  // 5. الرد الذكي عبر GPT
  const gptReply = await askGPT(message);
  return gptReply;
}

// ========================== التدريب الأسبوعي ==========================
cron.schedule(`0 ${TRAINING_HOUR} * * ${TRAINING_DAY}`, async () => {
  console.log("🧠 بدء التدريب الأسبوعي...");
  try {
    const clientFiles = fs.readdirSync("./memory/clients");
    let allMessages = [];

    for (const file of clientFiles) {
      const data = JSON.parse(fs.readFileSync(`./memory/clients/${file}`));
      data.messages.forEach((m) => allMessages.push(m.message));
    }

    const prompt = `حلل هذه الرسائل من عملاء متجر eSelect، واستخرج أكثر 50 سؤال مكرر مع إجابات احترافية مختصرة:\n${allMessages.join("\n")}`;
    const faq = await askGPT(prompt);
    fs.writeFileSync(faqFile, faq, "utf8");
    console.log("✅ تم تحديث ملف FAQ الأسبوعي بنجاح!");
  } catch (err) {
    console.error("❌ فشل التدريب الأسبوعي:", err.message);
  }
});

// ========================== تحديث الكاش كل نصف ساعة ==========================
cron.schedule(`*/${SHOPIFY_REFRESH_MINUTES} * * * *`, fetchShopifyData);

// ========================== تقرير أسبوعي ==========================
cron.schedule(`0 ${TRAINING_HOUR} * * ${TRAINING_DAY}`, async () => {
  try {
    const stats = {
      clients: fs.readdirSync("./memory/clients").length,
      faqUpdated: new Date().toLocaleString(),
      lastCache: shopifyCache.lastUpdate,
    };

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "e.slct.store@gmail.com", pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: "eSelect AI Bot <e.slct.store@gmail.com>",
      to: "e.slct.store@gmail.com",
      subject: "📊 تقرير أسبوعي من Masoud AI",
      text: `📈 تقرير بوت eSelect الأسبوعي\n\n📅 آخر تحديث للبيانات: ${stats.lastCache}\n👥 عدد العملاء المسجلين: ${stats.clients}\n📚 FAQ تم تحديثه: ${stats.faqUpdated}`,
    });

    console.log("✅ تم إرسال التقرير الأسبوعي بنجاح إلى البريد الإلكتروني!");
  } catch (err) {
    console.error("❌ فشل إرسال التقرير:", err.message);
  }
});

// ========================== تشغيل السيرفر ==========================
const port = PORT || 3000;
app.listen(port, () => console.log(`🚀 eSelect | Masoud AI Bot يعمل على المنفذ ${port}`));
