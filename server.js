const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ مسار تجريبي للتأكد أن السيرفر شغال
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp bot is running");
});

// ✅ Webhook
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body || !body.data || !body.data.body) {
      console.log("❌ Received webhook but no message body:", body);
      return res.sendStatus(200);
    }

    const from = body.data.from.replace("@c.us", "");
    const message = body.data.body;

    console.log(`📩 رسالة من ${from}: ${message}`);

    // هنا تستدعي ChatGPT وترجع الرد
    // const gptReply = await askChatGPT(message);
    // await sendWhatsAppMessage(from, gptReply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
