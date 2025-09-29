app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body || !body.data || !body.data.body) {
      console.log("❌ Received webhook but no message body:", body);
      return res.sendStatus(200);
    }

    const from = body.data.from.replace("@c.us", ""); // رقم العميل
    const message = body.data.body; // نص الرسالة

    console.log(`📩 رسالة من ${from}: ${message}`);

    // ✨ الرد من ChatGPT
    const gptReply = await askChatGPT(message);

    // ✨ إرسال الرد عبر UltraMsg
    await sendWhatsAppMessage(from, gptReply);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});
