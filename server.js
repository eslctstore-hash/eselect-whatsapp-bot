import express from "express";
import axios from "axios";
import fs from "fs";
import cron from "node-cron";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// ================== المتغيرات من .env ==================
const {
  ULTRAMSG_INSTANCE,
  ULTRAMSG_TOKEN,
  OPENAI_API_KEY,
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SUPPORT_EMAIL,
  PORT
} = process.env;

const ULTRAMSG_URL = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}`;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// ================== قواعد بيانات مؤقتة ==================
let customersMemory = {}; // ذاكرة المستخدمين
let productsCache = []; // ذاكرة المنتجات المؤقتة

// تحميل الذاكرة من الملف إذا موجود
if (fs.existsSync("memory.json")) {
  customersMemory = JSON.parse(fs.readFileSync("memory.json"));
}

// حفظ الذاكرة دورياً
const saveMemory = () => {
  fs.writeFileSync("memory.json", JSON.stringify(customersMemory, null, 2));
};

// ================== جلب بيانات المتجر ==================
async function fetchShopifyProducts() {
  try {
    const res = await axios.get(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products.json`, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    });
    productsCache = res.data.products.map(p => ({
      title: p.title,
      price: p.variants[0].price,
      available: p.status === "active",
      url: `https://${SHOPIFY_STORE_DOMAIN}/products/${p.handle}`
    }));
    console.log(`✅ تم تحديث بيانات المنتجات (${productsCache.length})`);
  } catch (err) {
    console.error("❌ خطأ في جلب بيانات Shopify:", err.message);
  }
}

// أول تحديث للمنتجات
fetchShopifyProducts();

// تحديث كل 30 دقيقة
cron.schedule("*/30 * * * *", fetchShopifyProducts);

// ================== إرسال واتساب ==================
async function sendWhatsAppMessage(to, body) {
  try {
    const res = await axios.post(`${ULTRAMSG_URL}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to,
      body
    });
    console.log(`✅ أُرسلت إلى ${to}: ${body.substring(0, 50)}...`);
  } catch (err) {
    console.error("❌ فشل إرسال رسالة:", err.message);
  }
}

// ================== ذكاء سياقي ==================
const userSessions = new Map();

function getFollowUpMessage(sender) {
  const now = Date.now();
  const lastInteraction = userSessions.get(sender);
  userSessions.set(sender, now);

  if (!lastInteraction) {
    return "👋 مرحبًا بك في eSelect | إي سيلكت! كيف أقدر أخدمك اليوم؟";
  }

  const diffMinutes = (now - lastInteraction) / (1000 * 60);
  if (diffMinutes < 10) {
    const followUps = [
      "أكيد! تحب أساعدك بشي ثاني؟ 😊",
      "تبغاني أتحقق من شي ثاني بعد؟ 🔍",
      "تمام، تبي أقدملك مساعدة بشي ثاني؟ 💬",
      "رائع 🙌 تحب أزودك بمعلومات أكثر؟"
    ];
    return followUps[Math.floor(Math.random() * followUps.length)];
  } else if (diffMinutes > 30) {
    return "هلا وسهلا فيك من جديد 🌟 كيف أقدر أخدمك اليوم؟";
  } else {
    return "هل تحتاج أي مساعدة إضافية؟ 😊";
  }
}

// ================== دمج الذاكرة ==================
function appendUserMemory(sender, text) {
  if (!customersMemory[sender]) {
    customersMemory[sender] = { history: [] };
  }
  customersMemory[sender].history.push({ msg: text, time: new Date() });
  saveMemory();
}

// ================== الرد بالذكاء الاصطناعي ==================
async function generateReply(sender, text) {
  try {
    let memoryContext = "";
    if (customersMemory[sender]?.history) {
      memoryContext = customersMemory[sender].history
        .slice(-10)
        .map(h => h.msg)
        .join("\n");
    }

    const productsList = productsCache
      .slice(0, 10)
      .map(p => `${p.title} - ${p.price} OMR`)
      .join("\n");

    const messages = [
      {
        role: "system",
        content: `أنت ماسعود، مساعد ذكي يتحدث باللهجة العمانية لمتجر eSelect الإلكتروني.
        رد على العملاء بشكل ودود واحترافي.
        استخدم لهجة عمانية خفيفة، وكن لبقًا جدًا.
        تعرف كل منتجات المتجر، الأسعار، طرق الدفع، وسياسة الشحن.
        إذا المتجر مغلق، قل للعميل أن المتجر تحت الصيانة مؤقتًا ويمكنه العودة لاحقًا.
        قائمة المنتجات المتوفرة: ${productsList}.`
      },
      {
        role: "user",
        content: memoryContext + "\n" + text
      }
    ];

    const res = await axios.post(
      OPENAI_URL,
      {
        model: "gpt-4-turbo",
        messages,
        temperature: 0.8
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ خطأ في OpenAI:", err.response?.data || err.message);
    return "⚠️ صار خلل بسيط بالنظام، جرب ترسل لي بعد شوي إن شاء الله.";
  }
}

// ================== المعالجة الرئيسية ==================
let messageQueue = {};
const MESSAGE_DELAY = 10000;

app.post("/webhook", async (req, res) => {
  const data = req.body;
  res.sendStatus(200);

  const from = data.from || data.sender || data.to;
  const message = data.body?.trim();
  if (!from || !message) return;

  if (!messageQueue[from]) messageQueue[from] = [];
  messageQueue[from].push(message);

  if (messageQueue[from].timeout) clearTimeout(messageQueue[from].timeout);

  messageQueue[from].timeout = setTimeout(async () => {
    const fullMsg = messageQueue[from].join(" ");
    delete messageQueue[from];

    console.log(`🧠 معالجة ${from}: ${fullMsg}`);
    appendUserMemory(from, fullMsg);

    let reply = await generateReply(from, fullMsg);
    if (!reply) reply = getFollowUpMessage(from);

    await sendWhatsAppMessage(from, reply);
  }, MESSAGE_DELAY);
});

// ================== إرسال تقرير أسبوعي ==================
cron.schedule("0 9 * * MON", async () => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SUPPORT_EMAIL,
      pass: process.env.EMAIL_PASS
    }
  });

  const report = `
📊 تقرير أسبوعي - Masoud AI
عدد المستخدمين: ${Object.keys(customersMemory).length}
عدد المنتجات المحفوظة: ${productsCache.length}
آخر تحديث: ${new Date().toLocaleString()}
  `;

  await transporter.sendMail({
    from: SUPPORT_EMAIL,
    to: SUPPORT_EMAIL,
    subject: "Masoud AI | التقرير الأسبوعي",
    text: report
  });
  console.log("📨 تم إرسال التقرير الأسبوعي بنجاح");
});

// ================== تشغيل السيرفر ==================
const port = PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 eSelect | Masoud AI Bot يعمل على المنفذ ${port}`);
});
