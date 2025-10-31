// index.js
// ----------------------------------------------------------------
// الملف الرئيسي لتشغيل السيرفر والربط مع الـ Webhook
// ----------------------------------------------------------------

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { handleWebhook } = require('./handlers/messageHandler');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// التأكد من وجود مجلد /public لتخزين الملفات المؤقتة
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
  console.log('Created /public directory for temporary files.');
}

// المسار الرئيسي لاختبار أن السيرفر يعمل
app.get('/', (req, res) => {
  res.send('✅ eSelect WhatsApp Bot is running.');
});

// المسار الذي سيستقبل الـ Webhook من Ultramsg
app.post('/webhook', (req, res) => {
  console.log('--- Webhook Received ---');
  console.log(JSON.stringify(req.body, null, 2));

  // تمرير الطلب إلى المعالج الرئيسي
  handleWebhook(req.body);

  // الرد فوراً بـ 200 OK لإعلام Ultramsg بالاستلام
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Waiting for webhooks from Ultramsg...');
});
