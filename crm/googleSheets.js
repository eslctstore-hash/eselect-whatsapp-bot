// crm/googleSheets.js
// ----------------------------------------------------------------
// (تحديث V3.0) إضافة ذاكرة العملاء (Customers Sheet)
// ----------------------------------------------------------------

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

const CRM_SHEET_NAME = 'eSelect CRM Log';
const CUSTOMER_SHEET_NAME = 'Customers'; // (جديد)

let sheets;

// المصادقة
try {
  const auth = new GoogleAuth({
    keyFile: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
  });
  
  sheets = google.sheets({ version: 'v4', auth });
  console.log('Google Sheets authenticated successfully.');
  
  // (احترافي) التأكد من وجود الشيتات عند بدء التشغيل
  ensureSheetsExist();

} catch (error) {
    console.error('Error authenticating Google Sheets:', error.message);
}

/**
 * التأكد من وجود شيتات الـ CRM والعملاء
 */
async function ensureSheetsExist() {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID });
    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);
    
    if (!sheetNames.includes(CRM_SHEET_NAME)) {
      console.warn(`Sheet "${CRM_SHEET_NAME}" not found. Creating...`);
      await addSheet(CRM_SHEET_NAME);
    }
    if (!sheetNames.includes(CUSTOMER_SHEET_NAME)) {
      console.warn(`Sheet "${CUSTOMER_SHEET_NAME}" not found. Creating...`);
      await addSheet(CUSTOMER_SHEET_NAME);
    }
  } catch (err) {
    console.error('Error ensuring sheets exist:', err.message);
  }
}

async function addSheet(title) {
   try {
     await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_ID,
        resource: {
            requests: [{ addSheet: { properties: { title } } }]
        }
     });
     console.log(`Sheet "${title}" created successfully.`);
   } catch (err) {
       console.error(`Error creating sheet "${title}":`, err.message);
   }
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
  
  const row = [
    logData.timestamp, logData.name, logData.phone,
    logData.message, logData.intent, logData.response,
    logData.orderNo || '', logData.language, logData.sentiment,
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${CRM_SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });
    console.log('Successfully logged to Google Sheets CRM.');
  } catch (err) {
    console.error('Error logging to Google Sheets:', err.message);
  }
}

/**
 * (جديد V3.0) حفظ أو تحديث بيانات العميل (الهاتف هو المفتاح)
 * @param {string} phone - رقم العميل
 * @param {string} name - اسم العميل
 */
async function upsertCustomer(phone, name) {
    if (!sheets || !phone || !name) return;
    
    try {
        const range = `${CUSTOMER_SHEET_NAME}!A:B`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEETS_ID,
            range,
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === phone);

        if (rowIndex > -1) {
            // تحديث الاسم إذا اختلف
            if (rows[rowIndex][1] !== name) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${CUSTOMER_SHEET_NAME}!B${rowIndex + 1}`,
                    valueInputOption: 'RAW',
                    resource: { values: [[name]] },
                });
                console.log(`[Customer DB] Updated name for ${phone}.`);
            }
        } else {
            // إضافة عميل جديد
            await sheets.spreadsheets.values.append({
                spreadsheetId: GOOGLE_SHEETS_ID,
                range,
                valueInputOption: 'RAW',
                resource: { values: [[phone, name]] },
            });
            console.log(`[Customer DB] Added new customer ${phone}.`);
        }
    } catch (err) {
        console.error('Error in upsertCustomer:', err.message);
    }
}

/**
 * (جديد V3.0) جلب اسم العميل من الذاكرة
 * @param {string} phone - رقم العميل
 * @returns {Promise<string | null>}
 */
async function getCustomerName(phone) {
    if (!sheets) return null;
    
    try {
        const range = `${CUSTOMER_SHEET_NAME}!A:B`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEETS_ID,
            range,
        });
        
        const rows = response.data.values || [];
        const customer = rows.find(row => row[0] === phone);
        return customer ? customer[1] : null; // إرجاع الاسم
    } catch (err) {
        console.error('Error in getCustomerName:', err.message);
        return null;
    }
}

module.exports = {
  logToCRM,
  upsertCustomer,
  getCustomerName,
};
