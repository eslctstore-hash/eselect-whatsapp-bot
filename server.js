const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ للتأكد أن السيرفر شغال
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp bot is running");
});

// ✅ تسجيل أي Webhook يوصل
app.post("/webhook", (req, res) => {
  console.log("📩 Headers:", req.headers);
  console.log("📩 Body:", req.body);

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
