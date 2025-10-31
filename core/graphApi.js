import axios from "axios";

const GRAPH_TOKEN = process.env.GRAPH_TOKEN;

// 📲 تحليل رابط من فيسبوك / إنستجرام
export async function analyzeGraphPost(url) {
  try {
    const match = url.match(/(facebook|instagram)\.com\/[^/?]+\/([^/?]+)/);
    if (!match) return "⚠️ الرابط غير مدعوم حالياً.";

    const postId = match[2];
    const apiUrl = `https://graph.facebook.com/v19.0/${postId}?fields=caption,media_url,permalink&access_token=${GRAPH_TOKEN}`;
    const res = await axios.get(apiUrl);
    const data = res.data;

    return `📸 منشور من Meta:\n${data.caption?.slice(0, 300)}\n🔗 ${data.permalink}`;
  } catch (err) {
    console.error("⚠️ Graph API Error:", err.message);
    return "⚠️ لم أتمكن من جلب تفاصيل المنشور حالياً.";
  }
}
