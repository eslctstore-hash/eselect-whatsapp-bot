// src/server.cjs
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==== إعدادات البيئة ====
const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ULTRAMSG_API_URL = process.env.ULTRAMSG_API_URL;  // مثال: https://api.ultramsg.com/instanceXXXX/messages/chat
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;

// ==== حراسة الإعدادات ====
if (!OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY is missing");
if (!ULTRAMSG_API_URL) console.warn("⚠️ ULTRAMSG_API_URL is missing");
if (!ULTRAMSG_TOKEN) console.warn("⚠️ ULTRAMSG_TOKEN is missing");

// ==== تخفيف ازدواجية المعالجة (Idempotency) ====
const processedIds = new Map(); // sid -> timestamp
const DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 دقائق

function isDuplicate(sid) {
  if (!sid) return false;
  const now = Date.now();
  // نظف القديم
  for (const [k, v] of processedIds) {
    if (now - v > DEDUPE_TTL_MS) processedIds.delete(k);
  }
  if (processedIds.has(sid)) return true;
  processedIds.set(sid, now);
  return false;
}

// ==== Circuit Breaker بسيط ل429 ====
let circuitOpenUntil = 0; // ms timestamp
const CIRCUIT_COOLDOWN_MS = 30 * 1000; // 30 ثانية

function circuitOpen() {
  return Date.now() < circuitOpenUntil;
}
function tripCircuit() {
  circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  console.warn(`🚧 Circuit open for ${CIRCUIT_COOLDOWN_MS / 1000}s due to rate limiting`);
}

// ==== رسالة اعتذار موحّدة (لن نكرر إرسالها للعميل نفسه) ====
const APOLOGY = "عذرًا، حدث خطأ مؤقت. حاول مرة ثانية 🙏";
const sentApologyTo = new Map(); // phone -> timestamp
const APOLOGY_TTL_MS = 5 * 60 * 1000; // 5 دقائق

function shouldSendApologyOnce(to) {
  const now = Date.now();
  // نظف القديم
  for (const [k, v] of sentApologyTo) {
    if (now - v > APOLOGY_TTL_MS) sentApologyTo.delete(k);
  }
  if (sentApologyTo.has(to)) return false;
  sentApologyTo.set(to, now);
  return true;
}

// ==== صحّة ====
app.get("/", (_req, res) => {
  res.send("✅ WhatsApp bot is running...");
});

// ==== Webhook ====
app.post("/webhook", async (req, res) => {
  try {
    const eventType = req.body?.event_type;
    const data = req.body?.data || {};
    console.log("📩 Incoming:", { eventType, sample: { id: data.id, sid: data.sid, from: data.from, to: data.to, type: data.type, body: data.body, fromMe: data.fromMe } });

    // نعالج فقط رسائل العملاء
    if (eventType !== "message_received") {
      console.log("↩️ Ignored event_type:", eventType);
      return res.sendStatus(200);
    }

    // تحقق من الحقول الأساسية
    const from = data.from;         // مثل: 9689xxxx@c.us
    const to = data.to;             // رقم بوتك
    const body = data.body;
    const sid = data.sid;           // مهم لمنع التكرار
    const fromMe = data.fromMe;     // يجب أن تكون false لرسائل العملاء

    if (!from || !body) {
      console.log("⚠️ Missing from/body in message_received. Ignored.");
      return res.sendStatus(200);
    }

    if (fromMe === true) {
      // حماية إضافية: لا نرد على رسائلنا
      console.log("↩️ Ignored because fromMe=true (our own message).");
      return res.sendStatus(200);
    }

    if (isDuplicate(sid)) {
      console.log("⏩ Duplicate message sid detected, ignoring:", sid);
      return res.sendStatus(200);
    }

    // لا نرد على رسالتنا الموحّدة (لو وصلت كecho بطريقة ما)
    if (body && body.trim() === APOLOGY) {
      console.log("↩️ Incoming equals apology text. Ignored to prevent loop.");
      return res.sendStatus(200);
    }

    // ==== الرد باستخدام OpenAI ====
    let replyText = null;

    if (circuitOpen()) {
      // لا نضرب OpenAI أثناء الـcooldown
      console.log("🧯 Circuit open: skipping OpenAI call.");
    } else {
      try {
        const aiRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: OPENAI_MODEL,
            messages: [
              { role: "system", content: "أنت بوت خدمة عملاء عبر واتساب باللهجة العُمانية، مهذب، مباشر، وتقدم حلولاً عملية مختصرة. تجنب الرسائل المكررة، واطلب رقم الطلب عند لزومه. لا تعتذر أكثر من مرة." },
              { role: "user", content: body }
            ],
            max_tokens: 400,
            temperature: 0.3
          },
          { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );
        replyText = aiRes?.data?.choices?.[0]?.message?.content?.trim();
      } catch (err) {
        const code = err?.response?.data?.error?.code || err?.code;
        console.error("❌ OpenAI error:", err?.response?.data || err.message);
        if (code === "rate_limit_exceeded" || err?.response?.status === 429) {
          tripCircuit();
        }
      }
    }

    // fallback: رسالة موحّدة مرة واحدة لكل عميل خلال 5 دقائق
    if (!replyText || replyText.length === 0) {
      if (shouldSendApologyOnce(from)) {
        replyText = APOLOGY;
      } else {
        console.log("🛑 Skipping apology to avoid spam.");
        return res.sendStatus(200);
      }
    }

    // ==== إرسال الرد عبر Ultramsg ====
    try {
      const payload = { token: ULTRAMSG_TOKEN, to: from, body: replyText };
      const sendRes = await axios.post(ULTRAMSG_API_URL, payload, {
        headers: { "Content-Type": "application/json" }
      });
      console.log("✅ Sent via Ultramsg:", {
        to: from,
        ok: true,
        replyPreview: replyText.slice(0, 80)
      });
    } catch (err) {
      console.error("❌ Ultramsg send error:", err?.response?.data || err.message);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // دائماً 200 لعدم إعادة الإرسال من Ultramsg
    res.sendStatus(200);
  }
});

// ==== تشغيل السيرفر ====
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
