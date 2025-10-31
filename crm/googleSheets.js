// crm/googleSheets.js
// ----------------------------------------------------------------
// وحدة تسجيل المحادثات (CRM) في Google Sheets
// (تم إصلاح خطأ 'sheetName is not defined')
// ----------------------------------------------------------------

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

let sheets;

// المصادقة
try {
  const auth = new GoogleAuth({
    keyFile: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
  });
  
  sheets = google.sheets({ version: 'v4', auth });
  console.log('Google Sheets authenticated successfully.');

} catch (error) {
    console.error('Error authenticating Google Sheets:', error.message);
}


/**
 * تسجيل صف جديد في شيت الـ CRM
 * @param {object} logData - البيانات المراد تسجيلها
 */
async function logToCRM(logData) {
  if (!sheets) {
      console.error('Google Sheets service is not initialized.');
      return;
  }
  
  // *** [الإصلاح] ***
  // تم نقل تعريف المتغير إلى هنا (خارج الـ try)
  // تأكد أن هذا الاسم يطابق 100% اسم التاب في ملفك
  const sheetName = 'eSelect CRM Log'; 

  // الأعمدة كما في الخطة:
  // Timestamp | Name | Phone | Message | Intent | Response | OrderNo | Language | Sentiment
  const row = [
    logData.timestamp,
    logData.name,
    logData.phone,
    logData.message,
    logData.intent,
    logData.response,
    logData.orderNo || '',
    logData.language,
    logData.sentiment,
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${sheetName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [row],
      },
    });
    console.log('Successfully logged to Google Sheets CRM.');
  } catch (err) {
    console.error('Error logging to Google Sheets:', err.message);
    if (err.message.includes('Unable to parse range')) {
        console.error(`ERROR: The sheet name "${sheetName}" might be incorrect. Please check your Google Sheet file.`);
    }
  }
}

module.exports = {
  logToCRM,
};
