// ============================================================
// Code.gs — Webhook หลักและ Entry Point ของระบบทั้งหมด
//
// ไฟล์นี้ทำหน้าที่:
//   1. รับ HTTP Request จาก LINE Platform (doPost)
//   2. ตรวจสอบ Signature ความปลอดภัย
//   3. วิเคราะห์ Event และระบุ Role ของผู้ส่ง
//   4. ส่งต่อไปยัง Handler ที่ถูกต้อง
//      ├─ MonitorHandler  (หัวหน้าห้อง)
//      ├─ TeacherHandler  (ครูผู้สอน)
//      └─ AdminHandler    (ฝ่ายวิชาการ)
//   5. ฟังก์ชัน sendLineMessage() สำหรับส่งข้อความกลับ
//
// ⚠️  Deploy ไฟล์นี้เป็น Web App:
//      Execute as: Me
//      Who has access: Anyone
// ============================================================


// ============================================================
// 🌐 SECTION 1: doPost — รับ Webhook จาก LINE
// ============================================================

/**
 * รับ HTTP POST Request จาก LINE Platform
 * LINE จะส่ง Webhook มาที่ URL นี้ทุกครั้งที่มี Event
 *
 * @param {Object} e - Google Apps Script Event Object
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {

  // ตอบ LINE กลับทันทีว่าได้รับแล้ว (HTTP 200)
  // LINE จะ Retry ถ้าไม่ได้รับ Response ภายใน 30 วินาที
  const response = ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    // 1. ตรวจสอบว่ามีข้อมูลมาหรือไม่
    if (!e || !e.postData || !e.postData.contents) {
      logInfo('doPost', 'ไม่มีข้อมูล postData');
      return response;
    }

    const body      = e.postData.contents;
    const signature = e.parameter['x-line-signature'] ||
                      (e.headers && e.headers['X-Line-Signature']);

    // 2. ตรวจสอบ Signature (ความปลอดภัย)
    //    ป้องกัน Request ปลอมที่ไม่ได้มาจาก LINE
    if (!verifyLineSignature(body, signature)) {
      logInfo('doPost', '⚠️ Signature ไม่ถูกต้อง — ปฏิเสธ Request');
      return response; // ไม่ตอบ Error เพื่อไม่ให้ผู้ไม่หวังดีรู้
    }

    // 3. Parse JSON Body
    const data = JSON.parse(body);

    logInfo('doPost', `รับ Events จาก LINE`, `${data.events.length} events`);

    // 4. วนลูปประมวลผลทุก Event
    //    LINE อาจส่ง Events มาหลายรายการพร้อมกัน
    data.events.forEach(event => {
      try {
        processEvent(event);
      } catch (eventError) {
        // Error ใน Event หนึ่งไม่กระทบ Event อื่น
        logInfo('doPost', `ERROR ใน Event: ${event.type}`, eventError.message);
      }
    });

  } catch (error) {
    logInfo('doPost', 'ERROR ใน doPost', error.message);
  }

  return response;
}


/**
 * รับ HTTP GET Request
 * ใช้ทดสอบว่า Web App Deploy สำเร็จหรือไม่
 *
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  const statusInfo = {
    status:      'running',
    system:      'Teacher Check-in LINE Bot',
    school:      SCHOOL_CONFIG.SCHOOL_NAME,
    version:     '1.0.0',
    timestamp:   new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
    }),
  };

  return ContentService
    .createTextOutput(JSON.stringify(statusInfo, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// 🔐 SECTION 2: ตรวจสอบ Signature (Security)
// ============================================================

/**
 * ตรวจสอบ X-Line-Signature เพื่อยืนยันว่า Request
 * มาจาก LINE Platform จริง ไม่ใช่การปลอมแปลง
 *
 * วิธีการ: HMAC-SHA256 ของ Request Body
 *          โดยใช้ Channel Secret เป็น Key
 *          แล้วเปรียบเทียบกับ Signature ใน Header
 *
 * @param {string} body      - Raw Request Body (JSON String)
 * @param {string} signature - X-Line-Signature Header
 * @returns {boolean} true = Valid
 */
