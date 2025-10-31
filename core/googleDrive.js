// core/googleDrive.js
// ----------------------------------------------------------------
// وحدة رفع ملفات الصوت (TTS) إلى Google Drive وجعلها عامة
// ----------------------------------------------------------------

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

// إعداد المصادقة
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

/**
 * رفع ملف صوتي وجعله قابلاً للقراءة للجميع
 * @param {string} filePath - المسار المحلي للملف (e.g., /public/temp_123.mp3)
 * @returns {Promise<string>} - رابط التنزيل المباشر للملف
 */
async function uploadAudioAndGetLink(filePath) {
  const fileName = path.basename(filePath);

  try {
    // 1. رفع الملف
    const file = await drive.files.create({
      media: {
        mimeType: 'audio/mpeg',
        body: fs.createReadStream(filePath),
      },
      requestBody: {
        name: fileName,
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      },
      fields: 'id, webViewLink',
    });

    const fileId = file.data.id;
    console.log(`File uploaded to Drive with ID: ${fileId}`);

    // 2. جعل الملف عاماً (للقراءة فقط)
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // 3. حذف الملف المؤقت من السيرفر
    fs.unlinkSync(filePath);
    console.log(`Deleted temporary file: ${filePath}`);

    // 4. إرجاع رابط العرض (ليس رابط تنزيل مباشر، ولكنه يعمل للمشاركة)
    return file.data.webViewLink;

  } catch (error) {
    console.error('Error uploading to Google Drive:', error.message);
    // حذف الملف المؤقت حتى لو فشل الرفع
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return null;
  }
}

module.exports = {
  uploadAudioAndGetLink,
};
