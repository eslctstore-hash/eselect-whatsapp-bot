import axios from "axios";

const INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const TOKEN = process.env.ULTRAMSG_TOKEN;

// 🟢 إرسال رسالة نصية
export async function sendMessage(to, message) {
  try {
    const url = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;
    const payload = { token: TOKEN, to, body: message };
    const res = await axios.post(url, payload);
    console.log(`💬 Sent to ${to}: ${message}`);
    return res.data;
  } catch (err) {
    console.error("❌ sendMessage error:", err.response?.data || err.message);
  }
}

// 🕓 إظهار مؤشر الكتابة
export async function typingIndicator(to) {
  try {
    const url = `https://api.ultramsg.com/${INSTANCE_ID}/messages/typing`;
    await axios.post(url, { token: TOKEN, to, typing: true });
    await new Promise((r) => setTimeout(r, 1200));
  } catch (err) {
    console.error("⚠️ Typing indicator error:", err.message);
  }
}

// 🔊 تحميل وسائط صوت أو صورة
export async function downloadMediaFile(url, path) {
  const writer = (await import("fs")).createWriteStream(path);
  const response = await axios.get(url, { responseType: "stream" });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}