function verifyLineSignature(body, signature) {
  try {
    // ถ้าไม่มี Signature → ปฏิเสธทันที
    if (!signature) {
      logInfo('Security', 'ไม่มี Signature Header');
      return false;
    }

    // คำนวณ HMAC-SHA256
    const channelSecret = CREDENTIALS.LINE_CHANNEL_SECRET;
    const bodyBytes     = Utilities.newBlob(body).getBytes();
    const keyBytes      = Utilities.newBlob(channelSecret).getBytes();

    const hmac = Utilities.computeHmacSha256Signature(bodyBytes, keyBytes);

    // แปลงผลลัพธ์เป็น Base64
    const computedSignature = Utilities.base64Encode(hmac);

    // เปรียบเทียบ (สังเกต: trim() เพื่อกัน Whitespace)
    const isValid = computedSignature === signature.trim();

    if (!isValid) {
      logInfo('Security',
        'Signature ไม่ตรง',
        `Expected: ${computedSignature}, Got: ${signature}`
      );
    }

    return isValid;

  } catch (e) {
    logInfo('Security', 'ERROR verifyLineSignature', e.message);
    // ถ้าตรวจสอบไม่ได้ → ปฏิเสธเพื่อความปลอดภัย
    return false;
  }
}


// ============================================================
// 🔀 SECTION 3: Event Router — ส่งต่อไปยัง Handler
// ============================================================

/**
 * ประมวลผล LINE Event แต่ละรายการ
 * ระบุ Role ของผู้ส่ง แล้วส่งต่อไปยัง Handler ที่ถูกต้อง
 *
 * @param {Object} event - LINE Event Object
 */
function processEvent(event) {

  // ---- กรองเฉพาะ Event ที่ระบบรองรับ ----
  const supportedEvents = ['message', 'postback', 'follow', 'unfollow'];
  if (!supportedEvents.includes(event.type)) {
    logInfo('Router', `ข้ามข้าม Event: ${event.type}`);
    return;
  }

  // ---- ดึง User ID ----
  const userId = event.source && event.source.userId;
  if (!userId) {
    logInfo('Router', 'ไม่พบ userId ใน Event');
    return;
  }

  logInfo('Router', `Event: ${event.type} | User: ${userId}`);

  // ---- จัดการ Event พิเศษ ----

  // ผู้ใช้ Add Bot เป็นเพื่อน
  if (event.type === 'follow') {
    handleFollowEvent(userId);
    return;
  }

  // ผู้ใช้ Block Bot
  if (event.type === 'unfollow') {
    handleUnfollowEvent(userId);
    return;
  }

  // ---- ระบุ Role ของผู้ส่ง ----
  const userInfo = identifyUserRole(userId);
  logInfo('Router', `Role: ${userInfo.role}`, userId);

  // ---- ส่งต่อไปยัง Handler ตาม Role ----
  switch (userInfo.role) {

    case SYSTEM_CONFIG.USER_ROLE.ADMIN:
      logInfo('Router', 'ส่งต่อไป AdminHandler');
      handleAdminEvent(event, userInfo.data);
      break;

    case SYSTEM_CONFIG.USER_ROLE.TEACHER:
      logInfo('Router', 'ส่งต่อไป TeacherHandler');
      handleTeacherEvent(event, userInfo.data);
      break;

    case SYSTEM_CONFIG.USER_ROLE.MONITOR:
      logInfo('Router', 'ส่งต่อไป MonitorHandler');
      handleMonitorEvent(event, userInfo.data);
      break;

    case SYSTEM_CONFIG.USER_ROLE.UNKNOWN:
    default:
      // ผู้ใช้ไม่ได้ลงทะเบียนในระบบ
      logInfo('Router', 'Unknown User — ส่งข้อความแนะนำ');
      handleUnknownUser(userId, event);
      break;
  }
}


// ============================================================
// 👋 SECTION 4: Follow / Unfollow / Unknown User
// ============================================================

