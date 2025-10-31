// ai/salesAgent.js
// ----------------------------------------------------------------
// (ملف جديد V3.0) العقل البيعي الاحترافي
// ----------------------------------------------------------------

const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// قائمة بمنتجاتك الرئيسية - عدّلها حسب متجرك
const OUR_PRODUCTS = "شواحن سريعة للجوالات (آيفون وسامسونج)، كوابل شحن متينة، سماعات بلوتوث، باور بانك (شواحن متنقلة)، واكسسوارات سيارات.";

/**
 * (احترافي) توليد رد لسؤال عام عن المنتجات
 * @returns {Promise<string>}
 */
async function getStoreSummary() {
  const prompt = `أنت مساعد مبيعات في متجر "eSelect". سألك عميل "ما هي المنتجات المتوفرة لديكم؟".
  منتجاتنا الرئيسية هي: ${OUR_PRODUCTS}.
  
  اكتب رداً ترحيبياً وجذاباً يعرض هذه الفئات باختصار ويشجع العميل على السؤال عن منتج معين.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [ { role: 'user', content: prompt } ],
      temperature: 0.7,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error in getStoreSummary:', error);
    return `لدينا مجموعة مميزة من ${OUR_PRODUCTS}. هل تبحث عن شيء معين؟`;
  }
}

/**
 * (احترافي) اقتراح بدائل لمنتج غير موجود
 * @param {string} failedQuery - المنتج الذي بحث عنه العميل وفشل
 * @returns {Promise<string>}
 */
async function suggestAlternatives(failedQuery) {
  const prompt = `أنت مساعد مبيعات ذكي في متجر "eSelect". بحث العميل عن "${failedQuery}" ولم نجده.
  منتجاتنا الرئيسية المتوفرة هي: ${OUR_PRODUCTS}.
  
  اكتب رداً احترافياً يعتذر عن عدم توفر المنتج، ثم يقترح عليه منتجات بديلة ذات صلة من قائمتنا المتوفرة.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [ { role: 'user', content: prompt } ],
      temperature: 0.8,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error in suggestAlternatives:', error);
    return `عذراً، لم نجد "${failedQuery}" بالضبط، لكن لدينا منتجات أخرى قد تهمك مثل ${OUR_PRODUCTS}.`;
  }
}

module.exports = {
  getStoreSummary,
  suggestAlternatives,
};
