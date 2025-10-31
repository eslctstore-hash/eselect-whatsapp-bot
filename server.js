import express from "express";
import cron from "node-cron";
import fs from "fs";
import { sendMessage, typingIndicator } from "./core/ultramsg.js";
import { logToSheet } from "./crm/googleSheets.js";
import { analyzeMedia } from "./ai/vision.js";
import { transcribeAudio } from "./ai/whisper.js";
import { detectIntent } from "./ai/intentEngine.js";
import { handleProductQuery } from "./handlers/productHandler.js";
import { handleOrderQuery } from "./handlers/orderHandler.js";
import { handleComplaint } from "./handlers/complaintHandler.js";
import { handleGeneral } from "./handlers/generalHandler.js";
import { analyzeProductLink } from "./core/shopify.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.data;
  if (!msg) return;

  const from = msg.from;
  const type = msg.type;
  const body = msg.body?.trim() || "";
  const media = msg.media || {};
  let userMessage = body;

  try {
    await typingIndicator(from);

    if (type === "audio" && media.url) {
      userMessage = await transcribeAudio(media.url);
    } else if ((type === "image" || type === "video") && media.url) {
      const description = await analyzeMedia(media.url);
      await sendMessage(from, description);
      await logToSheet(from, type, description);
      return;
    } else if (userMessage.includes("https://")) {
      const reply = await analyzeProductLink(userMessage);
      await sendMessage(from, reply);
      await logToSheet(from, "[🔗 Link]", reply);
      return;
    }

    const intent = await detectIntent(userMessage);
    let reply;

    switch (intent) {
      case "product_query":
        reply = await handleProductQuery(userMessage);
        break;
      case "order_query":
        reply = await handleOrderQuery(userMessage);
        break;
      case "complaint":
        reply = await handleComplaint(userMessage);
        break;
      default:
        reply = await handleGeneral(userMessage);
        break;
    }

    await sendMessage(from, reply);
    await logToSheet(from, userMessage, reply);
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    await sendMessage(from, "⚠️ حدث خلل مؤقت أثناء معالجة الرسالة. حاول لاحقًا 🙏");
  }
});

cron.schedule("*/30 * * * *", () => console.log("⏰ Bot Active & Synced"));
app.listen(PORT, () => console.log(`🚀 eSelect WhatsApp Bot v11.0 running on port ${PORT}`));