/**
 * จัดการเมื่อผู้ใช้ Add Bot เป็นเพื่อน
 * แสดงข้อความต้อนรับและแจ้ง LINE User ID
 * (Admin ใช้ ID นี้ไปกรอกใน Google Sheets)
 *
 * @param {string} userId - LINE User ID ที่เพิ่งเพิ่มเพื่อน
 */
function handleFollowEvent(userId) {
  logInfo('Follow', `ผู้ใช้ใหม่ Add Bot: ${userId}`);

  // ตรวจสอบก่อนว่าอยู่ในระบบหรือยัง
  const userInfo = identifyUserRole(userId);

  if (userInfo.role !== SYSTEM_CONFIG.USER_ROLE.UNKNOWN) {
    // อยู่ในระบบแล้ว → ต้อนรับตาม Role
    if (userInfo.role === SYSTEM_CONFIG.USER_ROLE.TEACHER) {
      sendLineMessage(userId, [
        { type: 'text', text: MESSAGES.WELCOME_TEACHER(userInfo.data['Teacher_Name']) },
        flexTeacherMenu(userInfo.data['Teacher_Name']),
      ]);
    } else if (userInfo.role === SYSTEM_CONFIG.USER_ROLE.MONITOR) {
      sendLineMessage(userId, [{
        type: 'text',
        text: MESSAGES.WELCOME_MONITOR(
          userInfo.data['Student_Name'],
          userInfo.data['Classroom']
        ),
      }]);
    } else if (userInfo.role === SYSTEM_CONFIG.USER_ROLE.ADMIN) {
      sendLineMessage(userId, [
        { type: 'text', text: '👔 ยินดีต้อนรับ Admin ฝ่ายวิชาการค่ะ!' },
        flexAdminMenu(),
      ]);
    }
    return;
  }

  // ยังไม่อยู่ในระบบ → ส่ง LINE ID ให้ Admin ไปลงทะเบียน
  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        `👋 สวัสดีค่ะ!\n\n` +
        `ยินดีต้อนรับสู่ระบบเช็คอินการเข้าสอน\n` +
        `${SCHOOL_CONFIG.SCHOOL_NAME}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 LINE User ID ของท่าน:\n` +
        `${userId}\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📌 กรุณาแจ้ง ID นี้ให้ฝ่ายวิชาการ\n` +
        `เพื่อลงทะเบียนเข้าใช้งานระบบค่ะ 🙏`,
    },
  ]);

  // แจ้ง Admin ด้วยว่ามีผู้ใช้ใหม่
  notifyAdminNewUser(userId);
}


/**
 * จัดการเมื่อผู้ใช้ Block Bot
 *
 * @param {string} userId - LINE User ID
 */
function handleUnfollowEvent(userId) {
  logInfo('Unfollow', `ผู้ใช้ Block Bot: ${userId}`);
  // บันทึก Log เท่านั้น ไม่ต้องทำอะไรเพิ่ม
}


/**
 * จัดการผู้ใช้ที่ไม่อยู่ในระบบ
 * แสดง User ID เพื่อให้ Admin ลงทะเบียน
 *
 * @param {string} userId - LINE User ID
 * @param {Object} event  - LINE Event
 */
function handleUnknownUser(userId, event) {

  // ถ้าเป็นข้อความ CHECKIN: → แจ้งว่าต้องลงทะเบียนก่อน
  if (
    event.type === 'message'       &&
    event.message.type === 'text'  &&
    event.message.text.startsWith('CHECKIN:')
  ) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        '⚠️ ท่านยังไม่ได้ลงทะเบียนในระบบค่ะ\n\n' +
        'กรุณาติดต่อฝ่ายวิชาการเพื่อลงทะเบียนก่อนใช้งานค่ะ 🙏',
    }]);
    return;
  }

  // ข้อความทั่วไป → แสดง User ID
  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        `⚠️ ระบบยังไม่พบข้อมูลของท่านค่ะ\n\n` +
        `📋 LINE User ID ของท่าน:\n` +
        `${userId}\n\n` +
        `กรุณาแจ้ง ID นี้ให้ฝ่ายวิชาการเพื่อลงทะเบียนค่ะ 🙏`,
    },
  ]);
}


/**
 * แจ้ง Admin เมื่อมีผู้ใช้ใหม่ Add Bot
 * ให้ Admin รู้ว่าต้องลงทะเบียนให้ใคร
 *
 * @param {string} newUserId - LINE User ID ของผู้ใช้ใหม่
 */
function notifyAdminNewUser(newUserId) {
  try {
    const msg =
      `📢 มีผู้ใช้ใหม่ Add Bot ค่ะ\n\n` +
      `LINE User ID:\n${newUserId}\n\n` +
      `กรุณาลงทะเบียนใน Google Sheets\n` +
      `ถ้าเป็นครูหรือหัวหน้าห้องค่ะ 📋`;

    CREDENTIALS.ADMIN_LINE_IDS.forEach(adminId => {
      sendLineMessage(adminId, [{ type: 'text', text: msg }]);
    });
  } catch (e) {
    logInfo('Follow', 'ERROR notifyAdminNewUser', e.message);
  }
}


// ============================================================
// 📤 SECTION 5: sendLineMessage — ส่งข้อความกลับหา LINE
// ============================================================

/**
 * ส่งข้อความกลับไปยัง LINE User
 * รองรับทั้ง Reply Message และ Push Message
 *
 * ใช้ Push Message (userId) เพราะ:
 *  - Reply Token หมดอายุใน 30 วินาที
 *  - GAS อาจใช้เวลาประมวลผลนานกว่านั้น
 *  - Push ส่งหา User ได้ทุกเมื่อ
 *
 * @param {string}        userId   - LINE User ID ปลายทาง
 * @param {Array<Object>} messages - Array ของ Message Objects
 * @returns {boolean} สำเร็จหรือไม่
 */
function sendLineMessage(userId, messages) {
  try {
    // ตรวจสอบ Input
    if (!userId || !messages || messages.length === 0) {
      logInfo('sendLineMessage', 'ERROR: userId หรือ messages ว่าง');
      return false;
    }

    // LINE รองรับสูงสุด 5 Messages ต่อ 1 Request
    // ถ้ามากกว่า 5 → แบ่งส่งเป็น Batch
    const batches = chunkArray(messages, 5);

    for (const batch of batches) {
      const payload = {
        to:       userId,
        messages: batch,
      };

      const options = {
        method:      'post',
        contentType: 'application/json',
        headers: {
          'Authorization': `Bearer ${CREDENTIALS.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        payload:          JSON.stringify(payload),
        muteHttpExceptions: true, // ไม่ Throw Error อัตโนมัติ
      };

      const result   = UrlFetchApp.fetch(
        'https://api.line.me/v2/bot/message/push',
        options
      );
      const httpCode = result.getResponseCode();

      if (httpCode !== 200) {
        logInfo('sendLineMessage',
          `ERROR HTTP ${httpCode}`,
          result.getContentText()
        );
        return false;
      }

      // รอเล็กน้อยระหว่าง Batch (Rate Limit)
      if (batches.length > 1) {
        Utilities.sleep(200);
      }
    }

    logInfo('sendLineMessage',
      `ส่งสำเร็จ ${messages.length} messages → ${userId}`);
    return true;

  } catch (e) {
    logInfo('sendLineMessage', 'ERROR', e.message);
    return false;
  }
}


/**
 * ส่งข้อความ Broadcast ไปยังหลาย User พร้อมกัน
 * ใช้สำหรับประกาศจาก Admin
 *
 * @param {Array<string>} userIds  - Array ของ LINE User IDs
 * @param {Array<Object>} messages - Messages ที่จะส่ง
 */
function sendBroadcastMessage(userIds, messages) {
  let successCount = 0;
  let failCount    = 0;

  userIds.forEach(userId => {
    const success = sendLineMessage(userId, messages);
    if (success) successCount++;
    else         failCount++;
    Utilities.sleep(100); // หน่วงเล็กน้อยป้องกัน Rate Limit
  });

  logInfo('Broadcast',
    `ส่งเสร็จ: ${successCount} สำเร็จ, ${failCount} ล้มเหลว`
  );
  return { success: successCount, failed: failCount };
}


// ============================================================
// 🛠️ SECTION 6: Utility Functions
// ============================================================

/**
 * แบ่ง Array เป็น Chunks ขนาดที่กำหนด
 * ใช้สำหรับแบ่ง Messages ที่เกิน 5 รายการ
 *
 * @param {Array}  array     - Array ต้นฉบับ
 * @param {number} chunkSize - ขนาดของแต่ละ Chunk
 * @returns {Array<Array>}
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}


/**
 * ดึง Profile ของ LINE User
 * ใช้ดึงชื่อเพื่อแสดงใน Log หรือข้อความต้อนรับ
 *
 * @param {string} userId - LINE User ID
 * @returns {Object|null} LINE Profile หรือ null
 */
function getLineUserProfile(userId) {
  try {
    const url     = `https://api.line.me/v2/bot/profile/${userId}`;
    const options = {
      method:  'get',
      headers: {
        'Authorization': `Bearer ${CREDENTIALS.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      muteHttpExceptions: true,
    };

    const result   = UrlFetchApp.fetch(url, options);
    const httpCode = result.getResponseCode();

    if (httpCode === 200) {
      return JSON.parse(result.getContentText());
    }
    return null;

  } catch (e) {
    logInfo('getLineUserProfile', 'ERROR', e.message);
    return null;
  }
}


// ============================================================
// 🏥 SECTION 7: Health Check และ System Status
// ============================================================

/**
 * ตรวจสอบสถานะระบบทั้งหมด
 * รันจาก GAS Editor เพื่อตรวจสอบก่อน Go-Live
 */
function systemHealthCheck() {
  logInfo('HealthCheck', '=== เริ่ม System Health Check ===');

  let allPassed = true;

  // --- 1. ตรวจสอบ Config ---
  logInfo('HealthCheck', '1. ตรวจสอบ Config...');
  if (!CREDENTIALS.LINE_CHANNEL_ACCESS_TOKEN ||
       CREDENTIALS.LINE_CHANNEL_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN_HERE') {
    logInfo('HealthCheck', '❌ LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
    allPassed = false;
  } else {
    logInfo('HealthCheck', '✅ LINE_CHANNEL_ACCESS_TOKEN พร้อม');
  }

  if (!CREDENTIALS.LINE_CHANNEL_SECRET ||
       CREDENTIALS.LINE_CHANNEL_SECRET === 'YOUR_CHANNEL_SECRET_HERE') {
    logInfo('HealthCheck', '❌ LINE_CHANNEL_SECRET ยังไม่ได้ตั้งค่า');
    allPassed = false;
  } else {
    logInfo('HealthCheck', '✅ LINE_CHANNEL_SECRET พร้อม');
  }

  if (!CREDENTIALS.SPREADSHEET_ID ||
       CREDENTIALS.SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
    logInfo('HealthCheck', '❌ SPREADSHEET_ID ยังไม่ได้ตั้งค่า');
    allPassed = false;
  } else {
    logInfo('HealthCheck', '✅ SPREADSHEET_ID พร้อม');
  }

  if (!CREDENTIALS.ADMIN_LINE_IDS ||
       CREDENTIALS.ADMIN_LINE_IDS[0] === 'U_ADMIN_LINE_ID_1_HERE') {
    logInfo('HealthCheck', '❌ ADMIN_LINE_IDS ยังไม่ได้ตั้งค่า');
    allPassed = false;
  } else {
    logInfo('HealthCheck', `✅ ADMIN_LINE_IDS: ${CREDENTIALS.ADMIN_LINE_IDS.length} คน`);
  }

  // --- 2. ตรวจสอบ Google Sheets ---
  logInfo('HealthCheck', '2. ตรวจสอบ Google Sheets...');
  try {
    const ss           = getSpreadsheet();
    const sheetNames   = ss.getSheets().map(s => s.getName());
    const requiredSheets = Object.values(SYSTEM_CONFIG.SHEETS);

    requiredSheets.forEach(name => {
      if (sheetNames.includes(name)) {
        logInfo('HealthCheck', `  ✅ Sheet "${name}" พร้อม`);
      } else {
        logInfo('HealthCheck', `  ❌ ไม่พบ Sheet "${name}"`);
        allPassed = false;
      }
    });
  } catch (e) {
    logInfo('HealthCheck', '❌ ไม่สามารถเชื่อมต่อ Google Sheets', e.message);
    allPassed = false;
  }

  // --- 3. ตรวจสอบ LINE API Connection ---
  logInfo('HealthCheck', '3. ตรวจสอบ LINE API...');
  try {
    const url     = 'https://api.line.me/v2/bot/info';
    const options = {
      method:  'get',
      headers: {
        'Authorization': `Bearer ${CREDENTIALS.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      muteHttpExceptions: true,
    };
    const result   = UrlFetchApp.fetch(url, options);
    const httpCode = result.getResponseCode();

    if (httpCode === 200) {
      const botInfo = JSON.parse(result.getContentText());
      logInfo('HealthCheck',
        `✅ LINE Bot พร้อม: ${botInfo.displayName}`);
    } else {
      logInfo('HealthCheck',
        `❌ LINE API Error: HTTP ${httpCode}`,
        result.getContentText()
      );
      allPassed = false;
    }
  } catch (e) {
    logInfo('HealthCheck', '❌ ไม่สามารถเชื่อมต่อ LINE API', e.message);
    allPassed = false;
  }

  // --- 4. ตรวจสอบข้อมูลใน Sheets ---
  logInfo('HealthCheck', '4. ตรวจสอบข้อมูลใน Sheets...');
  try {
    const teachers = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS);
    logInfo('HealthCheck',
      `✅ Teachers_Master: ${teachers.length} คน`);

    const monitors = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.MONITORS);
    logInfo('HealthCheck',
      `✅ ClassMonitors_Master: ${monitors.length} คน`);

    const schedules = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE);
    logInfo('HealthCheck',
      `✅ Subjects_Schedule: ${schedules.length} รายการ`);

  } catch (e) {
    logInfo('HealthCheck', '❌ ERROR ดึงข้อมูล Sheets', e.message);
    allPassed = false;
  }

  // --- 5. ตรวจสอบ PERIODS Config ---
  logInfo('HealthCheck', '5. ตรวจสอบ PERIODS Config...');
  if (PERIODS.length === 10) {
    logInfo('HealthCheck', `✅ PERIODS: ${PERIODS.length} คาบ`);
    PERIODS.forEach(p => {
      logInfo('HealthCheck',
        `  ${p.name}: ${p.start} – ${p.end}`);
    });
  } else {
    logInfo('HealthCheck',
      `⚠️ PERIODS มี ${PERIODS.length} คาบ (คาดหวัง 10)`);
  }

  // --- สรุป ---
  logInfo('HealthCheck', '=== สรุป Health Check ===');
  if (allPassed) {
    logInfo('HealthCheck', '🎉 ระบบพร้อมใช้งานทุกส่วน!');
  } else {
    logInfo('HealthCheck',
      '⚠️ พบปัญหาบางส่วน กรุณาแก้ไขก่อน Deploy');
  }

  return allPassed;
}


// ============================================================
// 🧪 SECTION 8: Testing Functions
// ============================================================

/**
 * ทดสอบส่ง Push Message ไปยัง User จริง
 * แก้ไข TEST_USER_ID ก่อนรัน
 */
function testSendMessage() {
  const TEST_USER_ID = 'U_TEST_LINE_ID_HERE'; // ← แก้ไข

  const success = sendLineMessage(TEST_USER_ID, [
    {
      type: 'text',
      text:
        `✅ ทดสอบระบบสำเร็จค่ะ!\n\n` +
        `🏫 ${SCHOOL_CONFIG.SCHOOL_NAME}\n` +
        `📅 ภาคเรียน ${SCHOOL_CONFIG.SEMESTER_CURRENT}\n` +
        `⏰ ${new Date().toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok',
        })}`,
    },
  ]);

  logInfo('TEST_SEND',
    success ? '✅ ส่งสำเร็จ' : '❌ ส่งไม่สำเร็จ');
}


/**
 * ทดสอบ Verify Signature ด้วยข้อมูลจำลอง
 */
function testVerifySignature() {
  logInfo('TEST_SIG', '--- ทดสอบ Verify Signature ---');

  // ถ้า Channel Secret ยังเป็นค่า Default → ข้ามการทดสอบนี้
  if (CREDENTIALS.LINE_CHANNEL_SECRET === 'YOUR_CHANNEL_SECRET_HERE') {
    logInfo('TEST_SIG', '⚠️ กรุณาตั้งค่า LINE_CHANNEL_SECRET ก่อนทดสอบ');
    return;
  }

  const testBody = JSON.stringify({ events: [] });
  const keyBytes = Utilities.newBlob(
    CREDENTIALS.LINE_CHANNEL_SECRET
  ).getBytes();
  const bodyBytes = Utilities.newBlob(testBody).getBytes();
  const hmac      = Utilities.computeHmacSha256Signature(bodyBytes, keyBytes);
  const validSig  = Utilities.base64Encode(hmac);

  // ทดสอบ Signature ถูกต้อง
  const validResult = verifyLineSignature(testBody, validSig);
  logInfo('TEST_SIG',
    validResult ? '✅ Signature ถูกต้อง Pass' : '❌ FAIL');

  // ทดสอบ Signature ผิด
  const invalidResult = verifyLineSignature(testBody, 'invalid_sig');
  logInfo('TEST_SIG',
    !invalidResult ? '✅ Signature ผิด Reject' : '❌ FAIL');
}


/**
 * ทดสอบ Event Router ด้วย Event จำลอง
 * แก้ไข TEST_USER_ID เป็น LINE ID ที่มีในระบบ
 */
function testEventRouter() {
  const TEST_USER_ID = 'U_TEST_LINE_ID_HERE'; // ← แก้ไข

  logInfo('TEST_ROUTER', '--- ทดสอบ Event Router ---');

  // จำลอง Message Event
  const mockEvent = {
    type:       'message',
    source:     { userId: TEST_USER_ID },
    replyToken: 'mock_reply_token',
    message: {
      type: 'text',
      id:   'mock_message_id',
      text: 'เมนู',
    },
  };

  try {
    processEvent(mockEvent);
    logInfo('TEST_ROUTER', '✅ processEvent ทำงานสำเร็จ');
  } catch (e) {
    logInfo('TEST_ROUTER', '❌ ERROR', e.message);
  }
}


/**
 * ทดสอบระบบทั้งหมดก่อน Go-Live
 * รันฟังก์ชันนี้ก่อน Deploy จริงทุกครั้ง
 */
function runAllTests() {
  logInfo('FULL_TEST', '=============================');
  logInfo('FULL_TEST', '   Full System Test Suite    ');
  logInfo('FULL_TEST', '=============================');

  // 1. Health Check
  logInfo('FULL_TEST', '\n--- Health Check ---');
  const healthy = systemHealthCheck();
  if (!healthy) {
    logInfo('FULL_TEST',
      '❌ หยุดทดสอบ — กรุณาแก้ไขปัญหาจาก Health Check ก่อน');
    return;
  }

  // 2. Sheet Connection
  logInfo('FULL_TEST', '\n--- Sheet Connection ---');
  testSheetConnection();

  // 3. QR Token
  logInfo('FULL_TEST', '\n--- QR Token ---');
  testCreateQRToken();

  // 4. Signature
  logInfo('FULL_TEST', '\n--- Signature ---');
  testVerifySignature();

  // 5. State Cache
  logInfo('FULL_TEST', '\n--- State Cache ---');
  testStateCache();

  // 6. Admin Data
  logInfo('FULL_TEST', '\n--- Admin Reports ---');
  testAdminReportsWithRealData();

  logInfo('FULL_TEST', '\n=============================');
  logInfo('FULL_TEST', '   ✅ ทดสอบครบทุกส่วนแล้ว!   ');
  logInfo('FULL_TEST', ' พร้อม Deploy และ Go-Live ค่ะ ');
  logInfo('FULL_TEST', '=============================');
}