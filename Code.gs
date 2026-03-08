// ============================================================
// Code.gs — Logic ทั้งหมดของระบบเช็คอินการเข้าสอนของครู
// โรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา)
//
// สารบัญ:
//   SECTION 1  — PropertiesService (Credentials)
//   SECTION 2  — Webhook Entry Point (doPost / doGet)
//   SECTION 3  — Event Router
//   SECTION 4  — Follow / Unfollow / Unknown User
//   SECTION 5  — Monitor Flow (หัวหน้าห้อง)
//   SECTION 6  — Teacher Flow (ครูผู้สอน — State Machine)
//   SECTION 7  — Admin Flow (ฝ่ายวิชาการ)
//   SECTION 8  — Sheet Manager (CRUD)
//   SECTION 9  — Flex Messages (UI Templates)
//   SECTION 10 — LINE API (sendLineMessage)
//   SECTION 11 — Setup & Testing Functions
//
// ⚠️  Deploy เป็น Web App:
//      Execute as: Me
//      Who has access: Anyone
//
// ⚠️  ก่อนใช้งาน รันฟังก์ชัน setupCredentials()
//      ใน SECTION 11 เพื่อตั้งค่า Credentials ครั้งแรก
// ============================================================


// ============================================================
// 🔐 SECTION 1: PropertiesService — จัดการ Credentials
// ============================================================

/**
 * ดึงค่า Credential จาก Script Properties
 * ใช้แทน CREDENTIALS.XXX ในโค้ดเดิม
 *
 * Keys ที่รองรับ:
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   LINE_CHANNEL_SECRET
 *   SPREADSHEET_ID
 *   ADMIN_LINE_IDS   (JSON Array String เช่น ["Uabc","Udef"])
 *   BOT_BASIC_ID     (เช่น "@abc1234d")
 *
 * @param {string} key - ชื่อ Property ที่ต้องการ
 * @returns {string} ค่าที่เก็บไว้ หรือ '' ถ้าไม่พบ
 */
function getCredential(key) {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(key) || '';
}


/**
 * ดึง ADMIN_LINE_IDS เป็น Array
 * (เก็บใน Properties เป็น JSON String)
 *
 * @returns {Array<string>} Array ของ LINE User IDs
 */
function getAdminLineIds() {
  try {
    const raw = getCredential('ADMIN_LINE_IDS');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    logInfo('Props', 'ERROR getAdminLineIds', e.message);
    return [];
  }
}


/**
 * ตรวจสอบว่า Credentials ตั้งค่าครบหรือยัง
 *
 * @returns {Object} { ok: boolean, missing: Array<string> }
 */
function checkCredentials() {
  const required = [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'SPREADSHEET_ID',
    'ADMIN_LINE_IDS',
    'BOT_BASIC_ID',
  ];
  const missing = required.filter(k => !getCredential(k));
  return { ok: missing.length === 0, missing };
}


// ============================================================
// 🌐 SECTION 2: Webhook Entry Point
// ============================================================

/**
 * รับ HTTP POST Request จาก LINE Platform
 * LINE ส่ง Webhook มาทุกครั้งที่มี Event เกิดขึ้น
 *
 * @param {Object} e - GAS Event Object
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  // ตอบ LINE กลับทันที HTTP 200
  // LINE จะ Retry ถ้าไม่ได้รับภายใน 30 วินาที
  const response = ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      logInfo('doPost', 'ไม่มีข้อมูล postData');
      return response;
    }

    const body = e.postData.contents;

    // ── แก้ไขจากโค้ดเดิม ──────────────────────────────────
    // e.parameter ใช้สำหรับ Query String เท่านั้น
    // Signature ของ LINE อยู่ใน HTTP Header ซึ่งใน GAS
    // ต้องอ่านจาก e.postData หรือ e.headers
    // แต่ GAS Web App ไม่ส่ง Header ตรง ๆ มาใน e.headers
    // วิธีที่เชื่อถือได้คือให้ LINE ส่ง Signature ใน
    // Query String แทน หรือข้ามการ Verify ในช่วงพัฒนา
    // แล้วใช้ IP Whitelist ของ LINE แทน
    //
    // ⚠️  สำหรับ Production ควรใช้ LINE IP Ranges:
    //     https://developers.line.biz/en/docs/messaging-api/
    //     webhook-settings/#ip-addresses
    // ──────────────────────────────────────────────────────
    const signature = e.parameter && e.parameter['signature']
      ? e.parameter['signature']
      : (e.parameter && e.parameter['x-line-signature'])
        ? e.parameter['x-line-signature']
        : null;

    if (!verifyLineSignature(body, signature)) {
      logInfo('doPost', '⚠️ Signature ไม่ถูกต้อง — ปฏิเสธ Request');
      return response;
    }

    const data = JSON.parse(body);
    logInfo('doPost', `รับ ${data.events.length} events จาก LINE`);

    data.events.forEach(event => {
      try {
        processEvent(event);
      } catch (eventError) {
        logInfo('doPost', `ERROR ใน Event ${event.type}`, eventError.message);
      }
    });

  } catch (error) {
    logInfo('doPost', 'ERROR', error.message);
  }

  return response;
}


/**
 * รับ HTTP GET — ใช้ทดสอบว่า Deploy สำเร็จ
 *
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet() {
  const credCheck = checkCredentials();
  const status = {
    status:       'running',
    system:       'Teacher Check-in LINE Bot',
    school:       SCHOOL_CONFIG.SCHOOL_NAME,
    version:      '2.0.0',
    credentials:  credCheck.ok ? 'OK' : `MISSING: ${credCheck.missing.join(', ')}`,
    timestamp:    new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
  };
  return ContentService
    .createTextOutput(JSON.stringify(status, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * ตรวจสอบ X-Line-Signature
 *
 * @param {string}      body      - Raw Request Body
 * @param {string|null} signature - Signature ที่ได้รับ
 * @returns {boolean}
 */
function verifyLineSignature(body, signature) {
  try {
    // ถ้าไม่มี Signature ในช่วง Development ให้ผ่านไปก่อน
    // ⚠️ Production ต้องเปิด Strict Mode (return false ถ้าไม่มี Signature)
    if (!signature) {
      logInfo('Security', '⚠️ ไม่มี Signature — อนุญาตในช่วง Dev');
      return true; // ← เปลี่ยนเป็น false เมื่อ Production
    }

    const channelSecret = getCredential('LINE_CHANNEL_SECRET');
    if (!channelSecret) {
      logInfo('Security', 'ERROR: ไม่พบ LINE_CHANNEL_SECRET ใน Properties');
      return false;
    }

    const bodyBytes = Utilities.newBlob(body).getBytes();
    const keyBytes  = Utilities.newBlob(channelSecret).getBytes();
    const hmac      = Utilities.computeHmacSha256Signature(bodyBytes, keyBytes);
    const computed  = Utilities.base64Encode(hmac);
    const isValid   = computed === signature.trim();

    if (!isValid) {
      logInfo('Security', 'Signature ไม่ตรง', `computed=${computed}`);
    }
    return isValid;

  } catch (e) {
    logInfo('Security', 'ERROR verifyLineSignature', e.message);
    return false;
  }
}


// ============================================================
// 🔀 SECTION 3: Event Router
// ============================================================

/**
 * ประมวลผล LINE Event แต่ละรายการ
 * ระบุ Role แล้วส่งต่อ Handler ที่ถูกต้อง
 *
 * @param {Object} event - LINE Event Object
 */
function processEvent(event) {
  const supportedTypes = ['message', 'postback', 'follow', 'unfollow'];
  if (!supportedTypes.includes(event.type)) {
    logInfo('Router', `ข้าม Event ที่ไม่รองรับ: ${event.type}`);
    return;
  }

  const userId = event.source && event.source.userId;
  if (!userId) {
    logInfo('Router', 'ไม่พบ userId ใน Event');
    return;
  }

  logInfo('Router', `Event: ${event.type} | User: ${userId}`);

  // จัดการ Follow / Unfollow ก่อนระบุ Role
  if (event.type === 'follow') {
    handleFollowEvent(userId);
    return;
  }
  if (event.type === 'unfollow') {
    handleUnfollowEvent(userId);
    return;
  }

  // ระบุ Role
  const userInfo = identifyUserRole(userId);
  logInfo('Router', `Role: ${userInfo.role}`);

  switch (userInfo.role) {
    case SYSTEM_CONFIG.USER_ROLE.ADMIN:
      handleSuperAdminEvent(event, userInfo);
      break;
    case SYSTEM_CONFIG.USER_ROLE.DUAL_ROLE:         // ← ใหม่
      handleDualRoleEvent(event, userInfo);
      break;
    case SYSTEM_CONFIG.USER_ROLE.TEACHER:
      handleTeacherEvent(event, userInfo.data);
      break;
    case SYSTEM_CONFIG.USER_ROLE.MONITOR:
      handleMonitorEvent(event, userInfo.data);
      break;
    default:
      handleUnknownUser(userId, event);
      break;
  }
}


// ============================================================
// 👋 SECTION 4: Follow / Unfollow / Unknown User
// ============================================================

/**
 * ผู้ใช้ Add Bot เป็นเพื่อน
 *
 * @param {string} userId
 */
function handleFollowEvent(userId) {
  logInfo('Follow', `ผู้ใช้ใหม่: ${userId}`);

  const userInfo = identifyUserRole(userId);

  switch (userInfo.role) {
    case SYSTEM_CONFIG.USER_ROLE.TEACHER:
      sendLineMessage(userId, [
        {
          type: 'text',
          text:
            `สวัสดีค่ะ ${userInfo.data['Teacher_Name']} 🙏\n\n` +
            `ป้าไพรมาในรูปแบบใหม่นะคะ 😊\n` +
            `คราวนี้ป้าไพรมาช่วยดูแล\n` +
            `ระบบเช็คอินการเข้าสอนโดยเฉพาะค่ะ\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📲 วิธีเช็คอิน\n` +
            `สแกน QR Code จากหัวหน้าห้อง\n` +
            `ผ่าน LINE ได้เลยนะคะ\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `พิมพ์ /help เพื่อดูคู่มือได้เลยค่ะ 🎉`,
        },
        flexTeacherMenu(userInfo.data['Teacher_Name']),
      ]);
      break;

    case SYSTEM_CONFIG.USER_ROLE.MONITOR:
      sendLineMessage(userId, [{
        type: 'text',
        text:
          `สวัสดีค่ะ ${userInfo.data['Student_Name']} 🙏\n\n` +
          `ป้าไพรมาในรูปแบบใหม่นะคะ 😊\n` +
          `คราวนี้ป้าไพรมาช่วยดูแล\n` +
          `ระบบเช็คอินการเข้าสอนโดยเฉพาะค่ะ\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🏫 คุณคือหัวหน้าห้อง\n` +
          `${userInfo.data['Classroom']} ค่ะ\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `พิมพ์ /help เพื่อดูวิธีสร้าง QR\n` +
          `ได้เลยนะคะ 😊`,
      }]);
      sendMonitorMainMenu(userId, userInfo.data);
      break;

    case SYSTEM_CONFIG.USER_ROLE.ADMIN:
      sendLineMessage(userId, [{
        type: 'text',
        text:
          'สวัสดีค่ะ 🙏\n\n' +
          'ป้าไพรมาในรูปแบบใหม่นะคะ 😊\n' +
          'คราวนี้ป้าไพรมาช่วยดูแล\n' +
          'ระบบเช็คอินการเข้าสอนโดยเฉพาะค่ะ\n\n' +
          '━━━━━━━━━━━━━━━━━━\n' +
          '⚙️ ยินดีต้อนรับ Super Admin นะคะ\n' +
          'คุณสามารถใช้งานได้ทุกฟีเจอร์ค่ะ\n' +
          '━━━━━━━━━━━━━━━━━━',
      }]);
      sendSuperAdminMainMenu(userId);
      break;

    case SYSTEM_CONFIG.USER_ROLE.DUAL_ROLE: {
      const teacherData = userInfo.data.teacher;
      sendLineMessage(userId, [{
        type: 'text',
        text:
          `สวัสดีค่ะ ${teacherData['Teacher_Name']} 🙏\n\n` +
          `ป้าไพรมาในรูปแบบใหม่นะคะ 😊\n` +
          `คราวนี้ป้าไพรมาช่วยดูแล\n` +
          `ระบบเช็คอินการเข้าสอนโดยเฉพาะค่ะ\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `⭐ คุณมีสิทธิ์ 2 บทบาทนะคะ\n` +
          `👩‍🏫 ครูผู้สอน — เช็คอินเข้าสอน\n` +
          `📲 หัวหน้าระดับ — สร้าง QR ให้ครู\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `พิมพ์ /help เพื่อดูวิธีใช้งาน\n` +
          `ได้เลยนะคะ 😊`,
      }]);
      Utilities.sleep(300);
      sendDualRoleMainMenu(userId, teacherData);
      break;
    }

    default:
      sendLineMessage(userId, [{
        type: 'text',
        text:
          `สวัสดีค่ะ 🙏\n\n` +
          `ป้าไพรยินดีต้อนรับนะคะ 😊\n` +
          `ระบบนี้ดูแลการเช็คอินการเข้าสอน\n` +
          `ของ${SCHOOL_CONFIG.SCHOOL_NAME}ค่ะ\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📋 LINE User ID ของคุณ:\n` +
          `${userId}\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 ถ้าคุณเป็นครูผู้สอน\n` +
          `ลงทะเบียนได้เลยนะคะ:\n\n` +
          `พิมพ์  /reg ชื่อของคุณ\n` +
          `เช่น   /reg สมชาย\n\n` +
          `หรือติดต่อฝ่ายวิชาการได้เลยค่ะ 🙏`,
      }]);
      notifyAdminNewUser(userId);
      break;
  }
}


/**
 * ผู้ใช้ Block Bot
 *
 * @param {string} userId
 */
function handleUnfollowEvent(userId) {
  logInfo('Unfollow', `ผู้ใช้ Block Bot: ${userId}`);
}


/**
 * ผู้ใช้ที่ไม่ได้ลงทะเบียนในระบบ
 *
 * @param {string} userId
 * @param {Object} event
 */
function handleUnknownUser(userId, event) {
  // --- Postback จาก Unknown User ---
  if (event.type === 'postback') {
    const params = parsePostbackData(event.postback.data);
    const action = params['action'];

    if (action === 'reg_confirm') {
      handleRegConfirm(userId, params['teacher_id']);
      return;
    }
    if (action === 'reg_qr_confirm') {
      handleRegQRConfirm(userId, params['monitor_id']);
      return;
    }
    // Postback อื่น ๆ ที่ไม่รู้จัก
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.WELCOME_UNKNOWN }]);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text    = event.message.text.trim();
    const textLow = text.toLowerCase();

    // CHECKIN โดยไม่ได้ลงทะเบียน
    if (text.startsWith('CHECKIN:')) {
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.NOT_REGISTERED_CHECKIN }]);
      return;
    }

    // คำสั่ง /reg — ลงทะเบียนครูผู้สอน
    if (textLow.startsWith('/reg-qr')) {
      const keyword = text.slice(7).trim(); // ตัด "/reg-qr" ออก
      if (!keyword) {
        sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_QR_USAGE }]);
        return;
      }
      handleRegQRCommand(userId, keyword);
      return;
    }

    // คำสั่ง /reg — ต้องตรวจหลัง /reg-qr เพื่อป้องกัน prefix ชน
    if (textLow.startsWith('/reg')) {
      const keyword = text.slice(4).trim();
      if (!keyword) {
        sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_USAGE }]);
        return;
      }
      handleRegCommand(userId, keyword);
      return;
    }

    // ข้อความอื่น ๆ — แนะนำคำสั่งทั้งสอง
    sendLineMessage(userId, [{
      type: 'text',
      text:
        `สวัสดีค่ะ 🙏\n\n` +
        `ป้าไพรยังไม่พบข้อมูลของคุณ\n` +
        `ในระบบค่ะ 😅\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👩‍🏫 ถ้าคุณเป็นครูผู้สอน:\n` +
        `พิมพ์  /reg ชื่อของคุณ\n` +
        `เช่น   /reg สมชาย\n\n` +
        `📲 ถ้าคุณเป็นผู้สร้าง QR:\n` +
        `พิมพ์  /reg-qr ชื่อของคุณ\n` +
        `เช่น   /reg-qr สมชาย\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `หรือติดต่อฝ่ายวิชาการได้เลยค่ะ 🙏`,
    }]);
  }
}


/**
 * แจ้ง Admin เมื่อมีผู้ใช้ใหม่ Add Bot
 *
 * @param {string} newUserId
 */
function notifyAdminNewUser(newUserId) {
  try {
    getAdminLineIds().forEach(adminId => {
      sendLineMessage(adminId, [{
        type: 'text',
        text: MESSAGES.ADMIN_NEW_USER_NOTIFY(newUserId),
      }]);
    });
  } catch (e) {
    logInfo('Follow', 'ERROR notifyAdminNewUser', e.message);
  }
}


// ============================================================
// 📝 SECTION 4B: Teacher Registration Flow
// ============================================================

/**
 * Step 1: ค้นหาครูจาก keyword และแสดงผลลัพธ์
 *
 * @param {string} userId   - LINE User ID ของผู้ค้นหา
 * @param {string} keyword  - คำค้น (ชื่อหรือส่วนหนึ่งของชื่อ)
 */
function handleRegCommand(userId, keyword) {
  // ป้องกัน: ถ้า userId นี้ลงทะเบียนแล้ว
  const existing = getTeacherByLineId(userId);
  if (existing) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_ALREADY_REGISTERED }]);
    return;
  }

  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_SEARCHING(keyword) }]);

  const results = searchTeachersByKeyword(keyword);

  if (results.length === 0) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_NOT_FOUND(keyword) }]);
    return;
  }

  sendLineMessage(userId, [flexRegSearchResults(keyword, results)]);
}


/**
 * Step 2: ครูกดยืนยัน "นี่คือฉัน"
 * → ตรวจสอบ → Write LINE_User_ID ลง Sheet → แจ้ง Admin
 *
 * @param {string} userId     - LINE User ID ผู้ลงทะเบียน
 * @param {string} teacherId  - Teacher_ID ที่เลือก
 */
function handleRegConfirm(userId, teacherId) {
  if (!teacherId) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // ป้องกัน: userId นี้ลงทะเบียนแล้ว
  const existingByLineId = getTeacherByLineId(userId);
  if (existingByLineId) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_ALREADY_REGISTERED }]);
    return;
  }

  // ดึงข้อมูลครูจาก Teacher_ID
  const teacher = getTeacherById(teacherId);
  if (!teacher) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // ป้องกัน: Teacher_ID นี้มีคนลงทะเบียนแล้ว
  if (teacher['LINE_User_ID'] && teacher['LINE_User_ID'].toString().trim() !== '') {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.REG_TEACHER_TAKEN(teacher['Teacher_Name']),
    }]);
    return;
  }

  // บันทึก LINE_User_ID ลง Sheet
  const success = registerTeacherLineId(teacherId, userId);
  if (!success) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // แจ้งผลสำเร็จ
  sendLineMessage(userId, [
    { type: 'text', text: MESSAGES.REG_SUCCESS(teacher['Teacher_Name']) },
    flexTeacherMenu(teacher['Teacher_Name']),
  ]);

  // แจ้ง Admin
  getAdminLineIds().forEach(adminId => {
    sendLineMessage(adminId, [{
      type: 'text',
      text: MESSAGES.REG_ADMIN_NOTIFY(teacher['Teacher_Name'], userId),
    }]);
  });

  logInfo('Reg', `✅ ลงทะเบียนสำเร็จ: ${teacher['Teacher_Name']} (${userId})`);
}

// ============================================================
// 📲 SECTION 4C: QR Creator Registration Flow
// ============================================================

/**
 * Step 1: ค้นหาผู้สร้าง QR จาก keyword และแสดงผลลัพธ์
 *
 * @param {string} userId   - LINE User ID ของผู้ค้นหา
 * @param {string} keyword  - คำค้นหา (ชื่อหรือส่วนหนึ่งของชื่อ)
 */
function handleRegQRCommand(userId, keyword) {
  // ป้องกัน: ถ้า userId นี้ลงทะเบียนเป็น Monitor แล้ว
  const existingMonitor = getMonitorByLineId(userId);
  if (existingMonitor) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_QR_ALREADY_REGISTERED }]);
    return;
  }

  // ป้องกัน: ถ้า userId นี้ลงทะเบียนเป็นครูแล้ว ก็ไม่ควรลง Monitor ซ้ำ
  const existingTeacher = getTeacherByLineId(userId);
  if (existingTeacher) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        'ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n' +
        '⚠️ บัญชีนี้ลงทะเบียนเป็นครูผู้สอนแล้วค่ะ\n\n' +
        'หากต้องการแก้ไข กรุณาติดต่อ\n' +
        'ฝ่ายวิชาการได้เลยนะคะ 🙏',
    }]);
    return;
  }

  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_QR_SEARCHING(keyword) }]);

  const results = searchMonitorsByKeyword(keyword);

  if (results.length === 0) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_QR_NOT_FOUND(keyword) }]);
    return;
  }

  sendLineMessage(userId, [flexRegQRSearchResults(keyword, results)]);
}


/**
 * Step 2: ผู้สร้าง QR กดยืนยัน "นี่คือฉัน"
 * → ตรวจสอบ → Write LINE_User_ID → แจ้ง Admin → ส่งเมนู Monitor
 *
 * @param {string} userId    - LINE User ID ผู้ลงทะเบียน
 * @param {string} monitorId - Monitor_ID ที่เลือก
 */
function handleRegQRConfirm(userId, monitorId) {
  if (!monitorId) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // ป้องกัน: userId นี้ลงทะเบียนแล้ว
  const existingMonitor = getMonitorByLineId(userId);
  if (existingMonitor) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_QR_ALREADY_REGISTERED }]);
    return;
  }

  // ดึงข้อมูล Monitor จาก Monitor_ID
  const monitor = getMonitorById(monitorId);
  if (!monitor) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // ป้องกัน: Monitor_ID นี้มีคนลงทะเบียนแล้ว
  if (monitor['LINE_User_ID'] && monitor['LINE_User_ID'].toString().trim() !== '') {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.REG_QR_MONITOR_TAKEN(monitor['Student_Name']),
    }]);
    return;
  }

  // บันทึก LINE_User_ID ลง Sheet
  const success = registerMonitorLineId(monitorId, userId);
  if (!success) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // สร้าง Scope Label สำหรับข้อความต้อนรับ
  const scopeLabel = getScopeLabel(monitor);

  // แจ้งผลสำเร็จ
  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.REG_QR_SUCCESS(monitor['Student_Name'], scopeLabel),
  }]);

  // ส่งเมนู Monitor ทันที
  Utilities.sleep(500);
  sendMonitorMainMenu(userId, monitor);

  // แจ้ง Admin
  const creatorTypeDisplay = _getCreatorTypeDisplay(monitor['Creator_Type']);
  getAdminLineIds().forEach(adminId => {
    sendLineMessage(adminId, [{
      type: 'text',
      text: MESSAGES.REG_QR_ADMIN_NOTIFY(
        monitor['Student_Name'],
        creatorTypeDisplay,
        scopeLabel,
        userId
      ),
    }]);
  });

  logInfo('RegQR', `✅ ลงทะเบียนสำเร็จ: ${monitor['Student_Name']} (${userId})`);
}


/**
 * แปลง Creator_Type เป็นข้อความภาษาไทย
 * @private
 *
 * @param {string} creatorType
 * @returns {string}
 */
function _getCreatorTypeDisplay(creatorType) {
  const map = {
    [SYSTEM_CONFIG.CREATOR_TYPE.STUDENT]: '🎓 นักเรียนหัวหน้าห้อง',
    [SYSTEM_CONFIG.CREATOR_TYPE.TEACHER]: '👩‍🏫 ครูหัวหน้าระดับ',
    [SYSTEM_CONFIG.CREATOR_TYPE.STAFF]:   '👔 บุคลากรงานทะเบียน',
    [SYSTEM_CONFIG.CREATOR_TYPE.ADMIN]:   '🏫 ผู้บริหาร',
  };
  return map[creatorType] || creatorType || '-';
}


// ============================================================
// 👨‍🎓 SECTION 5: Monitor Flow (หัวหน้าห้อง)
// ============================================================

/**
 * Entry Point สำหรับ Monitor
 *
 * @param {Object} event
 * @param {Object} monitorData
 */
function handleMonitorEvent(event, monitorData) {
  try {
    if (event.type === 'message' && event.message.type === 'text') {
      handleMonitorMessage(event, monitorData);
    } else if (event.type === 'postback') {
      handleMonitorPostback(event, monitorData);
    } else {
      sendMonitorMainMenu(event.source.userId, monitorData);
    }
  } catch (e) {
    logInfo('Monitor', 'ERROR', e.message);
    sendLineMessage(event.source.userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
  }
}


/**
 * จัดการข้อความจาก Monitor
 *
 * @param {Object} event
 * @param {Object} monitorData
 */
function handleMonitorMessage(event, monitorData) {
  const userId  = event.source.userId;
  const textLow = event.message.text.trim().toLowerCase();

  // Special Commands
  if (textLow === '/help' || textLow === 'help') {
    sendMonitorHelp(userId, monitorData);
    return;
  }
  if (textLow === '/status' || textLow === 'status') {
    sendMonitorStatus(userId, monitorData);
    return;
  }

  if (['qr', 'สร้าง qr', 'สร้างqr', 'สร้างคิวอาร์', 'qr code',
       'ตาราง', 'ตารางเรียน', 'ตารางสอน'].includes(textLow)) {
    showTodaySchedule(userId, monitorData);
    return;
  }

  if (['เมนู', 'menu', 'หน้าหลัก'].includes(textLow)) {
    sendMonitorMainMenu(userId, monitorData);
    return;
  }

  sendMonitorMainMenu(userId, monitorData);
}


/**
 * จัดการ Postback จาก Monitor
 *
 * @param {Object} event
 * @param {Object} monitorData
 */
function handleMonitorPostback(event, monitorData) {
  const userId = event.source.userId;
  const params = parsePostbackData(event.postback.data);
  const action = params['action'];

  logInfo('Monitor', `Postback: ${action}`);

  switch (action) {
    case 'create_qr':
      // รองรับทั้ง key เต็มและ key ย่อ
      params.period    = params.period    || params.p;
      params.classroom = params.classroom || params.c;
      params.subject   = params.subject   || params.s;
      handleCreateQRRequest(userId, monitorData, params);
      break;
    case 'confirm_qr':
      params.period    = params.period    || params.p;
      params.classroom = params.classroom || params.c;
      params.subject   = params.subject   || params.s;
      handleConfirmQR(userId, monitorData, params);
      break;
    case 'cancel_qr':
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.CANCEL_QR }]);
      break;
    default:
      sendMonitorMainMenu(userId, monitorData);
  }
}


/**
 * แสดงตารางสอนวันนี้ของห้อง
 *
 * @param {string} userId
 * @param {Object} monitorData
 */
function showTodaySchedule(userId, monitorData) {
  const scopeLabel = getScopeLabel(monitorData);
  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.LOADING_SCHEDULE(scopeLabel),
  }]);

  const schedules = getScheduleByCreatorScope(monitorData);

  if (schedules.length === 0) {
    sendLineMessage(userId, [flexNoSchedule(scopeLabel)]);
    return;
  }

  // เติมชื่อครูแทน Teacher_ID ใน Card
  const schedulesDisplay = schedules.map(s => {
    const teacher = getTeacherById(s['Teacher_ID']);
    return {
      ...s,
      Teacher_Name: teacher ? teacher['Teacher_Name'] : s['Teacher_ID'],
    };
  });

  // LINE Carousel รองรับสูงสุด 11 Bubbles (+ 1 Header = 12)
  // ถ้าเกิน ให้แสดงเฉพาะ 11 รายการแรกและแจ้งผู้ใช้
  const MAX_BUBBLES = 11;
  const hasMore     = schedulesDisplay.length > MAX_BUBBLES;
  const toDisplay   = schedulesDisplay.slice(0, MAX_BUBBLES);

  sendLineMessage(userId, [flexPeriodList(scopeLabel, toDisplay)]);

  if (hasMore) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        `ป้าไพรแสดงได้ ${MAX_BUBBLES} รายการแรกนะคะ 😊\n` +
        `(พบทั้งหมด ${schedulesDisplay.length} รายการ)\n\n` +
        `ถ้าต้องการค้นหาห้องเฉพาะ\n` +
        `พิมพ์ชื่อห้อง เช่น "ม.2/3" ได้เลยค่ะ 🙏`,
    }]);
  }
}


/**
 * Step 1: หัวหน้าห้องกด "สร้าง QR" → แสดง Confirm Card
 *
 * @param {string} userId
 * @param {Object} monitorData
 * @param {Object} params
 */
function handleCreateQRRequest(userId, monitorData, params) {
  const periodNumber = Number(params['period']);
  const classroom    = params['classroom'] || '';
  const subjectCode  = params['subject']   || '';

  // ── ตรวจสอบความเป็นเจ้าของห้อง เฉพาะ Student เท่านั้น ────────────
  // Staff / Admin / Teacher-scope ข้ามการตรวจสอบนี้ได้
  const creatorType = (monitorData['Creator_Type'] || SYSTEM_CONFIG.CREATOR_TYPE.STUDENT).toString().trim();
  const isStudentCreator = creatorType === SYSTEM_CONFIG.CREATOR_TYPE.STUDENT;

  if (isStudentCreator) {
    const ownClassroom = monitorData['Classroom_Scope'] || monitorData['Classroom'] || '';
    if (classroom !== ownClassroom) {
      sendLineMessage(userId, [{
        type: 'text',
        text: 'ป้าไพรขอโทษด้วยนะคะ 🙏\n\nไม่สามารถสร้าง QR ให้ห้องอื่นได้ค่ะ\nกรุณาสร้างเฉพาะห้องของตัวเองนะคะ 😊',
      }]);
      return;
    }
  }
  // ────────────────────────────────────────────────────────────────────

  const subject = getSubjectByClassroomAndPeriod(classroom, periodNumber);
  if (!subject) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_NO_SCHEDULE }]);
    return;
  }

  const teacher = getTeacherById(subject['Teacher_ID']);
  const period  = getPeriodByNumber(periodNumber);
  if (!period) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  // ตรวจสอบ QR ซ้ำ
  if (checkActiveQRForPeriod(classroom, periodNumber)) {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.QR_DUPLICATE_ACTIVE(period.name, SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES),
    }]);
    return;
  }

  sendLineMessage(userId, [flexQRConfirm(subject, teacher, period)]);
}


/**
 * Step 2: หัวหน้าห้องกด "ยืนยันสร้าง QR" → สร้าง Token และ QR Image
 *
 * @param {string} userId
 * @param {Object} monitorData
 * @param {Object} params
 */
function handleConfirmQR(userId, monitorData, params) {
  const periodNumber = Number(params['period']);
  const classroom    = params['classroom'] || '';

  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.QR_CREATING }]);

  try {
    const subject = getSubjectByClassroomAndPeriod(classroom, periodNumber);
    if (!subject) {
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_NO_SCHEDULE }]);
      return;
    }

    const teacher = getTeacherById(subject['Teacher_ID']);
    const period  = getPeriodByNumber(periodNumber);

    const periodEndNumber = Number(subject['Period_End_Number'] || periodNumber);
    const periodEnd       = getPeriodByNumber(periodEndNumber);
    const periodRangeLabel = buildPeriodLabel(
      period ? period.name : `คาบที่ ${periodNumber}`,
      periodEndNumber,
      periodNumber
    );

    // สร้าง QR Token ใน Sheet
    const token = createQRSession({
      subjectCode:     subject['Subject_Code'],
      subjectName:     subject['Subject_Name'] || subject['Subject_Code'],
      teacherId:       subject['Teacher_ID'],
      teacherName:     teacher ? teacher['Teacher_Name'] : subject['Teacher_ID'],
      classroom:       classroom,
      periodNumber:    periodNumber,
      periodEndNumber: periodEndNumber,                                  // ← ใหม่
      periodName:      periodRangeLabel,
      createdByLineId: userId,
      createdByName:   monitorData['Student_Name'],
    });

    // สร้าง URL และ QR Image
    const qrUrl        = buildQRUrl(token);
    const qrImageUrl   = buildQRImageUrl(qrUrl);
    const displayLabel = `${periodRangeLabel} — ${subject['Subject_Name']}`;

    sendLineMessage(userId, [
      { type: 'text', text: MESSAGES.QR_SUCCESS(displayLabel, SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES) },
      { type: 'image', originalContentUrl: qrImageUrl, previewImageUrl: qrImageUrl },
      buildMonitorQuickReply(),
    ]);

  } catch (e) {
    logInfo('Monitor', 'ERROR handleConfirmQR', e.message);
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
  }
}


/**
 * แจ้งหัวหน้าห้องเมื่อครูเช็คอินสำเร็จ
 *
 * @param {string} monitorLineId
 * @param {string} teacherName
 * @param {string} subjectName
 * @param {string} periodName
 * @param {string} topic
 */
function notifyMonitorCheckin(monitorLineId, teacherName, subjectName, periodName, topic) {
  try {
    sendLineMessage(monitorLineId, [
      flexMonitorCheckinNotify(teacherName, subjectName, periodName, topic),
    ]);
  } catch (e) {
    logInfo('Monitor', 'ERROR notifyMonitorCheckin (non-critical)', e.message);
  }
}


/**
 * ส่งเมนูหลักให้หัวหน้าห้อง
 *
 * @param {string} userId
 * @param {Object} monitorData
 */
function sendMonitorMainMenu(userId, monitorData) {
  sendLineMessage(userId, [{
    type: 'text',
    text:
      `สวัสดีค่ะ ${monitorData['Student_Name']} 🙏\n` +
      `🏫 หัวหน้าห้อง ${monitorData['Classroom']}\n` +
      `📅 ${formatThaiDate(new Date())}\n\n` +
      `ป้าไพรพร้อมช่วยเหลือนะคะ 😊\n` +
      `กดปุ่มด้านล่างเพื่อใช้งานได้เลยค่ะ 👇`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '📲 สร้าง QR คาบเรียน', text: 'สร้าง QR' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '📅 ดูตารางวันนี้', text: 'ตาราง' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '❓ คู่มือ', text: '/help' },
        },
      ],
    },
  }]);
}


/**
 * Quick Reply หลังส่ง QR แล้ว
 *
 * @returns {Object} Message Object พร้อม Quick Reply
 */
function buildMonitorQuickReply() {
  return {
    type: 'text',
    text: 'ต้องการสร้าง QR คาบอื่นเพิ่มเติมไหมคะ? 😊',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '📲 สร้าง QR คาบอื่น', text: 'สร้าง QR' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '🏠 กลับเมนูหลัก', text: 'เมนู' },
        },
      ],
    },
  };
}


/**
 * ส่งคู่มือการใช้งานสำหรับหัวหน้าห้อง (/help)
 */
function sendMonitorHelp(userId, monitorData) {
  sendLineMessage(userId, [{
    type: 'text',
    text:
      `ป้าไพรยินดีช่วยนะคะ ${monitorData['Student_Name']} 😊\n\n` +
      `📋 คู่มือสำหรับหัวหน้าห้อง\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📲 ขั้นตอนสร้าง QR Code\n` +
      `1. กดปุ่ม "สร้าง QR คาบเรียน"\n` +
      `2. ป้าไพรจะแสดงตารางสอนวันนี้\n` +
      `3. เลือกคาบที่ต้องการ\n` +
      `4. กดยืนยัน รอรับ QR ได้เลยค่ะ 🎉\n` +
      `5. แสดง QR ให้ครูผู้สอนสแกนนะคะ\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⌨️ คำสั่งที่ใช้ได้\n\n` +
      `/help    ดูคู่มือนี้\n` +
      `/status  ดูสถานะเช็คอินวันนี้\n` +
      `ตาราง    ดูตารางสอนวันนี้\n` +
      `เมนู     กลับหน้าหลัก\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💡 หมายเหตุ\n` +
      `• QR Code มีอายุ ${SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES} นาทีนะคะ\n` +
      `• 1 คาบ สร้างได้ 1 QR ค่ะ\n` +
      `• ป้าไพรจะแจ้งเมื่อครูเช็คอินแล้วนะคะ 📲\n\n` +
      `มีอะไรให้ป้าไพรช่วยอีกไหมคะ 😊`,
  }]);
}


/**
 * ส่งสถานะการเช็คอินวันนี้แยกตามคาบ (/status)
 */
function sendMonitorStatus(userId, monitorData) {
  sendLineMessage(userId, [{ type: 'text', text: '⏳ ป้าไพรกำลังดึงข้อมูลให้นะคะ...' }]);

  const classroom = monitorData['Classroom'];
  const schedules = getScheduleByClassroomToday(classroom);

  if (schedules.length === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        `📊 สถานะการเช็คอินวันนี้\n` +
        `🏫 ${classroom}\n` +
        `📅 ${formatThaiDate(new Date())}\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `ป้าไพรไม่พบตารางสอนวันนี้ค่ะ\n` +
        `กรุณาตรวจสอบกับฝ่ายวิชาการนะคะ 🙏`,
    }]);
    return;
  }

  const todayLogs      = getTodayCheckInForClassroom(classroom);
  const checkedPeriods = new Set(todayLogs.map(l => Number(l['Period_Number'])));

  const lines = [
    `📊 สถานะการเช็คอินวันนี้`,
    `🏫 ${classroom}`,
    `📅 ${formatThaiDate(new Date())}`,
    `━━━━━━━━━━━━━━━━━━\n`,
  ];

  schedules.forEach(s => {
    const periodNum    = Number(s['Period_Number']);
    const periodEndNum = Number(s['Period_End_Number'] || s['Period_Number']);
    const period       = getPeriodByNumber(periodNum);
    const periodEnd    = getPeriodByNumber(periodEndNum);
    const timeLabel    = (period && periodEnd)
      ? `${period.start}–${periodEnd.end}`
      : (period ? `${period.start}–${period.end}` : '');
    const pLabel       = buildPeriodLabel(s['Period_Name'], periodEndNum, periodNum);
    const isChecked    = checkedPeriods.has(periodNum);
    const icon         = isChecked ? '✅' : '⏳';
    const statusText   = isChecked ? 'เช็คอินแล้วค่ะ' : 'รอเช็คอินค่ะ';

    lines.push(
      `${icon} ${pLabel} (${timeLabel})\n` +
      `   📚 ${s['Subject_Name']}\n` +
      `   ${statusText}`
    );
  });

  lines.push(`\n━━━━━━━━━━━━━━━━━━`);
  lines.push(`✅ เช็คอินแล้ว ${checkedPeriods.size}/${schedules.length} คาบค่ะ`);
  lines.push(`\nมีอะไรให้ป้าไพรช่วยอีกไหมคะ 😊`);

  sendLineMessage(userId, [{ type: 'text', text: lines.join('\n') }]);
}


// ============================================================
// 👩‍🏫 SECTION 6: Teacher Flow — State Machine
// ============================================================

/**
 * Entry Point สำหรับครูผู้สอน
 *
 * @param {Object} event
 * @param {Object} teacherData
 */
function handleTeacherEvent(event, teacherData) {
  try {
    if (event.type === 'message' && event.message.type === 'text') {
      handleTeacherMessage(event, teacherData);
    } else if (event.type === 'postback') {
      handleTeacherPostback(event, teacherData);
    } else {
      // ถ้ากำลังกรอกข้อมูลอยู่ → เตือนให้พิมพ์ตามแต่ละ State
      const state = getTeacherState(event.source.userId);
      if (state && state.step === SYSTEM_CONFIG.TEACHER_STATE.TEACHING) {
        handleTeacherBlockedInTeaching(event.source.userId, state);
      } else if (state && state.step !== SYSTEM_CONFIG.TEACHER_STATE.IDLE) {
        remindTeacherToType(event.source.userId, state);
      } else {
        sendTeacherMainMenu(event.source.userId, teacherData);
      }
    }
  } catch (e) {
    logInfo('Teacher', 'ERROR handleTeacherEvent', e.message);
    clearTeacherState(event.source.userId);
    sendLineMessage(event.source.userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
  }
}


/**
 * จัดการข้อความจากครู — ดู State ก่อนตัดสินใจ
 *
 * @param {Object} event
 * @param {Object} teacherData
 */
function handleTeacherMessage(event, teacherData) {
  const userId  = event.source.userId;
  const text    = event.message.text.trim();
  const textLow = text.toLowerCase();

  logInfo('Teacher', `ข้อความ: "${text}"`, teacherData['Teacher_Name']);

  // สแกน QR — ตรวจสอบก่อนเสมอ ไม่ว่าจะอยู่ State ไหน
  if (text.startsWith('CHECKIN:')) {
    const token = text.replace('CHECKIN:', '').trim();
    handleQRScan(userId, teacherData, token);
    return;
  }

  // Special Commands — ทำงานได้ทุก State ไม่ถูกบล็อกโดย State Machine
  if (textLow === '/help' || textLow === 'help') {
    sendTeacherHelp(userId, teacherData);
    return;
  }
  if (textLow === '/status' || textLow === 'status') {
    sendTeacherStatus(userId, teacherData);
    return;
  }

  // ยกเลิก — ใช้ได้ทุก State
  if (['ยกเลิก', 'cancel', 'ออก'].includes(textLow)) {
    handleTeacherCancel(userId, teacherData);
    return;
  }

  const currentState = getTeacherState(userId);
  const step = currentState ? currentState.step : SYSTEM_CONFIG.TEACHER_STATE.IDLE;

  switch (step) {
    case SYSTEM_CONFIG.TEACHER_STATE.SCANNED:
      // รอกดปุ่ม — ถ้าพิมพ์ข้อความแทนให้เตือน
      remindTeacherToType(userId, currentState);
      break;
    case SYSTEM_CONFIG.TEACHER_STATE.TEACHING:
      // กำลังสอนอยู่ — Block ทุกข้อความ (ยกเว้น /help, /status, ยกเลิก ที่จัดการไปก่อนแล้ว)
      handleTeacherBlockedInTeaching(userId, currentState);
      break;
    case SYSTEM_CONFIG.TEACHER_STATE.WAITING_TOPIC:
      handleTopicInput(userId, teacherData, text, currentState);
      break;
    case SYSTEM_CONFIG.TEACHER_STATE.WAITING_ASSIGNMENT:
      handleAssignmentInput(userId, teacherData, text, currentState);
      break;
    case SYSTEM_CONFIG.TEACHER_STATE.CONFIRM:
      remindTeacherToUseButton(userId);
      break;
    default:
      handleTeacherKeyword(userId, teacherData, text);
      break;
  }
}


/**
 * จัดการ Postback จากครู
 *
 * @param {Object} event
 * @param {Object} teacherData
 */
function handleTeacherPostback(event, teacherData) {
  const userId = event.source.userId;
  const params = parsePostbackData(event.postback.data);
  const action = params['action'];

  switch (action) {
    case 'confirm_teaching':      // ← ใหม่: ครูกดปุ่ม "เข้าสอน"
      handleConfirmTeaching(userId, teacherData);
      break;
    case 'request_checkout':      // ← ใหม่: ครูกดปุ่ม "เช็คเอาท์"
      handleCheckoutRequest(userId, teacherData);
      break;
    case 'confirm_checkin':
      handleConfirmCheckin(userId, teacherData);
      break;
    case 'edit_checkin':
      handleEditCheckin(userId, teacherData);
      break;
    case 'teacher_history':
      handleViewHistory(userId, teacherData);
      break;
    default:
      sendTeacherMainMenu(userId, teacherData);
  }
}


/**
 * ครูสแกน QR Code
 * → ตรวจสอบ Token → แสดงข้อมูลคาบ → เปลี่ยน State
 *
 * @param {string} userId
 * @param {Object} teacherData
 * @param {string} token
 */
function handleQRScan(userId, teacherData, token) {
  logInfo('Teacher', `สแกน Token: ${token}`, teacherData['Teacher_Name']);

  // ── 1. ตรวจสอบ State TEACHING ก่อนเลย ───────────────────
  const existingState = getTeacherState(userId);
  if (existingState && existingState.step === SYSTEM_CONFIG.TEACHER_STATE.TEACHING) {
    const qrData = existingState.qrData;
    const periodLabel = qrData
      ? buildPeriodLabel(
          qrData['Period_Name'],
          Number(qrData['Period_End_Number'] || qrData['Period_Number']),
          Number(qrData['Period_Number'])
        )
      : 'คาบที่กำลังสอนอยู่';
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.QR_BLOCKED_IN_TEACHING(periodLabel),
      quickReply: {
        items: [{
          type: 'action',
          action: {
            type: 'postback',
            label: '📤 เช็คเอาท์',
            data: 'action=request_checkout',
            displayText: 'เช็คเอาท์หลังสอนเสร็จ',
          },
        }],
      },
    }]);
    return;
  }
  // ────────────────────────────────────────────────────────

  // ── 2. ตรวจสอบ QR Token ──────────────────────────────────
  const validation = validateQRToken(token);
  if (!validation.valid) {
    const msgMap = {
      expired:   MESSAGES.QR_EXPIRED,
      used:      MESSAGES.QR_USED,
      not_found: MESSAGES.QR_INVALID,
      error:     MESSAGES.QR_INVALID,
    };
    sendLineMessage(userId, [{
      type: 'text',
      text: msgMap[validation.status] || MESSAGES.QR_INVALID,
    }]);
    return;
  }

  const qrData = validation.data;

  // ตรวจสอบว่าครูคนนี้สอนวิชานี้
  if (qrData['Teacher_ID'] !== teacherData['Teacher_ID']) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.QR_WRONG_TEACHER }]);
    return;
  }

  // ตรวจสอบว่าเช็คอินคาบนี้แล้วหรือยัง
  if (isAlreadyCheckedIn(teacherData['Teacher_ID'], Number(qrData['Period_Number']))) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_ALREADY_CHECKIN }]);
    return;
  }

  // ── 3. บันทึก State = SCANNED รอครูกดปุ่ม "เข้าสอน" ──────
  saveTeacherState(userId, {
    step:   SYSTEM_CONFIG.TEACHER_STATE.SCANNED,
    token:  token,
    qrData: qrData,
  });

  // แสดง Card ข้อมูลคาบ พร้อมปุ่ม "เข้าสอน" และ "ยกเลิก"
  sendLineMessage(userId, [flexClassInfo(qrData, teacherData)]);
  // ────────────────────────────────────────────────────────
}


/**
 * ครูกดปุ่ม "เข้าสอน" → บันทึกเวลาเข้าสอน → เปลี่ยน State เป็น TEACHING
 * State: SCANNED → TEACHING
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function handleConfirmTeaching(userId, teacherData) {
  const currentState = getTeacherState(userId);
  if (!currentState || currentState.step !== SYSTEM_CONFIG.TEACHER_STATE.SCANNED) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.SESSION_TIMEOUT }]);
    clearTeacherState(userId);
    return;
  }

  const qrData      = currentState.qrData;
  const checkinTime = new Date();

  // คำนวณ Status (ตรงเวลา / สาย) ณ ตอนกดเข้าสอน
  const period = getPeriodByNumber(Number(qrData['Period_Number']));
  let status   = SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME;
  if (period) {
    const [sh, sm] = period.start.split(':').map(Number);
    const graceEnd = new Date();
    graceEnd.setHours(sh, sm + SYSTEM_CONFIG.CHECKIN_GRACE_MINUTES, 0, 0);
    if (checkinTime > graceEnd) status = SYSTEM_CONFIG.CHECKIN_STATUS.LATE;
  }

  // บันทึก State = TEACHING พร้อม checkinTime และ status
  saveTeacherState(userId, {
    ...currentState,
    step:        SYSTEM_CONFIG.TEACHER_STATE.TEACHING,
    checkinTime: checkinTime.toISOString(),
    status:      status,
  });

  const periodLabel = buildPeriodLabel(
    qrData['Period_Name'],
    Number(qrData['Period_End_Number'] || qrData['Period_Number']),
    Number(qrData['Period_Number'])
  );

  // ส่งข้อความยืนยัน + Quick Reply ปุ่มเช็คเอาท์
  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.TEACHING_STARTED(periodLabel),
    quickReply: {
      items: [{
        type: 'action',
        action: {
          type: 'postback',
          label: '📤 เช็คเอาท์',
          data: 'action=request_checkout',
          displayText: 'เช็คเอาท์หลังสอนเสร็จ',
        },
      }],
    },
  }]);

  logInfo('Teacher', `✅ เข้าสอน: ${teacherData['Teacher_Name']} — ${periodLabel}`);
}


/**
 * ครูกดปุ่ม "เช็คเอาท์" → เปลี่ยน State เป็น WAITING_TOPIC
 * State: TEACHING → WAITING_TOPIC
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function handleCheckoutRequest(userId, teacherData) {
  const currentState = getTeacherState(userId);
  if (!currentState || currentState.step !== SYSTEM_CONFIG.TEACHER_STATE.TEACHING) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.SESSION_TIMEOUT }]);
    clearTeacherState(userId);
    return;
  }

  // เก็บ checkinTime และ status ไว้ใน State เดิม
  saveTeacherState(userId, {
    ...currentState,
    step:          SYSTEM_CONFIG.TEACHER_STATE.WAITING_TOPIC,
    teachingTopic: '',
    assignment:    '',
  });

  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.ASK_CHECKOUT_TOPIC,
    quickReply: {
      items: [{
        type: 'action',
        action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก' },
      }],
    },
  }]);
}


/**
 * ครูพิมพ์ข้อความหรือส่ง Sticker ขณะอยู่ใน State TEACHING
 * → Block + แสดงปุ่มเช็คเอาท์ทุกครั้ง
 *
 * @param {string} userId
 * @param {Object} state - current teacher state
 */
function handleTeacherBlockedInTeaching(userId, state) {
  const qrData = state ? state.qrData : null;
  const periodLabel = qrData
    ? buildPeriodLabel(
        qrData['Period_Name'],
        Number(qrData['Period_End_Number'] || qrData['Period_Number']),
        Number(qrData['Period_Number'])
      )
    : 'คาบที่กำลังสอนอยู่';

  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.BLOCKED_IN_TEACHING(periodLabel),
    quickReply: {
      items: [{
        type: 'action',
        action: {
          type: 'postback',
          label: '📤 เช็คเอาท์',
          data: 'action=request_checkout',
          displayText: 'เช็คเอาท์หลังสอนเสร็จ',
        },
      }],
    },
  }]);
}


/**
 * รับ "เรื่องที่สอน" จากครู
 * State: WAITING_TOPIC → WAITING_ASSIGNMENT
 *
 * @param {string} userId
 * @param {Object} teacherData
 * @param {string} text
 * @param {Object} currentState
 */
function handleTopicInput(userId, teacherData, text, currentState) {
  if (!text || text.length < 3) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.TOPIC_TOO_SHORT }]);
    return;
  }

  saveTeacherState(userId, {
    ...currentState,
    step:          SYSTEM_CONFIG.TEACHER_STATE.WAITING_ASSIGNMENT,
    teachingTopic: text,
  });

  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.ASK_ASSIGNMENT,
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '📭 ไม่มีงานมอบหมาย', text: 'ไม่มีงานมอบหมาย' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก' },
        },
      ],
    },
  }]);
}


/**
 * รับ "งานมอบหมาย" จากครู
 * State: WAITING_ASSIGNMENT → CONFIRM
 *
 * @param {string} userId
 * @param {Object} teacherData
 * @param {string} text
 * @param {Object} currentState
 */
function handleAssignmentInput(userId, teacherData, text, currentState) {
  const noAssignmentKeywords = ['ไม่มีงานมอบหมาย', 'ไม่มีงาน', 'ไม่มี', '-', 'none'];
  const assignment = noAssignmentKeywords.includes(text.toLowerCase()) ? '' : text;

  const qrData = currentState.qrData;
  const period = getPeriodByNumber(Number(qrData['Period_Number']));

  const periodEndNumber = Number(qrData['Period_End_Number'] || qrData['Period_Number']);
  const periodEnd       = getPeriodByNumber(periodEndNumber);
  const periodLabel     = buildPeriodLabel(
    qrData['Period_Name'],
    periodEndNumber,
    Number(qrData['Period_Number'])
  );

  const checkinData = {
    teacherName:     teacherData['Teacher_Name'],
    teacherId:       teacherData['Teacher_ID'],
    subjectCode:     qrData['Subject_Code'],
    subjectName:     qrData['Subject_Name'] || qrData['Subject_Code'],
    classroom:       qrData['Classroom'],
    periodNumber:    Number(qrData['Period_Number']),
    periodEndNumber: periodEndNumber,                          // ← ใหม่
    periodName:      periodLabel,
    timeStart:       period    ? period.start    : '-',
    timeEnd:         periodEnd ? periodEnd.end   : '-',        // ← ใหม่: ใช้เวลาสิ้นสุดของคาบสุดท้าย
    day:             getTodayDayName(),
    teachingTopic:   currentState.teachingTopic,
    assignment:      assignment,
    token:           currentState.token,
    checkinTime:     currentState.checkinTime || new Date().toISOString(), // ← ใหม่
    status:          currentState.status || SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME, // ← ใหม่
  };

  saveTeacherState(userId, {
    ...currentState,
    step:        SYSTEM_CONFIG.TEACHER_STATE.CONFIRM,
    assignment:  assignment,
    checkinData: checkinData,
  });

  sendLineMessage(userId, [flexCheckinConfirm(checkinData)]);
}


/**
 * ครูกด "ยืนยันเช็คอิน" → บันทึกลง Sheets
 * State: CONFIRM → IDLE
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function handleConfirmCheckin(userId, teacherData) {
  logInfo('Teacher', `ยืนยันเช็คเอาท์: ${teacherData['Teacher_Name']}`);

  const currentState = getTeacherState(userId);
  if (!currentState || currentState.step !== SYSTEM_CONFIG.TEACHER_STATE.CONFIRM) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.SESSION_TIMEOUT }]);
    clearTeacherState(userId);
    return;
  }

  const checkinData = currentState.checkinData;
  if (!checkinData) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    clearTeacherState(userId);
    return;
  }

  // ── ป้องกัน Double Submit ────────────────────────────────
  if (isAlreadyCheckedIn(checkinData.teacherId, checkinData.periodNumber)) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_ALREADY_CHECKIN }]);
    clearTeacherState(userId);
    return;
  }
  // ────────────────────────────────────────────────────────

  try {
    const checkoutTime    = new Date();
    const checkinTime     = checkinData.checkinTime
      ? new Date(checkinData.checkinTime)
      : checkoutTime;
    const durationMinutes = Math.round((checkoutTime - checkinTime) / 60000);

    const success = saveCheckIn({
      teacherId:       checkinData.teacherId,
      teacherName:     checkinData.teacherName,
      subjectCode:     checkinData.subjectCode,
      subjectName:     checkinData.subjectName,
      classroom:       checkinData.classroom,
      periodNumber:    checkinData.periodNumber,
      periodEndNumber: checkinData.periodEndNumber,            // ← ใหม่
      periodName:      checkinData.periodName,
      timeStart:       checkinData.timeStart,
      timeEnd:         checkinData.timeEnd,
      day:             checkinData.day,
      teachingTopic:   checkinData.teachingTopic,
      assignment:      checkinData.assignment,
      qrToken:         checkinData.token,
      status:          checkinData.status || SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME,
      checkinTime:     checkinTime,                            // ← ใหม่
      checkoutTime:    checkoutTime,                           // ← ใหม่
      durationMinutes: durationMinutes,                        // ← ใหม่
      checkoutStatus:  SYSTEM_CONFIG.CHECKOUT_STATUS.COMPLETED, // ← ใหม่
    });

    if (!success) throw new Error('saveCheckIn returned false');

    markQRTokenAsUsed(checkinData.token, userId);

    // แสดงผลสำเร็จ
    sendLineMessage(userId, [flexCheckinSuccess({
      ...checkinData,
      checkoutTime:    checkoutTime,
      durationMinutes: durationMinutes,
    })]);

    // แจ้ง Monitor และ Admin
    notifyMonitorAfterCheckin(checkinData, currentState.qrData);
    notifyAdminAfterCheckin(checkinData, checkinData.status);

    clearTeacherState(userId);

  } catch (e) {
    logInfo('Teacher', 'ERROR handleConfirmCheckin', e.message);
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    clearTeacherState(userId);
  }
}


/**
 * ครูกด "แก้ไข" → กลับไปกรอกเรื่องที่สอนใหม่
 * State: CONFIRM → WAITING_TOPIC
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function handleEditCheckin(userId, teacherData) {
  const currentState = getTeacherState(userId);
  if (!currentState) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.SESSION_TIMEOUT }]);
    return;
  }

  saveTeacherState(userId, {
    ...currentState,
    step:          SYSTEM_CONFIG.TEACHER_STATE.WAITING_TOPIC,
    teachingTopic: '',
    assignment:    '',
    checkinData:   null,
  });

  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.EDIT_CHECKIN + MESSAGES.ASK_CHECKOUT_TOPIC,
    quickReply: {
      items: [{
        type: 'action',
        action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก' },
      }],
    },
  }]);
}


/**
 * แสดงประวัติการเช็คอินของครู
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function handleViewHistory(userId, teacherData) {
  sendLineMessage(userId, [{ type: 'text', text: '⏳ กำลังดึงประวัติค่ะ...' }]);
  const history = getTeacherCheckInHistory(teacherData['Teacher_ID'], 10);
  sendLineMessage(userId, [flexTeacherHistory(teacherData['Teacher_Name'], history)]);
}


/**
 * ส่งคู่มือการใช้งานสำหรับครู (/help)
 */
function sendTeacherHelp(userId, teacherData) {
  sendLineMessage(userId, [{
    type: 'text',
    text:
      `ป้าไพรยินดีช่วยนะคะ ${teacherData['Teacher_Name']} 😊\n\n` +
      `📋 คู่มือการใช้งานระบบเช็คอิน\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📲 ขั้นตอนเช็คอิน\n` +
      `1. ขอให้หัวหน้าห้องสร้าง QR Code\n` +
      `2. สแกน QR ด้วย LINE Camera\n` +
      `3. ป้าไพรจะถามเรื่องที่สอนค่ะ\n` +
      `4. กรอกงานมอบหมาย (ถ้ามี)\n` +
      `5. กดยืนยัน — เสร็จเลยค่ะ! 🎉\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⌨️ คำสั่งที่ใช้ได้\n\n` +
      `/help    ดูคู่มือนี้\n` +
      `/status  ดูประวัติเช็คอินวันนี้\n` +
      `ประวัติ  ดูประวัติ 10 รายการล่าสุด\n` +
      `ยกเลิก   ยกเลิกการเช็คอินที่กำลังทำ\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💡 หมายเหตุ\n` +
      `QR Code มีอายุ ${SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES} นาทีนะคะ\n` +
      `สแกนให้ทันก่อนหมดอายุด้วยนะคะ 🙏\n\n` +
      `มีอะไรให้ป้าไพรช่วยอีกไหมคะ 😊`,
  }]);
}


/**
 * ส่งสถานะการเช็คอินวันนี้ของครู (/status)
 */
function sendTeacherStatus(userId, teacherData) {
  sendLineMessage(userId, [{ type: 'text', text: '⏳ ป้าไพรกำลังดึงข้อมูลให้นะคะ...' }]);

  const today      = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  // ดึงประวัติ 20 รายการล่าสุด แล้วกรองเฉพาะวันนี้
  const history   = getTeacherCheckInHistory(teacherData['Teacher_ID'], 20);
  const todayLogs = history.filter(log => new Date(log['Timestamp']) >= todayStart);

  if (todayLogs.length === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        `📊 สถานะการเช็คอินวันนี้\n` +
        `👩‍🏫 ${teacherData['Teacher_Name']}\n` +
        `📅 ${formatThaiDate(today)}\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `ป้าไพรยังไม่พบการเช็คอินในวันนี้ค่ะ\n\n` +
        `สแกน QR Code จากหัวหน้าห้อง\n` +
        `เพื่อเริ่มเช็คอินได้เลยนะคะ 😊`,
    }]);
    return;
  }

  const lines = [
    `📊 สถานะการเช็คอินวันนี้`,
    `👩‍🏫 ${teacherData['Teacher_Name']}`,
    `📅 ${formatThaiDate(today)}`,
    `━━━━━━━━━━━━━━━━━━\n`,
  ];

  todayLogs.forEach(log => {
    const icon        = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡';
    const checkinStr  = log['Checkin_Time']
      ? new Date(log['Checkin_Time']).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      : new Date(log['Timestamp']).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const checkoutStr = log['Checkout_Time']
      ? new Date(log['Checkout_Time']).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      : '-';
    const durationStr = log['Duration_Minutes'] ? `${log['Duration_Minutes']} นาที` : '-';

    lines.push(
      `${icon} ${log['Period_Name']}\n` +
      `   📚 ${log['Subject_Name']}\n` +
      `   🟢 เข้า ${checkinStr} น. → 🔴 ออก ${checkoutStr} น.\n` +
      `   ⏱️ รวม ${durationStr}\n` +
      `   📝 ${log['Teaching_Topic'] || '-'}`
    );
  });

  lines.push(`\n━━━━━━━━━━━━━━━━━━`);
  lines.push(`รวม ${todayLogs.length} คาบในวันนี้ค่ะ`);
  lines.push(`🟢 ตรงเวลา  🟡 สาย`);
  lines.push(`\nมีอะไรให้ป้าไพรช่วยอีกไหมคะ 😊`);

  sendLineMessage(userId, [{ type: 'text', text: lines.join('\n') }]);
}


/**
 * จัดการ Keyword ทั่วไปของครูใน State IDLE
 *
 * @param {string} userId
 * @param {Object} teacherData
 * @param {string} text
 */
function handleTeacherKeyword(userId, teacherData, text) {
  const t = text.toLowerCase();

  if (['เมนู', 'menu', 'หน้าหลัก'].includes(t)) {
    sendTeacherMainMenu(userId, teacherData);
    return;
  }
  if (['ประวัติ', 'history', 'ประวัติการสอน'].includes(t)) {
    handleViewHistory(userId, teacherData);
    return;
  }

  sendLineMessage(userId, [{
    type: 'text',
    text:
      `ป้าไพรยินดีช่วยนะคะ ${teacherData['Teacher_Name']} 💡\n\n` +
      `📲 วิธีใช้งานระบบเช็คอิน\n` +
      `สแกน QR Code จากหัวหน้าห้อง\n` +
      `เพื่อเริ่มกระบวนการเช็คอินได้เลยค่ะ\n\n` +
      `หรือพิมพ์ /help เพื่อดูคู่มือนะคะ 😊`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '📊 ประวัติการเช็คอิน',
            data: 'action=teacher_history',
            displayText: 'ดูประวัติการเช็คอิน',
          },
        },
        {
          type: 'action',
          action: { type: 'message', label: '🏠 เมนูหลัก', text: 'เมนู' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '❓ คู่มือ', text: '/help' },
        },
      ],
    },
  }]);
}


/**
 * ครูกด "ยกเลิก" ระหว่างกรอกข้อมูล
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function handleTeacherCancel(userId, teacherData) {
  const currentState = getTeacherState(userId);

  // ถ้าอยู่ใน TEACHING → ไม่อนุญาตให้ยกเลิก ต้อง Checkout ก่อน
  if (currentState && currentState.step === SYSTEM_CONFIG.TEACHER_STATE.TEACHING) {
    handleTeacherBlockedInTeaching(userId, currentState);
    return;
  }

  clearTeacherState(userId);
  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.CANCEL_CHECKIN }]);
}


/**
 * ส่งเมนูหลักครู
 *
 * @param {string} userId
 * @param {Object} teacherData
 */
function sendTeacherMainMenu(userId, teacherData) {
  sendLineMessage(userId, [flexTeacherMenu(teacherData['Teacher_Name'])]);
}


/**
 * เตือนให้ครูพิมพ์ข้อความแทนส่ง Sticker/Image
 *
 * @param {string} userId
 * @param {Object} state
 */
function remindTeacherToType(userId, state) {
  let msg;
  switch (state ? state.step : '') {
    case SYSTEM_CONFIG.TEACHER_STATE.SCANNED:
      msg = MESSAGES.REMIND_PRESS_TEACHING_BUTTON;
      break;
    case SYSTEM_CONFIG.TEACHER_STATE.WAITING_TOPIC:
      msg = MESSAGES.REMIND_TYPE_TOPIC;
      break;
    default:
      msg = MESSAGES.REMIND_TYPE_ASSIGNMENT;
  }
  sendLineMessage(userId, [{ type: 'text', text: msg }]);
}


/**
 * เตือนให้กดปุ่มใน Confirm Card
 *
 * @param {string} userId
 */
function remindTeacherToUseButton(userId) {
  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REMIND_USE_BUTTON }]);
}


/**
 * แจ้ง Monitor หลังเช็คอิน
 *
 * @param {Object} checkinData
 * @param {Object} qrData
 */
function notifyMonitorAfterCheckin(checkinData, qrData) {
  try {
    const monitorLineId = qrData && qrData['Created_By_LineID'];
    if (!monitorLineId) return;
    notifyMonitorCheckin(
      monitorLineId,
      checkinData.teacherName,
      checkinData.subjectName,
      checkinData.periodName,
      checkinData.teachingTopic
    );
  } catch (e) {
    logInfo('Teacher', 'ERROR notifyMonitorAfterCheckin (non-critical)', e.message);
  }
}


/**
 * แจ้ง Admin ทุกคนหลังเช็คอิน
 *
 * @param {Object} checkinData
 * @param {string} status
 */
function notifyAdminAfterCheckin(checkinData, status) {
  try {
    const icon  = status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡';
    const label = status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? 'ตรงเวลา' : 'สาย';
    const time  = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const msg =
      `${icon} เช็คอินใหม่ — ${label}\n` +
      `👩‍🏫 ${checkinData.teacherName}\n` +
      `📚 ${checkinData.subjectName}\n` +
      `🏫 ${checkinData.classroom}\n` +
      `🕐 ${checkinData.periodName} (${time} น.)\n` +
      `📝 ${checkinData.teachingTopic}`;

    // ดึง LINE ID ของครูที่เพิ่งเช็คอิน
    // เพื่อป้องกัน Admin แจ้งเตือนตัวเองซ้ำซ้อน
    const checkerLineId = getTeacherLineIdByTeacherId(checkinData.teacherId);

    getAdminLineIds().forEach(adminId => {
      if (checkerLineId && adminId === checkerLineId) {
        logInfo('Teacher', 'ข้ามแจ้งเตือน — Admin เช็คอินตัวเอง', adminId);
        return;
      }
      sendLineMessage(adminId, [{ type: 'text', text: msg }]);
    });
  } catch (e) {
    logInfo('Teacher', 'ERROR notifyAdminAfterCheckin (non-critical)', e.message);
  }
}


// ── State Management (ScriptCache) ───────────────────────────
// ใช้ ScriptCache + Key = prefix+userId
// เพื่อแยก State ของครูแต่ละคนออกจากกัน
// แก้ไขปัญหาจากโค้ดเดิมที่ใช้ getUserCache()
// ซึ่ง Execute as Me ทำให้ State ทับกันทุกคน
// ─────────────────────────────────────────────────────────────

/**
 * บันทึก State ของครูลง ScriptCache
 *
 * @param {string} userId
 * @param {Object} state
 */
function saveTeacherState(userId, state) {
  try {
    const key = SYSTEM_CONFIG.CACHE_KEY_PREFIX + userId;
    const ttl = SYSTEM_CONFIG.STATE_CACHE_EXPIRE_SECONDS;
    CacheService.getScriptCache().put(key, JSON.stringify(state), ttl);
    logInfo('State', `Save: ${state.step}`, userId);
  } catch (e) {
    logInfo('State', 'ERROR saveTeacherState', e.message);
  }
}


/**
 * ดึง State ของครูจาก ScriptCache
 *
 * @param {string} userId
 * @returns {Object|null}
 */
function getTeacherState(userId) {
  try {
    const key    = SYSTEM_CONFIG.CACHE_KEY_PREFIX + userId;
    const cached = CacheService.getScriptCache().get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    logInfo('State', 'ERROR getTeacherState', e.message);
    return null;
  }
}


/**
 * ลบ State ของครูออกจาก Cache (กลับ IDLE)
 *
 * @param {string} userId
 */
function clearTeacherState(userId) {
  try {
    const key = SYSTEM_CONFIG.CACHE_KEY_PREFIX + userId;
    CacheService.getScriptCache().remove(key);
    logInfo('State', `Clear State`, userId);
  } catch (e) {
    logInfo('State', 'ERROR clearTeacherState', e.message);
  }
}

// ── Admin Mode Management (ScriptCache) ──────────────────────
// ใช้ Cache Key ต่างจาก Teacher State เพื่อไม่ให้ทับกัน
// Key = ADMIN_MODE_CACHE_KEY_PREFIX + userId
// ─────────────────────────────────────────────────────────────

/**
 * บันทึกโหมดปัจจุบันของ Admin ลง ScriptCache
 *
 * @param {string} userId
 * @param {string} mode  - ค่าจาก SYSTEM_CONFIG.ADMIN_MODE
 */
function saveAdminMode(userId, mode) {
  try {
    const key = SYSTEM_CONFIG.ADMIN_MODE_CACHE_KEY_PREFIX + userId;
    CacheService.getScriptCache().put(key, mode, SYSTEM_CONFIG.STATE_CACHE_EXPIRE_SECONDS);
    logInfo('AdminMode', `Set mode: ${mode}`, userId);
  } catch (e) {
    logInfo('AdminMode', 'ERROR saveAdminMode', e.message);
  }
}


/**
 * ดึงโหมดปัจจุบันของ Admin จาก ScriptCache
 *
 * @param {string} userId
 * @returns {string} ค่าจาก SYSTEM_CONFIG.ADMIN_MODE (default: NONE)
 */
function getAdminMode(userId) {
  try {
    const key    = SYSTEM_CONFIG.ADMIN_MODE_CACHE_KEY_PREFIX + userId;
    const cached = CacheService.getScriptCache().get(key);
    return cached || SYSTEM_CONFIG.ADMIN_MODE.NONE;
  } catch (e) {
    logInfo('AdminMode', 'ERROR getAdminMode', e.message);
    return SYSTEM_CONFIG.ADMIN_MODE.NONE;
  }
}


/**
 * ล้างโหมด Admin ออกจาก Cache (กลับสู่ NONE)
 *
 * @param {string} userId
 */
function clearAdminMode(userId) {
  try {
    const key = SYSTEM_CONFIG.ADMIN_MODE_CACHE_KEY_PREFIX + userId;
    CacheService.getScriptCache().remove(key);
    logInfo('AdminMode', 'Clear mode', userId);
  } catch (e) {
    logInfo('AdminMode', 'ERROR clearAdminMode', e.message);
  }
}


// ============================================================
// 👔 SECTION 7: Admin Flow
// ============================================================

// ============================================================
// 👩‍🏫 Dual-Role Teacher Handler — สำหรับหัวหน้าระดับชั้น
// ============================================================

/**
 * Entry Point สำหรับหัวหน้าระดับชั้น (Dual-Role Teacher)
 * มีสิทธิ์ทั้งสอน (Teacher) และสร้าง QR (Monitor)
 * ใช้ระบบ Mode Switching เดียวกับ Super Admin
 * แต่มีเพียง 2 โหมด คือ TEACHER และ MONITOR
 *
 * @param {Object} event
 * @param {Object} userInfo - { role: 'DualRole', data: { teacher, monitor } }
 */
function handleDualRoleEvent(event, userInfo) {
  const userId      = event.source.userId;
  const teacherData = userInfo.data.teacher;
  const monitorData = userInfo.data.monitor;
  const text        = (event.type === 'message' && event.message.type === 'text')
    ? event.message.text.trim()
    : '';
  const textLow = text.toLowerCase();

  // ── 1. CHECKIN: สแกน QR → Teacher Flow เสมอ ─────────────────
  // ไม่ว่าจะอยู่โหมดใด การสแกน QR ต้องเข้า Teacher Flow เสมอ
  if (text.startsWith('CHECKIN:')) {
    handleTeacherEvent(event, teacherData);
    return;
  }

  // ── 2. Postback ที่จัดการก่อน Mode Routing ───────────────────
  if (event.type === 'postback') {
    const params = parsePostbackData(event.postback.data);
    const action = params['action'];

    // สลับโหมด
    if (action === 'admin_switch_mode') {
      handleDualRoleModeSwitch(userId, params['mode'], teacherData, monitorData);
      return;
    }

    // กลับเมนูหลัก Dual-Role
    if (action === 'admin_main_menu') {
      clearAdminMode(userId);
      clearTeacherState(userId);
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.DUAL_ROLE_MODE_EXIT }]);
      sendDualRoleMainMenu(userId, teacherData);
      return;
    }
  }

  // ── 3. คำสั่งกลับเมนูหลัก (ข้อความ) ─────────────────────────
  const backKeywords = ['เมนู', 'menu', 'หน้าหลัก', 'กลับ'];
  if (backKeywords.includes(textLow)) {
    clearAdminMode(userId);
    clearTeacherState(userId);
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.DUAL_ROLE_MODE_EXIT }]);
    sendDualRoleMainMenu(userId, teacherData);
    return;
  }

  // ── 4. Route ตาม Mode ─────────────────────────────────────────
  const currentMode = getAdminMode(userId);
  logInfo('DualRole', `Mode: ${currentMode}`, userId);

  switch (currentMode) {

    case SYSTEM_CONFIG.ADMIN_MODE.TEACHER:
      handleTeacherEvent(event, teacherData);
      break;

    case SYSTEM_CONFIG.ADMIN_MODE.MONITOR:
      handleMonitorEvent(event, monitorData);
      break;

    default:
      // NONE — ยังไม่ได้เลือกโหมด → แสดงเมนูเลือกโหมด
      sendDualRoleMainMenu(userId, teacherData);
      break;
  }
}


/**
 * จัดการการสลับโหมดสำหรับ Dual-Role Teacher
 * รองรับเฉพาะโหมด TEACHER และ MONITOR เท่านั้น
 *
 * @param {string} userId
 * @param {string} targetMode  - ค่าจาก SYSTEM_CONFIG.ADMIN_MODE
 * @param {Object} teacherData - ข้อมูลจาก Teachers_Master
 * @param {Object} monitorData - ข้อมูลจาก ClassMonitors_Master
 */
function handleDualRoleModeSwitch(userId, targetMode, teacherData, monitorData) {
  switch (targetMode) {

    case SYSTEM_CONFIG.ADMIN_MODE.TEACHER:
      saveAdminMode(userId, SYSTEM_CONFIG.ADMIN_MODE.TEACHER);
      sendLineMessage(userId, [
        { type: 'text', text: MESSAGES.DUAL_ROLE_MODE_TEACHER_ENTER(teacherData['Teacher_Name']) },
        flexTeacherMenu(teacherData['Teacher_Name']),
      ]);
      break;

    case SYSTEM_CONFIG.ADMIN_MODE.MONITOR: {
      saveAdminMode(userId, SYSTEM_CONFIG.ADMIN_MODE.MONITOR);
      const scopeLabel = getScopeLabel(monitorData);
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.DUAL_ROLE_MODE_MONITOR_ENTER(scopeLabel) }]);
      Utilities.sleep(300);
      sendMonitorMainMenu(userId, monitorData);
      break;
    }

    default:
      clearAdminMode(userId);
      sendDualRoleMainMenu(userId, teacherData);
  }
}


/**
 * ส่งเมนูเลือกโหมดให้ Dual-Role Teacher
 *
 * @param {string} userId
 * @param {Object} teacherData - ใช้ดึงชื่อครูแสดงในเมนู
 */
function sendDualRoleMainMenu(userId, teacherData) {
  sendLineMessage(userId, [
    flexDualRoleMenu(teacherData['Teacher_Name']),
    {
      type: 'text',
      text: MESSAGES.DUAL_ROLE_MODE_PROMPT,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type:        'postback',
              label:       '👩‍🏫 โหมดเช็คอิน',
              data:        'action=admin_switch_mode&mode=TEACHER',
              displayText: 'เข้าโหมดครูผู้สอน',
            },
          },
          {
            type: 'action',
            action: {
              type:        'postback',
              label:       '📲 โหมดสร้าง QR',
              data:        'action=admin_switch_mode&mode=MONITOR',
              displayText: 'เข้าโหมดสร้าง QR',
            },
          },
        ],
      },
    },
  ]);
}


/**
 * [DUAL-ROLE] Flex Card เมนูเลือกโหมด
 *
 * @param {string} teacherName
 * @returns {Object} Flex Message
 */
function flexDualRoleMenu(teacherName) {
  return {
    type: 'flex',
    altText: `สวัสดีค่ะ ${teacherName} — เลือกโหมดการทำงานค่ะ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '👋 สวัสดีค่ะ', color: FLEX_COLORS.WHITE, size: 'sm' },
          { type: 'text', text: teacherName, color: FLEX_COLORS.WHITE, size: 'lg', weight: 'bold', margin: 'xs' },
          { type: 'text', text: 'หัวหน้าระดับชั้น — เลือกโหมดการทำงาน', color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical',
        spacing: 'sm', paddingAll: '12px',
        contents: [

          // ── โหมดครูผู้สอน ─────────────────────────────────
          {
            type: 'box', layout: 'horizontal',
            backgroundColor: '#E8F5E9', cornerRadius: '10px',
            paddingAll: '14px', margin: 'xs', spacing: 'md',
            action: {
              type:        'postback',
              label:       'โหมดเช็คอิน',
              data:        'action=admin_switch_mode&mode=TEACHER',
              displayText: 'เข้าโหมดครูผู้สอน',
            },
            contents: [
              { type: 'text', text: '👩‍🏫', size: 'xl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: 'โหมดครูผู้สอน', size: 'sm', weight: 'bold', color: FLEX_COLORS.PRIMARY },
                  { type: 'text', text: 'สแกน QR Code เช็คอินการเข้าสอน', size: 'xs', color: FLEX_COLORS.TEXT_SUB, wrap: true },
                ],
              },
              { type: 'text', text: '›', size: 'lg', color: FLEX_COLORS.PRIMARY, flex: 0, align: 'end' },
            ],
          },

          // ── โหมดสร้าง QR ──────────────────────────────────
          {
            type: 'box', layout: 'horizontal',
            backgroundColor: '#FFF3E0', cornerRadius: '10px',
            paddingAll: '14px', margin: 'xs', spacing: 'md',
            action: {
              type:        'postback',
              label:       'โหมดสร้าง QR',
              data:        'action=admin_switch_mode&mode=MONITOR',
              displayText: 'เข้าโหมดสร้าง QR',
            },
            contents: [
              { type: 'text', text: '📲', size: 'xl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: 'โหมดสร้าง QR', size: 'sm', weight: 'bold', color: FLEX_COLORS.ACCENT },
                  { type: 'text', text: 'สร้าง QR Code ให้ครูในระดับสแกน', size: 'xs', color: FLEX_COLORS.TEXT_SUB, wrap: true },
                ],
              },
              { type: 'text', text: '›', size: 'lg', color: FLEX_COLORS.ACCENT, flex: 0, align: 'end' },
            ],
          },

        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'text',
          text: '💡 กดที่การ์ดหรือ Quick Reply\nเพื่อเลือกโหมดการทำงานค่ะ',
          size: 'xs', color: FLEX_COLORS.NEUTRAL,
          align: 'center', wrap: true,
        }],
      },
    },
  };
}


/**
 * Super Admin Entry Point
 * ตรวจสอบโหมดปัจจุบันแล้ว Route ไปยัง Handler ที่ถูกต้อง
 *
 * ลำดับการตัดสินใจ:
 *   1. CHECKIN: scan          → Teacher Flow เสมอ (ไม่ว่าจะอยู่โหมดไหน)
 *   2. /reg ลงทะเบียนครู     → Registration Flow (ไม่ว่าจะอยู่โหมดไหน)
 *   3. Postback reg_confirm   → Registration Confirm
 *   4. เมนู / กลับ           → ล้างโหมด + Super Admin Menu
 *   5. Postback switch_mode   → เปลี่ยนโหมด
 *   6. Mode-based routing     → TEACHER / MONITOR / REPORT / NONE
 *
 * @param {Object} event
 * @param {Object} userInfo - { role, data } จาก identifyUserRole()
 */
function handleSuperAdminEvent(event, userInfo) {
  const userId  = event.source.userId;
  const text    = (event.type === 'message' && event.message.type === 'text')
    ? event.message.text.trim()
    : '';
  const textLow = text.toLowerCase();

  // ── 1. CHECKIN: สแกน QR → Teacher Flow เสมอ ─────────────────
  if (text.startsWith('CHECKIN:')) {
    const teacherData = getTeacherByLineId(userId);
    if (!teacherData) {
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_NO_TEACHER_PROFILE }]);
      return;
    }
    handleTeacherEvent(event, teacherData);
    return;
  }

  // ── 2. /reg ลงทะเบียนเป็นครู ─────────────────────────────────
  // Admin ใช้คำสั่งนี้เพื่อผูก LINE ID กับ Teachers_Master
  if (textLow.startsWith('/reg') && !textLow.startsWith('/reg-qr')) {
    const keyword = text.slice(4).trim();
    if (!keyword) {
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.REG_USAGE }]);
      return;
    }
    handleRegCommand(userId, keyword);
    return;
  }

  // ── 3. Postback ที่ต้องจัดการก่อน Mode Routing ───────────────
  if (event.type === 'postback') {
    const params = parsePostbackData(event.postback.data);
    const action = params['action'];

    // ยืนยันลงทะเบียนครู — Admin ต้องผ่านจุดนี้ได้
    if (action === 'reg_confirm') {
      handleRegConfirm(userId, params['teacher_id']);
      return;
    }

    // สลับโหมด
    if (action === 'admin_switch_mode') {
      handleAdminModeSwitch(userId, params['mode']);
      return;
    }

    // กลับเมนูหลัก Admin
    if (action === 'admin_main_menu') {
      clearAdminMode(userId);
      clearTeacherState(userId);
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_MODE_EXIT }]);
      sendSuperAdminMainMenu(userId);
      return;
    }
  }

  // ── 4. คำสั่งกลับเมนูหลัก (ข้อความ) ─────────────────────────
  const backKeywords = ['เมนู', 'menu', 'หน้าหลัก', 'กลับ', 'ออก', 'admin'];
  if (backKeywords.includes(textLow)) {
    clearAdminMode(userId);
    clearTeacherState(userId);
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_MODE_EXIT }]);
    sendSuperAdminMainMenu(userId);
    return;
  }

  // ── 5. Route ตาม Mode ─────────────────────────────────────────
  const currentMode = getAdminMode(userId);
  logInfo('SuperAdmin', `Mode: ${currentMode}`, userId);

  switch (currentMode) {

    case SYSTEM_CONFIG.ADMIN_MODE.TEACHER: {
      // ตรวจสอบว่า Admin ลงทะเบียนเป็นครูแล้วหรือยัง
      const teacherData = getTeacherByLineId(userId);
      if (!teacherData) {
        sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_NO_TEACHER_PROFILE }]);
        clearAdminMode(userId);
        sendSuperAdminMainMenu(userId);
        return;
      }
      handleTeacherEvent(event, teacherData);
      break;
    }

    case SYSTEM_CONFIG.ADMIN_MODE.MONITOR: {
      // สร้าง monitorData เสมือน (Virtual) ด้วย Scope = ALL
      // Admin ไม่จำเป็นต้องอยู่ใน ClassMonitors_Master
      const monitorData = _buildAdminVirtualMonitorData(userId);
      handleMonitorEvent(event, monitorData);
      break;
    }

    case SYSTEM_CONFIG.ADMIN_MODE.REPORT:
      handleAdminEvent(event, userInfo.data);
      break;

    default:
      // NONE — ยังไม่ได้เลือกโหมด
      sendSuperAdminMainMenu(userId);
      break;
  }
}


/**
 * สร้าง monitorData เสมือนสำหรับ Admin
 * มี Scope = ALL เพื่อสร้าง QR ได้ทุกห้อง
 * ไม่ต้องลงทะเบียนใน ClassMonitors_Master
 *
 * @param {string} userId - LINE User ID ของ Admin
 * @returns {Object} monitorData Object ที่ handleMonitorEvent() รองรับได้
 * @private
 */
function _buildAdminVirtualMonitorData(userId) {
  return {
    Monitor_ID:      'ADMIN_' + userId,
    Student_Name:    'Admin',
    LINE_User_ID:    userId,
    Classroom:       'ทุกห้องเรียน',
    Classroom_Scope: SYSTEM_CONFIG.SCOPE_ALL,
    Creator_Type:    SYSTEM_CONFIG.CREATOR_TYPE.ADMIN,
    Status:          'Active',
    Note:            'Super Admin Virtual Monitor',
  };
}


/**
 * จัดการการสลับโหมดของ Admin
 * เรียกจาก Postback action=admin_switch_mode
 *
 * @param {string} userId
 * @param {string} targetMode - ค่าจาก SYSTEM_CONFIG.ADMIN_MODE
 */
function handleAdminModeSwitch(userId, targetMode) {
  switch (targetMode) {

    case SYSTEM_CONFIG.ADMIN_MODE.TEACHER: {
      const teacherData = getTeacherByLineId(userId);
      if (!teacherData) {
        sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_NO_TEACHER_PROFILE }]);
        sendSuperAdminMainMenu(userId);
        return;
      }
      saveAdminMode(userId, SYSTEM_CONFIG.ADMIN_MODE.TEACHER);
      sendLineMessage(userId, [
        { type: 'text', text: MESSAGES.ADMIN_MODE_TEACHER_ENTER(teacherData['Teacher_Name']) },
        flexTeacherMenu(teacherData['Teacher_Name']),
      ]);
      break;
    }

    case SYSTEM_CONFIG.ADMIN_MODE.MONITOR: {
      saveAdminMode(userId, SYSTEM_CONFIG.ADMIN_MODE.MONITOR);
      const monitorData = _buildAdminVirtualMonitorData(userId);
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_MODE_MONITOR_ENTER }]);
      // รอ 300ms เล็กน้อยก่อนส่งเมนู Monitor
      Utilities.sleep(300);
      sendMonitorMainMenu(userId, monitorData);
      break;
    }

    case SYSTEM_CONFIG.ADMIN_MODE.REPORT: {
      saveAdminMode(userId, SYSTEM_CONFIG.ADMIN_MODE.REPORT);
      sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_MODE_REPORT_ENTER }]);
      sendAdminMainMenu(userId);
      break;
    }

    default:
      clearAdminMode(userId);
      sendSuperAdminMainMenu(userId);
  }
}


/**
 * ส่งเมนูเลือกโหมดให้ Admin (Super Admin Main Menu)
 * แสดงเมื่อ Admin ยังไม่ได้เลือกโหมด หรือกด "กลับเมนูหลัก"
 *
 * @param {string} userId
 */
function sendSuperAdminMainMenu(userId) {
  sendLineMessage(userId, [
    flexSuperAdminMenu(),
    {
      type: 'text',
      text: MESSAGES.ADMIN_MODE_PROMPT,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type:        'postback',
              label:       '📊 โหมดรายงาน',
              data:        'action=admin_switch_mode&mode=REPORT',
              displayText: 'เข้าโหมดรายงาน',
            },
          },
          {
            type: 'action',
            action: {
              type:        'postback',
              label:       '👩‍🏫 โหมดเช็คอิน',
              data:        'action=admin_switch_mode&mode=TEACHER',
              displayText: 'เข้าโหมดครูผู้สอน',
            },
          },
          {
            type: 'action',
            action: {
              type:        'postback',
              label:       '📲 โหมดสร้าง QR',
              data:        'action=admin_switch_mode&mode=MONITOR',
              displayText: 'เข้าโหมดสร้าง QR',
            },
          },
        ],
      },
    },
  ]);
}


/**
 * Entry Point สำหรับ Admin
 *
 * @param {Object} event
 * @param {Object} adminData
 */
function handleAdminEvent(event, adminData) {
  try {
    if (event.type === 'message' && event.message.type === 'text') {
      handleAdminMessage(event, adminData);
    } else if (event.type === 'postback') {
      handleAdminPostback(event, adminData);
    } else {
      sendAdminMainMenu(event.source.userId);
    }
  } catch (e) {
    logInfo('Admin', 'ERROR', e.message);
    sendLineMessage(event.source.userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
  }
}


/**
 * จัดการข้อความจาก Admin
 *
 * @param {Object} event
 * @param {Object} adminData
 */
function handleAdminMessage(event, adminData) {
  const userId  = event.source.userId;
  const textLow = event.message.text.trim().toLowerCase();

  // Special Commands
  if (textLow === '/help' || textLow === 'help') {
    sendAdminHelp(userId);
    return;
  }
  if (textLow === '/status' || textLow === 'status') {
    // ใช้ฟังก์ชันสรุปวันนี้เป็น status ของ Admin
    handleTodaySummary(userId);
    return;
  }

  if (['เมนู', 'menu', 'หน้าหลัก', 'admin'].includes(textLow)) {
    sendAdminMainMenu(userId);
  } else if (['สรุป', 'วันนี้', 'สรุปวันนี้', 'today'].includes(textLow)) {
    handleTodaySummary(userId);
  } else if (['รายละเอียด', 'detail', 'รายการ'].includes(textLow)) {
    handleDetailReport(userId);
  } else if (['สัปดาห์', 'weekly', 'รายสัปดาห์'].includes(textLow)) {
    handleWeeklyReport(userId);
  } else if (['export', 'ส่งออก', 'ลิงก์'].includes(textLow)) {
    handleExportReport(userId);
  } else {
    sendAdminMainMenu(userId);
  }
}


/**
 * จัดการ Postback จาก Admin
 *
 * @param {Object} event
 * @param {Object} adminData
 */
function handleAdminPostback(event, adminData) {
  const userId = event.source.userId;
  const params = parsePostbackData(event.postback.data);
  const action = params['action'];

  switch (action) {
    case 'admin_today_summary':  handleTodaySummary(userId);           break;
    case 'admin_detail_report':  handleDetailReport(userId);           break;
    case 'admin_weekly_report':  handleWeeklyReport(userId);           break;
    case 'admin_export':         handleExportReport(userId);           break;
    case 'admin_teacher_detail': handleTeacherDetail(userId, params);  break;
    case 'admin_period_detail':  handlePeriodDetail(userId, params);   break;
    default:
      sendAdminMainMenu(userId);
  }
}


/**
 * สรุปการเช็คอินวันนี้
 *
 * @param {string} userId
 */
function handleTodaySummary(userId) {
  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_LOADING_TODAY }]);

  const summary = getTodayCheckInSummary();
  if (!summary) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  sendLineMessage(userId, [flexAdminDailyReport(summary)]);

  if (summary.totalCheckIns > 0) {
    Utilities.sleep(500);
    sendLineMessage(userId, [{
      type: 'text',
      text: buildQuickOverviewText(summary),
    }]);
  }
}


/**
 * รายละเอียดการเช็คอินวันนี้แยกตามคาบ
 *
 * @param {string} userId
 */
function handleDetailReport(userId) {
  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_LOADING_DETAIL }]);

  const summary = getTodayCheckInSummary();
  if (!summary || summary.totalCheckIns === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ADMIN_NO_CHECKIN_TODAY(formatThaiDate(new Date())),
    }]);
    return;
  }

  sendLineMessage(userId, [flexAdminDetailReport(summary.logs)]);

  Utilities.sleep(500);
  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.ADMIN_MORE_REPORT,
    quickReply: buildAdminQuickReply(),
  }]);
}


/**
 * รายงานรายสัปดาห์ (7 วันย้อนหลัง)
 *
 * @param {string} userId
 */
function handleWeeklyReport(userId) {
  sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_LOADING_WEEKLY }]);

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const logs = getCheckInsByDateRange(startDate, endDate);
  if (logs.length === 0) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ADMIN_NO_WEEKLY_DATA }]);
    return;
  }

  // จัดกลุ่มตามวัน
  const byDay = {};
  logs.forEach(log => {
    const d = new Date(log['Timestamp']);
    d.setHours(0, 0, 0, 0);
    const key = d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!byDay[key]) byDay[key] = { total: 0, onTime: 0, late: 0 };
    byDay[key].total++;
    if (log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME) byDay[key].onTime++;
    else byDay[key].late++;
  });

  sendLineMessage(userId, [{
    type: 'text',
    text: buildWeeklyReportText(byDay, logs.length),
  }]);

  Utilities.sleep(500);
  sendLineMessage(userId, [flexAdminWeeklyReport(byDay, startDate, endDate)]);
}


/**
 * ส่ง Link Google Sheets ให้ Admin Export
 *
 * @param {string} userId
 */
function handleExportReport(userId) {
  const spreadsheetId = getCredential('SPREADSHEET_ID');
  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        `📥 Export รายงานการเช็คอินค่ะ\n\n` +
        `🔗 Google Sheets:\n${sheetsUrl}\n\n` +
        `📋 วิธี Export เป็น Excel:\n` +
        `1. เปิด Link ด้านบน\n` +
        `2. เลือก Sheet "Teacher_CheckIn_Log"\n` +
        `3. ไปที่ File > Download\n` +
        `4. เลือก .xlsx หรือ .csv ได้เลยค่ะ`,
    },
    flexExportCard(sheetsUrl),
  ]);
}


/**
 * รายละเอียดการสอนของครูคนใดคนหนึ่งวันนี้
 *
 * @param {string} userId
 * @param {Object} params
 */
function handleTeacherDetail(userId, params) {
  const teacherId = params['teacher_id'];
  if (!teacherId) { sendAdminMainMenu(userId); return; }

  const summary = getTodayCheckInSummary();
  if (!summary) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  const teacherLogs = summary.logs.filter(l => l['Teacher_ID'] === teacherId);
  const teacher     = getTeacherById(teacherId);
  const name        = teacher ? teacher['Teacher_Name'] : teacherId;

  if (teacherLogs.length === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text: `📋 ${name}\nยังไม่มีการเช็คอินในวันนี้ค่ะ`,
    }]);
    return;
  }

  const lines = [`👩‍🏫 ${name}\n📅 ${formatThaiDate(new Date())}\n`];
  teacherLogs.forEach(log => {
    const icon = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡';
    const time = new Date(log['Timestamp']).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    lines.push(
      `${icon} ${log['Period_Name']} — ${log['Subject_Name']}\n` +
      `   🕐 ${time} น. | 🏫 ${log['Classroom']}\n` +
      `   📝 ${log['Teaching_Topic'] || '-'}\n` +
      `   📋 ${log['Assignment'] || 'ไม่มีงาน'}`
    );
  });

  sendLineMessage(userId, [{ type: 'text', text: lines.join('\n') }]);
}


/**
 * รายละเอียดการเช็คอินในคาบที่เลือก
 *
 * @param {string} userId
 * @param {Object} params
 */
function handlePeriodDetail(userId, params) {
  const periodNumber = Number(params['period_number']);
  if (!periodNumber) { sendAdminMainMenu(userId); return; }

  const period  = getPeriodByNumber(periodNumber);
  const summary = getTodayCheckInSummary();

  if (!summary) {
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    return;
  }

  const periodLogs = summary.logs.filter(l => Number(l['Period_Number']) === periodNumber);
  const periodName = period
    ? `${period.name} (${period.start}–${period.end})`
    : `คาบที่ ${periodNumber}`;

  if (periodLogs.length === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text: `📋 ${periodName}\nยังไม่มีการเช็คอินค่ะ`,
    }]);
    return;
  }

  const lines = [`🕐 ${periodName}\n📅 ${formatThaiDate(new Date())}\n`];
  periodLogs.forEach(log => {
    const icon = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡';
    const time = new Date(log['Timestamp']).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    lines.push(
      `${icon} ${log['Teacher_Name']}\n` +
      `   📚 ${log['Subject_Name']} | 🏫 ${log['Classroom']}\n` +
      `   🕐 ${time} น.\n` +
      `   📝 ${log['Teaching_Topic'] || '-'}\n` +
      `   📋 ${log['Assignment'] || 'ไม่มีงาน'}`
    );
  });

  sendLineMessage(userId, [{ type: 'text', text: lines.join('\n') }]);
}


/**
 * ส่งคู่มือการใช้งานสำหรับ Admin (/help)
 */
function sendAdminHelp(userId) {
  sendLineMessage(userId, [{
    type: 'text',
    text:
      `ป้าไพรยินดีช่วยนะคะ 😊\n\n` +
      `📋 คู่มือสำหรับ Admin ฝ่ายวิชาการ\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 รายงานการเช็คอิน\n\n` +
      `/status      สรุปด่วนวันนี้\n` +
      `วันนี้       รายงานสรุปพร้อม Card\n` +
      `รายละเอียด   รายงานแยกตามคาบ\n` +
      `สัปดาห์      รายงาน 7 วันย้อนหลัง\n` +
      `export       ลิงก์ Google Sheets\n` +
      `เมนู         กลับหน้าหลัก\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⌨️ คำสั่งพิเศษ\n\n` +
      `/help    ดูคู่มือนี้\n` +
      `/status  ดูสรุปด่วนวันนี้\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💡 หรือกดปุ่ม Quick Reply\n` +
      `ด้านล่างได้เลยนะคะ 👇\n\n` +
      `มีอะไรให้ป้าไพรช่วยอีกไหมคะ 😊`,
  }]);
}


/**
 * สรุปภาพรวมรายวันแบบ Text
 *
 * @param {Object} summary
 * @returns {string}
 */
function buildQuickOverviewText(summary) {
  const byPeriod = {};
  summary.logs.forEach(log => {
    const key = `คาบที่ ${log['Period_Number']}`;
    if (!byPeriod[key]) byPeriod[key] = [];
    byPeriod[key].push(log);
  });

  const sortedKeys = Object.keys(byPeriod).sort((a, b) =>
    Number(a.replace('คาบที่ ', '')) - Number(b.replace('คาบที่ ', ''))
  );

  const lines = [`📋 รายละเอียดการเช็คอินวันนี้\n`];
  sortedKeys.forEach(key => {
    lines.push(`${key}:`);
    byPeriod[key].forEach(log => {
      const icon = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡';
      const time = new Date(log['Timestamp']).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      lines.push(`  ${icon} ${log['Teacher_Name']} (${time} น.)`);
      lines.push(`     📝 ${log['Teaching_Topic'] || '-'}`);
    });
    lines.push('');
  });
  lines.push('🟢 ตรงเวลา  🟡 สาย');
  lines.push('\nมีอะไรให้ป้าไพรช่วยเพิ่มเติมไหมคะ 😊');
  return lines.join('\n');
}


/**
 * ข้อความสรุปรายสัปดาห์
 *
 * @param {Object} byDay
 * @param {number} total
 * @returns {string}
 */
function buildWeeklyReportText(byDay, total) {
  const lines = [
    `📅 รายงานการเช็คอิน 7 วันย้อนหลัง\n`,
    `รวมทั้งสิ้น: ${total} รายการ\n`,
  ];
  Object.keys(byDay).forEach(day => {
    const d = byDay[day];
    lines.push(
      `${day}: ${d.total} คาบ  ` +
      `${d.onTime > 0 ? `🟢${d.onTime}` : ''}  ` +
      `${d.late > 0 ? `🟡${d.late}` : ''}`
    );
  });
  lines.push('\n🟢 ตรงเวลา  🟡 สาย');
  lines.push('\nมีอะไรให้ป้าไพรช่วยเพิ่มเติมไหมคะ 😊');
  return lines.join('\n');
}


/**
 * ส่งเมนูหลัก Admin
 *
 * @param {string} userId
 */
function sendAdminMainMenu(userId) {
  sendLineMessage(userId, [
    flexAdminMenu(),
    {
      type: 'text',
      text: MESSAGES.ADMIN_QUICK_MENU,
      quickReply: buildAdminReportQuickReply(),
    },
  ]);
}


/**
 * Quick Reply สำหรับ Admin โหมดรายงาน
 * เพิ่มปุ่ม "🏠 เมนูหลัก" เพื่อกลับไปเลือกโหมดใหม่
 */
function buildAdminReportQuickReply() {
  return {
    items: [
      { type: 'action', action: { type: 'postback', label: '📊 สรุปวันนี้',  data: 'action=admin_today_summary', displayText: 'ดูสรุปวันนี้' } },
      { type: 'action', action: { type: 'postback', label: '📋 รายละเอียด', data: 'action=admin_detail_report',  displayText: 'ดูรายละเอียด' } },
      { type: 'action', action: { type: 'postback', label: '📅 รายสัปดาห์', data: 'action=admin_weekly_report',  displayText: 'รายงานรายสัปดาห์' } },
      { type: 'action', action: { type: 'postback', label: '📥 Export',      data: 'action=admin_export',         displayText: 'Export รายงาน' } },
      { type: 'action', action: { type: 'postback', label: '🏠 เมนูหลัก',   data: 'action=admin_main_menu',      displayText: 'กลับเมนูหลัก Admin' } },
    ],
  };
}


// ============================================================
// 📊 SECTION 8: Sheet Manager — CRUD Functions
// ============================================================

/**
 * เปิด Spreadsheet
 *
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(getCredential('SPREADSHEET_ID'));
  } catch (e) {
    throw new Error('ไม่สามารถเชื่อมต่อ Google Sheets ได้ กรุณาตรวจสอบ SPREADSHEET_ID');
  }
}


/**
 * ดึง Sheet ตามชื่อ
 *
 * @param {string} sheetName
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบ Sheet "${sheetName}"`);
  return sheet;
}


/**
 * ดึงข้อมูลทั้งหมดจาก Sheet เป็น Array of Objects
 *
 * @param {string} sheetName
 * @returns {Array<Object>}
 */
function getAllDataAsObjects(sheetName) {
  const sheet  = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    });
}


// ── Teachers_Master ──────────────────────────────────────────

function getTeacherByLineId(lineUserId) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS)
      .find(t => t['LINE_User_ID'] === lineUserId && t['Status'] === 'Active') || null;
  } catch (e) { logInfo('Sheet', 'ERROR getTeacherByLineId', e.message); return null; }
}

function getTeacherById(teacherId) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS)
      .find(t => t['Teacher_ID'] === teacherId) || null;
  } catch (e) { logInfo('Sheet', 'ERROR getTeacherById', e.message); return null; }
}


/**
 * ดึง LINE_User_ID ของครูจาก Teacher_ID
 * ใช้ตรวจสอบ Self-notification ใน notifyAdminAfterCheckin()
 *
 * @param {string} teacherId
 * @returns {string|null}
 */
function getTeacherLineIdByTeacherId(teacherId) {
  try {
    const teacher = getTeacherById(teacherId);
    return (teacher && teacher['LINE_User_ID'])
      ? teacher['LINE_User_ID'].toString().trim() || null
      : null;
  } catch (e) {
    logInfo('Sheet', 'ERROR getTeacherLineIdByTeacherId', e.message);
    return null;
  }
}


/**
 * ค้นหาครูจาก keyword ใน Teacher_Name
 * กรองเฉพาะครูที่ Status = Active
 * คืน Array ทั้งที่มีและไม่มี LINE_User_ID (เพื่อแสดงสถานะใน Card)
 *
 * @param {string} keyword - คำค้น (case-insensitive)
 * @returns {Array<Object>} ครูที่ตรงกัน สูงสุด 8 คน
 */
function searchTeachersByKeyword(keyword) {
  try {
    const normalized = keyword.trim().toLowerCase();
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS)
      .filter(t =>
        t['Status'] === 'Active' &&
        t['Teacher_Name'].toString().toLowerCase().includes(normalized)
      )
      .slice(0, 8); // จำกัด 8 ผลลัพธ์ เพื่อไม่ให้ Carousel ยาวเกิน
  } catch (e) {
    logInfo('Sheet', 'ERROR searchTeachersByKeyword', e.message);
    return [];
  }
}


/**
 * เขียน LINE_User_ID ลงใน Teachers_Master
 * ใช้ LockService ป้องกัน Race Condition
 *
 * @param {string} teacherId  - Teacher_ID (Primary Key)
 * @param {string} lineUserId - LINE User ID ที่ต้องการบันทึก
 * @returns {boolean}
 */
function registerTeacherLineId(teacherId, lineUserId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.TEACHERS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];

    const idCol      = headers.indexOf('Teacher_ID');
    const lineIdCol  = headers.indexOf('LINE_User_ID');
    const updatedCol = headers.indexOf('Registered_At'); // optional column

    if (idCol === -1 || lineIdCol === -1) {
      throw new Error('ไม่พบ Column Teacher_ID หรือ LINE_User_ID ใน Sheet');
    }

    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] !== teacherId) continue;

      // ป้องกันเขียนทับ (Double-check ใน Lock)
      if (values[i][lineIdCol] && values[i][lineIdCol].toString().trim() !== '') {
        logInfo('Sheet', `WARN: ${teacherId} มี LINE_User_ID อยู่แล้ว`);
        return false;
      }

      sheet.getRange(i + 1, lineIdCol + 1).setValue(lineUserId);

      // บันทึกเวลาลงทะเบียน (ถ้ามี Column Registered_At)
      if (updatedCol !== -1) {
        sheet.getRange(i + 1, updatedCol + 1).setValue(new Date());
      }

      logInfo('Sheet', `บันทึก LINE_User_ID สำเร็จ: ${teacherId}`);
      return true;
    }

    logInfo('Sheet', `ไม่พบ Teacher_ID: ${teacherId}`);
    return false;

  } catch (e) {
    logInfo('Sheet', 'ERROR registerTeacherLineId', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงข้อมูล Monitor จาก Monitor_ID
 *
 * @param {string} monitorId - Monitor_ID (Primary Key)
 * @returns {Object|null}
 */
function getMonitorById(monitorId) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.MONITORS)
      .find(m => m['Monitor_ID'] === monitorId) || null;
  } catch (e) {
    logInfo('Sheet', 'ERROR getMonitorById', e.message);
    return null;
  }
}


/**
 * ค้นหาผู้สร้าง QR จาก keyword ใน Student_Name
 * กรองเฉพาะที่ Status = Active
 * คืน Array ทั้งที่มีและไม่มี LINE_User_ID (เพื่อแสดงสถานะ)
 *
 * @param {string} keyword  - คำค้น (case-insensitive)
 * @returns {Array<Object>} ผู้สร้าง QR ที่ตรงกัน สูงสุด 8 คน
 */
function searchMonitorsByKeyword(keyword) {
  try {
    const normalized = keyword.trim().toLowerCase();
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.MONITORS)
      .filter(m =>
        m['Status'] === 'Active' &&
        m['Student_Name'].toString().toLowerCase().includes(normalized)
      )
      .slice(0, 8);
  } catch (e) {
    logInfo('Sheet', 'ERROR searchMonitorsByKeyword', e.message);
    return [];
  }
}


/**
 * เขียน LINE_User_ID ลงใน ClassMonitors_Master
 * ใช้ LockService ป้องกัน Race Condition
 *
 * @param {string} monitorId  - Monitor_ID (Primary Key)
 * @param {string} lineUserId - LINE User ID ที่ต้องการบันทึก
 * @returns {boolean}
 */
function registerMonitorLineId(monitorId, lineUserId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.MONITORS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];

    const idCol      = headers.indexOf('Monitor_ID');
    const lineIdCol  = headers.indexOf('LINE_User_ID');
    const regAtCol   = headers.indexOf('Registered_At'); // optional column

    if (idCol === -1 || lineIdCol === -1) {
      throw new Error('ไม่พบ Column Monitor_ID หรือ LINE_User_ID ใน ClassMonitors_Master');
    }

    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] !== monitorId) continue;

      // ป้องกันเขียนทับ (Double-check ใน Lock)
      if (values[i][lineIdCol] && values[i][lineIdCol].toString().trim() !== '') {
        logInfo('Sheet', `WARN: ${monitorId} มี LINE_User_ID อยู่แล้ว`);
        return false;
      }

      sheet.getRange(i + 1, lineIdCol + 1).setValue(lineUserId);

      // บันทึกเวลาลงทะเบียน (ถ้ามี Column Registered_At)
      if (regAtCol !== -1) {
        sheet.getRange(i + 1, regAtCol + 1).setValue(new Date());
      }

      logInfo('Sheet', `บันทึก Monitor LINE_User_ID สำเร็จ: ${monitorId}`);
      return true;
    }

    logInfo('Sheet', `ไม่พบ Monitor_ID: ${monitorId}`);
    return false;

  } catch (e) {
    logInfo('Sheet', 'ERROR registerMonitorLineId', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}


// ── ClassMonitors_Master ─────────────────────────────────────

function getMonitorByLineId(lineUserId) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.MONITORS)
      .find(m => m['LINE_User_ID'] === lineUserId && m['Status'] === 'Active') || null;
  } catch (e) { logInfo('Sheet', 'ERROR getMonitorByLineId', e.message); return null; }
}


// ── Subjects_Schedule ────────────────────────────────────────

function getScheduleByClassroomToday(classroom) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE)
      .filter(s =>
        s['Classroom'] === classroom &&
        s['Day']       === getTodayDayName() &&
        s['Semester']  === SCHOOL_CONFIG.SEMESTER_CURRENT &&
        // กรองออกแถวที่เป็นคาบต่อเนื่อง — Monitor เห็นเฉพาะ "คาบแรก" ของกลุ่ม
        (!s['Is_Continuation'] || s['Is_Continuation'].toString().trim() !== 'Y')
      )
      .sort((a, b) => Number(a['Period_Number']) - Number(b['Period_Number']));
  } catch (e) { logInfo('Sheet', 'ERROR getScheduleByClassroomToday', e.message); return []; }
}

function getSubjectByClassroomAndPeriod(classroom, periodNumber) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE)
      .find(s =>
        s['Classroom']     === classroom &&
        s['Day']           === getTodayDayName() &&
        Number(s['Period_Number']) === Number(periodNumber) &&
        s['Semester']      === SCHOOL_CONFIG.SEMESTER_CURRENT
      ) || null;
  } catch (e) { logInfo('Sheet', 'ERROR getSubjectByClassroomAndPeriod', e.message); return null; }
}

/**
 * ดึงตารางสอนวันนี้ตาม Scope ของผู้สร้าง QR
 *
 * Scope Rules:
 *   Student  → Classroom_Scope = ชื่อห้องเดียว เช่น "ม.1/1"
 *   Teacher  → Classroom_Scope = ระดับชั้น เช่น "ม.1" (ทุกห้องในระดับนั้น)
 *   Staff/Admin → Classroom_Scope = "ALL" (ทุกห้อง)
 *
 * @param {Object} monitorData - ข้อมูลจาก ClassMonitors_Master
 * @returns {Array<Object>} รายการตารางเรียน เรียงตาม Period แล้ว Classroom
 */
function getScheduleByCreatorScope(monitorData) {
  try {
    const scope       = (monitorData['Classroom_Scope'] || monitorData['Classroom'] || '').toString().trim();
    const creatorType = (monitorData['Creator_Type'] || SYSTEM_CONFIG.CREATOR_TYPE.STUDENT).toString().trim();
    const today       = getTodayDayName();
    const semester    = SCHOOL_CONFIG.SEMESTER_CURRENT;
    const allSchedules = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE);

    let filtered = [];

    if (scope === SYSTEM_CONFIG.SCOPE_ALL ||
        creatorType === SYSTEM_CONFIG.CREATOR_TYPE.STAFF ||
        creatorType === SYSTEM_CONFIG.CREATOR_TYPE.ADMIN) {
      // Staff / Admin → ทุกห้องในวันนั้น
      filtered = allSchedules.filter(s =>
        s['Day']      === today &&
        s['Semester'] === semester
      );

    } else if (creatorType === SYSTEM_CONFIG.CREATOR_TYPE.TEACHER && scope && !scope.includes('/')) {
      // หัวหน้าระดับ → ห้องทุกห้องที่ขึ้นต้นด้วย scope เช่น "ม.1"
      filtered = allSchedules.filter(s =>
        s['Day']        === today &&
        s['Semester']   === semester &&
        s['Classroom'].toString().startsWith(scope)
      );

    } else {
      // Student หรือ Scope เป็นชื่อห้องเฉพาะ
      const classroom = scope || monitorData['Classroom'] || '';
      filtered = allSchedules.filter(s =>
        s['Day']        === today &&
        s['Semester']   === semester &&
        s['Classroom']  === classroom
      );
    }

    // กรองออกแถวที่เป็นคาบต่อเนื่อง (Is_Continuation = 'Y')
    // Monitor เห็นเฉพาะ "คาบแรก" ของกลุ่มเท่านั้น
    filtered = filtered.filter(s =>
      !s['Is_Continuation'] || s['Is_Continuation'].toString().trim() !== 'Y'
    );

    return filtered.sort((a, b) => {
      // เรียงตาม Classroom ก่อน แล้วตาม Period
      const classCompare = a['Classroom'].localeCompare(b['Classroom'], 'th');
      if (classCompare !== 0) return classCompare;
      return Number(a['Period_Number']) - Number(b['Period_Number']);
    });

  } catch (e) {
    logInfo('Sheet', 'ERROR getScheduleByCreatorScope', e.message);
    return [];
  }
}


/**
 * สร้าง Label แสดง Scope สำหรับ Header ของ Flex Card
 *
 * @param {Object} monitorData
 * @returns {string} เช่น "ม.1/1" | "ระดับ ม.2" | "ทุกห้องเรียน"
 */
function getScopeLabel(monitorData) {
  const scope       = (monitorData['Classroom_Scope'] || monitorData['Classroom'] || '').toString().trim();
  const creatorType = (monitorData['Creator_Type'] || SYSTEM_CONFIG.CREATOR_TYPE.STUDENT).toString().trim();

  if (scope === SYSTEM_CONFIG.SCOPE_ALL ||
      creatorType === SYSTEM_CONFIG.CREATOR_TYPE.STAFF ||
      creatorType === SYSTEM_CONFIG.CREATOR_TYPE.ADMIN) {
    return 'ทุกห้องเรียน';
  }
  if (creatorType === SYSTEM_CONFIG.CREATOR_TYPE.TEACHER && scope && !scope.includes('/')) {
    return `ระดับ ${scope}`;
  }
  return scope || monitorData['Classroom'] || '-';
}


// ── QR_Sessions ──────────────────────────────────────────────

/**
 * สร้าง QR Session ใน Sheet
 * ── แก้ไขจากเดิม: เพิ่ม subjectName เพื่อให้ครูเห็นชื่อวิชาชัดเจน ──
 *
 * @param {Object} params
 * @returns {string} Token
 */
function createQRSession(params) {
  try {
    const sheet     = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const token     = generateQRToken();
    const createdAt = new Date();
    const expiresAt = getQRExpireTime();

    sheet.appendRow([
      token,
      params.subjectCode,
      params.subjectName,
      params.teacherId,
      params.teacherName,
      params.classroom,
      params.periodNumber,
      params.periodName,
      params.createdByLineId,
      params.createdByName,
      createdAt,
      expiresAt,
      SYSTEM_CONFIG.QR_STATUS.ACTIVE,
      '',  // Used_By_LineID
      '',  // Used_At
      params.periodEndNumber || params.periodNumber,  // Period_End_Number ← ใหม่ Col 16
    ]);

    logInfo('Sheet', `สร้าง Token: ${token}`);
    return token;
  } catch (e) {
    logInfo('Sheet', 'ERROR createQRSession', e.message);
    throw new Error('ไม่สามารถสร้าง QR Session ได้');
  }
}


/**
 * ตรวจสอบ QR Token
 *
 * @param {string} token
 * @returns {Object} { valid, status, data }
 */
function validateQRToken(token) {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];

    const tokenCol  = headers.indexOf('Token');
    const statusCol = headers.indexOf('Status');
    const expireCol = headers.indexOf('Expires_At');

    for (let i = 1; i < values.length; i++) {
      if (values[i][tokenCol] !== token) continue;

      const status   = values[i][statusCol];
      const expireAt = values[i][expireCol];

      if (status === SYSTEM_CONFIG.QR_STATUS.USED) {
        return { valid: false, status: 'used', data: null };
      }
      if (status === SYSTEM_CONFIG.QR_STATUS.EXPIRED || isQRExpired(expireAt)) {
        if (status !== SYSTEM_CONFIG.QR_STATUS.EXPIRED) {
          sheet.getRange(i + 1, statusCol + 1).setValue(SYSTEM_CONFIG.QR_STATUS.EXPIRED);
        }
        return { valid: false, status: 'expired', data: null };
      }

      const data = {};
      headers.forEach((h, idx) => { data[h] = values[i][idx]; });
      data['_rowIndex'] = i + 1;
      return { valid: true, status: 'active', data };
    }

    return { valid: false, status: 'not_found', data: null };

  } catch (e) {
    logInfo('Sheet', 'ERROR validateQRToken', e.message);
    return { valid: false, status: 'error', data: null };
  }
}


/**
 * Mark QR Token ว่าใช้แล้ว
 *
 * @param {string} token
 * @param {string} usedByLineId
 * @returns {boolean}
 */
function markQRTokenAsUsed(token, usedByLineId) {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];
    const tokenCol  = headers.indexOf('Token');
    const statusCol = headers.indexOf('Status');
    const usedByCol = headers.indexOf('Used_By_LineID');
    const usedAtCol = headers.indexOf('Used_At');

    for (let i = 1; i < values.length; i++) {
      if (values[i][tokenCol] !== token) continue;
      const row = i + 1;
      sheet.getRange(row, statusCol  + 1).setValue(SYSTEM_CONFIG.QR_STATUS.USED);
      sheet.getRange(row, usedByCol  + 1).setValue(usedByLineId);
      sheet.getRange(row, usedAtCol  + 1).setValue(new Date());
      return true;
    }
    return false;
  } catch (e) {
    logInfo('Sheet', 'ERROR markQRTokenAsUsed', e.message);
    return false;
  }
}


/**
 * ตรวจสอบว่ามี QR Active อยู่แล้วสำหรับคาบนี้หรือไม่
 *
 * @param {string} classroom
 * @param {number} periodNumber
 * @returns {boolean}
 */
function checkActiveQRForPeriod(classroom, periodNumber) {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];
    const classCol   = headers.indexOf('Classroom');
    const periodCol  = headers.indexOf('Period_Number');
    const statusCol  = headers.indexOf('Status');
    const expireCol  = headers.indexOf('Expires_At');
    const createdCol = headers.indexOf('Created_At');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i < values.length; i++) {
      const row        = values[i];
      const created    = new Date(row[createdCol]);
      created.setHours(0, 0, 0, 0);
      const isToday    = created.getTime() === today.getTime();
      const isMatch    = row[classCol] === classroom && Number(row[periodCol]) === Number(periodNumber);
      const isActive   = row[statusCol] === SYSTEM_CONFIG.QR_STATUS.ACTIVE;
      const notExpired = !isQRExpired(row[expireCol]);

      if (isToday && isMatch && isActive && notExpired) return true;
    }
    return false;
  } catch (e) {
    logInfo('Sheet', 'ERROR checkActiveQRForPeriod', e.message);
    return false;
  }
}


/**
 * ล้าง QR Token ที่หมดอายุแล้ว (รันด้วย Time Trigger ทุกคืน)
 *
 * @returns {number} จำนวน Token ที่ Expire
 */
function cleanupExpiredQRTokens() {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];
    const statusCol = headers.indexOf('Status');
    const expireCol = headers.indexOf('Expires_At');
    let count = 0;

    for (let i = 1; i < values.length; i++) {
      if (values[i][statusCol] === SYSTEM_CONFIG.QR_STATUS.ACTIVE && isQRExpired(values[i][expireCol])) {
        sheet.getRange(i + 1, statusCol + 1).setValue(SYSTEM_CONFIG.QR_STATUS.EXPIRED);
        count++;
      }
    }
    logInfo('Sheet', `Cleanup: Expire ${count} Tokens`);
    return count;
  } catch (e) {
    logInfo('Sheet', 'ERROR cleanupExpiredQRTokens', e.message);
    return 0;
  }
}


// ── Teacher_CheckIn_Log ──────────────────────────────────────

/**
 * บันทึกการเช็คอินลง Sheet
 * ใช้ LockService ป้องกัน Race Condition
 *
 * @param {Object} params
 * @returns {boolean}
 */
function saveCheckIn(params) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet  = getSheet(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);
    const now    = new Date();

    sheet.appendRow([
      now,                                                              // Col 1:  Timestamp
      params.teacherId,                                                 // Col 2:  Teacher_ID
      params.teacherName,                                               // Col 3:  Teacher_Name
      params.subjectCode,                                               // Col 4:  Subject_Code
      params.subjectName,                                               // Col 5:  Subject_Name
      params.classroom,                                                 // Col 6:  Classroom
      params.periodNumber,                                              // Col 7:  Period_Number
      params.periodName,                                                // Col 8:  Period_Name
      params.timeStart,                                                 // Col 9:  Time_Start
      params.timeEnd,                                                   // Col 10: Time_End
      params.day,                                                       // Col 11: Day
      params.teachingTopic,                                             // Col 12: Teaching_Topic
      params.assignment || '-',                                         // Col 13: Assignment
      params.qrToken,                                                   // Col 14: QR_Token
      params.status,                                                    // Col 15: Status  ← ใช้จาก params
      SCHOOL_CONFIG.SEMESTER_CURRENT,                                   // Col 16: Semester
      params.periodEndNumber || params.periodNumber,                    // Col 17: Period_End_Number ← ใหม่
      params.checkinTime     || now,                                    // Col 18: Checkin_Time ← ใหม่
      params.checkoutTime    || now,                                    // Col 19: Checkout_Time ← ใหม่
      params.durationMinutes != null ? params.durationMinutes : '',     // Col 20: Duration_Minutes ← ใหม่
      params.checkoutStatus  || SYSTEM_CONFIG.CHECKOUT_STATUS.COMPLETED,// Col 21: Checkout_Status ← ใหม่
    ]);

    logInfo('Sheet', `บันทึกเช็คอิน: ${params.teacherName} — ${params.subjectName}`);
    return true;

  } catch (e) {
    logInfo('Sheet', 'ERROR saveCheckIn', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}


/**
 * ตรวจสอบว่าครูเช็คอินคาบนี้แล้วหรือยัง
 *
 * @param {string} teacherId
 * @param {number} periodNumber
 * @returns {boolean}
 */
function isAlreadyCheckedIn(teacherId, periodNumber) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG).some(log => {
      const d = new Date(log['Timestamp']);
      d.setHours(0, 0, 0, 0);
      return (
        log['Teacher_ID'] === teacherId &&
        Number(log['Period_Number']) === Number(periodNumber) &&
        d.getTime() === today.getTime()
      );
    });
  } catch (e) {
    logInfo('Sheet', 'ERROR isAlreadyCheckedIn', e.message);
    return false;
  }
}


/**
 * ดึงประวัติการเช็คอินของครู
 *
 * @param {string} teacherId
 * @param {number} limit
 * @returns {Array<Object>}
 */
function getTeacherCheckInHistory(teacherId, limit = 10) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG)
      .filter(l => l['Teacher_ID'] === teacherId)
      .sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']))
      .slice(0, limit);
  } catch (e) {
    logInfo('Sheet', 'ERROR getTeacherCheckInHistory', e.message);
    return [];
  }
}


/**
 * ดึงรายการเช็คอินวันนี้ของห้องเรียนที่ระบุ
 * ใช้โดย sendMonitorStatus() เพื่อแสดงสถานะแยกคาบ
 *
 * @param {string} classroom - ชื่อห้องเรียน เช่น "ม.1/1"
 * @returns {Array<Object>}
 */
function getTodayCheckInForClassroom(classroom) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG).filter(log => {
      const d = new Date(log['Timestamp']);
      d.setHours(0, 0, 0, 0);
      return (
        log['Classroom'] === classroom &&
        d.getTime() === today.getTime()
      );
    });
  } catch (e) {
    logInfo('Sheet', 'ERROR getTodayCheckInForClassroom', e.message);
    return [];
  }
}


/**
 * สรุปการเช็คอินวันนี้สำหรับ Admin
 *
 * @returns {Object|null}
 */
function getTodayCheckInSummary() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);
    const todayLogs = logs.filter(l => {
      const d = new Date(l['Timestamp']);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });

    const onTime         = todayLogs.filter(l => l['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME).length;
    const uniqueTeachers = [...new Set(todayLogs.map(l => l['Teacher_ID']))].length;

    return {
      date:           formatThaiDate(new Date()),
      totalCheckIns:  todayLogs.length,
      onTime,
      late:           todayLogs.length - onTime,
      uniqueTeachers,
      logs:           todayLogs,
    };
  } catch (e) {
    logInfo('Sheet', 'ERROR getTodayCheckInSummary', e.message);
    return null;
  }
}


/**
 * ดึงรายการเช็คอินตามช่วงวันที่
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<Object>}
 */
function getCheckInsByDateRange(startDate, endDate) {
  try {
    return getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG)
      .filter(l => {
        const d = new Date(l['Timestamp']);
        return d >= startDate && d <= endDate;
      })
      .sort((a, b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
  } catch (e) {
    logInfo('Sheet', 'ERROR getCheckInsByDateRange', e.message);
    return [];
  }
}


// ── Role Identification ───────────────────────────────────────

/**
 * ระบุ Role ของผู้ใช้จาก LINE User ID
 *
 * ลำดับการตรวจสอบ:
 *   1. Admin (ADMIN_LINE_IDS)       → ADMIN
 *   2. ทั้ง Teacher + Monitor       → DUAL_ROLE (หัวหน้าระดับชั้น)
 *   3. Teacher เท่านั้น             → TEACHER
 *   4. Monitor เท่านั้น             → MONITOR
 *   5. ไม่พบในระบบ                 → UNKNOWN
 *
 * @param {string} lineUserId
 * @returns {Object} { role, data }
 *   - ADMIN:     data = { lineUserId, Teacher_Name, Teacher_ID }
 *   - DUAL_ROLE: data = { teacher: Object, monitor: Object }
 *   - TEACHER:   data = Object จาก Teachers_Master
 *   - MONITOR:   data = Object จาก ClassMonitors_Master
 *   - UNKNOWN:   data = null
 */
function identifyUserRole(lineUserId) {
  // ── 1. Admin ─────────────────────────────────────────────────
  if (getAdminLineIds().includes(lineUserId)) {
    return {
      role: SYSTEM_CONFIG.USER_ROLE.ADMIN,
      data: {
        lineUserId:   lineUserId,
        Teacher_Name: 'Admin',
        Teacher_ID:   lineUserId,
      },
    };
  }

  // ── 2 & 3 & 4. ดึงข้อมูลจากทั้งสองชีตพร้อมกัน ───────────────
  // ดึงพร้อมกันก่อนเพื่อลดจำนวน Sheet Access
  const teacher = getTeacherByLineId(lineUserId);
  const monitor = getMonitorByLineId(lineUserId);

  // ── 2. Dual-Role: พบทั้ง Teacher และ Monitor ─────────────────
  if (teacher && monitor) {
    return {
      role: SYSTEM_CONFIG.USER_ROLE.DUAL_ROLE,
      data: { teacher, monitor },
    };
  }

  // ── 3. Teacher เท่านั้น ───────────────────────────────────────
  if (teacher) return { role: SYSTEM_CONFIG.USER_ROLE.TEACHER, data: teacher };

  // ── 4. Monitor เท่านั้น ───────────────────────────────────────
  if (monitor) return { role: SYSTEM_CONFIG.USER_ROLE.MONITOR, data: monitor };

  // ── 5. Unknown ───────────────────────────────────────────────
  return { role: SYSTEM_CONFIG.USER_ROLE.UNKNOWN, data: null };
}


// ── QR URL Helpers ────────────────────────────────────────────

/**
 * สร้าง URL ที่ฝังใน QR Code
 * เมื่อครูสแกนด้วย LINE QR Scanner จะส่งข้อความ CHECKIN:[token] มาที่ Bot
 *
 * @param {string} token
 * @returns {string}
 */
function buildQRUrl(token) {
  const botBasicId = getCredential('BOT_BASIC_ID');
  const message    = `CHECKIN:${token}`;
  return `https://line.me/R/oaMessage/${botBasicId}/?${encodeURIComponent(message)}`;
}


/**
 * สร้าง URL ของรูป QR Code จาก API ฟรี
 *
 * @param {string} url - URL ที่ต้องการฝัง
 * @returns {string}
 */
function buildQRImageUrl(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&ecc=M`;
}


// ============================================================
// 🎨 SECTION 9: Flex Messages — UI Templates
// ============================================================

// ── Monitor Templates ─────────────────────────────────────────

/**
 * [MONITOR] รายการคาบเรียนวันนี้ — Carousel
 *
 * @param {string}        classroom
 * @param {Array<Object>} schedules - รวม Teacher_Name แล้ว
 * @returns {Object} Flex Message
 */
function flexPeriodList(classroom, schedules) {
  if (schedules.length === 0) return flexNoSchedule(classroom);

  const headerBubble = {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
      contents: [
        { type: 'text', text: '📅 ตารางสอนวันนี้', size: 'lg', weight: 'bold', color: FLEX_COLORS.SECONDARY },
        { type: 'text', text: `🏫 ${classroom}`, size: 'sm', color: FLEX_COLORS.TEXT_SUB, margin: 'xs' },
        { type: 'text', text: formatThaiDate(new Date()), size: 'xs', color: FLEX_COLORS.TEXT_SUB },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'กดปุ่ม "สร้าง QR" เพื่อสร้าง QR Code\nให้ครูผู้สอนสแกนค่ะ', size: 'xs', color: FLEX_COLORS.NEUTRAL, wrap: true, margin: 'md' },
      ],
    },
  };

  const periodBubbles = schedules.map(subject => {
    const period          = getPeriodByNumber(Number(subject['Period_Number']));
    const periodEndNum    = Number(subject['Period_End_Number'] || subject['Period_Number']);
    const periodEnd       = getPeriodByNumber(periodEndNum);
    const timeLabel       = (period && periodEnd)
      ? `${period.start} – ${periodEnd.end}`
      : (period ? `${period.start} – ${period.end}` : '');
    const periodLabel     = buildPeriodLabel(
      subject['Period_Name'],
      periodEndNum,
      Number(subject['Period_Number'])
    );

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '12px',
        contents: [
          { type: 'text', text: periodLabel, color: FLEX_COLORS.WHITE, size: 'sm', weight: 'bold' },
          { type: 'text', text: timeLabel, color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'text', text: subject['Subject_Name'] || '-', size: 'sm', weight: 'bold', color: FLEX_COLORS.TEXT_MAIN, wrap: true },
          {
            type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm',
            contents: [
              { type: 'text', text: '👩‍🏫', size: 'xs', flex: 0 },
              { type: 'text', text: subject['Teacher_Name'] || subject['Teacher_ID'] || '-', size: 'xs', color: FLEX_COLORS.TEXT_SUB, flex: 1 },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm',
          action: {
            type: 'postback', label: '📲 สร้าง QR',
            data: `action=create_qr&p=${subject['Period_Number']}&c=${encodeURIComponent(subject['Classroom'])}&s=${encodeURIComponent(subject['Subject_Code'])}`,
            displayText: `สร้าง QR ${subject['Period_Name'] || `คาบที่ ${subject['Period_Number']}`}`,
          },
        }],
      },
    };
  });

  return {
    type: 'flex',
    altText: `ตารางสอนวันนี้ ${classroom} — กรุณาเปิดเพื่อดูรายละเอียดค่ะ`,
    contents: { type: 'carousel', contents: [headerBubble, ...periodBubbles] },
  };
}


/**
 * [MONITOR] ยืนยันก่อนสร้าง QR
 *
 * @param {Object}      subject
 * @param {Object|null} teacher
 * @param {Object}      period
 * @returns {Object}
 */
function flexQRConfirm(subject, teacher, period) {
  const periodEndNum    = Number(subject['Period_End_Number'] || subject['Period_Number']);
  const periodEndObj    = getPeriodByNumber(periodEndNum);
  const qrPeriodLabel   = buildPeriodLabel(period.name, periodEndNum, Number(subject['Period_Number']));
  const qrEndTime       = periodEndObj ? periodEndObj.end : period.end;

  return {
    type: 'flex',
    altText: `ยืนยันสร้าง QR Code — ${subject['Subject_Name']} ${qrPeriodLabel}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '📲 ยืนยันสร้าง QR Code', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: 'กรุณาตรวจสอบข้อมูลก่อนสร้างค่ะ', color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          _infoRow('📚', 'วิชา',       subject['Subject_Name'] || '-'),
          _infoRow('👩‍🏫', 'ครูผู้สอน', teacher ? teacher['Teacher_Name'] : '-'),
          _infoRow('🏫', 'ห้องเรียน', subject['Classroom'] || '-'),
          _infoRow('🕐', 'คาบ',        `${qrPeriodLabel} (${period.start}–${qrEndTime})`),
          _infoRow('📅', 'วันที่',      formatThaiDate(new Date())),
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal', backgroundColor: '#FFF8E1', cornerRadius: '8px', paddingAll: '10px', margin: 'md',
            contents: [{ type: 'text', text: `⏱️ QR Code จะหมดอายุใน ${SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES} นาทีค่ะ`, size: 'xs', color: FLEX_COLORS.WARNING, wrap: true }],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'secondary', height: 'sm', flex: 1, action: { type: 'postback', label: '❌ ยกเลิก', data: 'action=cancel_qr', displayText: 'ยกเลิก' } },
          {
            type: 'button', style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm', flex: 2,
            action: {
              type: 'postback', label: '✅ ยืนยันสร้าง QR',
              data: `action=confirm_qr&p=${subject['Period_Number']}&c=${encodeURIComponent(subject['Classroom'])}&s=${encodeURIComponent(subject['Subject_Code'])}`,
              displayText: 'ยืนยันสร้าง QR Code',
            },
          },
        ],
      },
    },
  };
}


/**
 * [MONITOR] แจ้งเตือนเมื่อครูเช็คอินแล้ว
 *
 * @param {string} teacherName
 * @param {string} subjectName
 * @param {string} periodName
 * @param {string} topic
 * @returns {Object}
 */
function flexMonitorCheckinNotify(teacherName, subjectName, periodName, topic) {
  return {
    type: 'flex',
    altText: `✅ ${teacherName} เช็คอินแล้วค่ะ`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'md',
            contents: [
              { type: 'text', text: '✅', size: 'xxl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: 'ครูเช็คอินแล้วค่ะ!', size: 'md', weight: 'bold', color: FLEX_COLORS.PRIMARY },
                  { type: 'text', text: teacherName, size: 'sm', color: FLEX_COLORS.TEXT_MAIN, margin: 'xs' },
                ],
              },
            ],
          },
          { type: 'separator', margin: 'md' },
          _infoRow('📚', 'วิชา',        subjectName),
          _infoRow('🕐', 'คาบ',         periodName),
          _infoRow('📝', 'เรื่องที่สอน', topic || '-'),
        ],
      },
    },
  };
}


// ── Teacher Templates ─────────────────────────────────────────

/**
 * [TEACHER] ข้อมูลคาบหลังสแกน QR สำเร็จ
 *
 * @param {Object} qrData
 * @param {Object} teacher
 * @returns {Object}
 */
function flexClassInfo(qrData, teacher) {
  const period          = getPeriodByNumber(Number(qrData['Period_Number']));
  const periodEndNumber = Number(qrData['Period_End_Number'] || qrData['Period_Number']);
  const periodEnd       = getPeriodByNumber(periodEndNumber);
  const timeLabel       = (period && periodEnd)
    ? `${period.start} – ${periodEnd.end}`
    : (period ? `${period.start} – ${period.end}` : '-');
  const periodLabel     = buildPeriodLabel(
    qrData['Period_Name'],
    periodEndNumber,
    Number(qrData['Period_Number'])
  );

  return {
    type: 'flex',
    altText: `สแกน QR สำเร็จ — ${qrData['Subject_Name'] || qrData['Subject_Code']}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '📲 สแกน QR สำเร็จ!', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: 'ตรวจสอบข้อมูล แล้วกดปุ่ม "เข้าสอน" ด้านล่างค่ะ', color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: qrData['Subject_Name'] || qrData['Subject_Code'] || '-', size: 'lg', weight: 'bold', color: FLEX_COLORS.TEXT_MAIN, wrap: true },
          { type: 'separator', margin: 'md' },
          _infoRow('👩‍🏫', 'ครูผู้สอน',  teacher ? teacher['Teacher_Name'] : '-'),
          _infoRow('🏫', 'ห้องเรียน',  qrData['Classroom'] || '-'),
          _infoRow('🕐', 'คาบเรียน',   `${periodLabel} (${timeLabel})`),
          _infoRow('📅', 'วันที่',      formatThaiDate(new Date())),
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'secondary', height: 'sm', flex: 1,
            action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก' },
          },
          {
            type: 'button', style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm', flex: 2,
            action: {
              type: 'postback',
              label: '✅ เข้าสอน',
              data: 'action=confirm_teaching',
              displayText: 'ยืนยันเข้าสอนค่ะ',
            },
          },
        ],
      },
    },
  };
}


/**
 * [TEACHER] สรุปข้อมูลก่อนยืนยันเช็คอิน
 *
 * @param {Object} checkinData
 * @returns {Object}
 */
function flexCheckinConfirm(checkinData) {
  return {
    type: 'flex',
    altText: 'ยืนยันการเช็คอิน — กรุณาตรวจสอบข้อมูลค่ะ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.ACCENT, paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 ยืนยันการเช็คอิน', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: 'กรุณาตรวจสอบข้อมูลก่อนกดยืนยันค่ะ', color: '#FFE0CC', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          _infoRow('👩‍🏫', 'ครูผู้สอน',  checkinData.teacherName || '-'),
          _infoRow('📚', 'วิชา',        checkinData.subjectName || '-'),
          _infoRow('🏫', 'ห้องเรียน',   checkinData.classroom   || '-'),
          _infoRow('🕐', 'คาบเรียน',    `${checkinData.periodName} (${checkinData.timeStart}–${checkinData.timeEnd})`),
          _infoRow('📅', 'วันที่',       formatThaiDate(new Date())),
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.LIGHT_BG, cornerRadius: '8px', paddingAll: '12px', margin: 'md',
            contents: [
              { type: 'text', text: '📝 เรื่องที่สอน', size: 'xs', color: FLEX_COLORS.NEUTRAL, weight: 'bold' },
              { type: 'text', text: checkinData.teachingTopic || '-', size: 'sm', color: FLEX_COLORS.TEXT_MAIN, wrap: true, margin: 'xs' },
            ],
          },
          {
            type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.LIGHT_BG, cornerRadius: '8px', paddingAll: '12px', margin: 'sm',
            contents: [
              { type: 'text', text: '📋 งานมอบหมาย', size: 'xs', color: FLEX_COLORS.NEUTRAL, weight: 'bold' },
              { type: 'text', text: checkinData.assignment || 'ไม่มีงานมอบหมาย', size: 'sm', color: checkinData.assignment ? FLEX_COLORS.TEXT_MAIN : FLEX_COLORS.TEXT_SUB, wrap: true, margin: 'xs' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'secondary', height: 'sm', flex: 1, action: { type: 'postback', label: '✏️ แก้ไข', data: 'action=edit_checkin', displayText: 'ขอแก้ไขข้อมูลค่ะ' } },
          { type: 'button', style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm', flex: 2, action: { type: 'postback', label: '✅ ยืนยันเช็คอิน', data: 'action=confirm_checkin', displayText: 'ยืนยันการเช็คอินค่ะ' } },
        ],
      },
    },
  };
}


/**
 * [TEACHER] แจ้งผลเช็คอินสำเร็จ
 *
 * @param {Object} checkinData (รวม status แล้ว)
 * @returns {Object}
 */
function flexCheckinSuccess(checkinData) {
  const isOnTime    = checkinData.status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME;
  const statusColor = isOnTime ? FLEX_COLORS.PRIMARY : FLEX_COLORS.WARNING;
  const statusIcon  = isOnTime ? '✅' : '⚠️';

  const checkinStr  = checkinData.checkinTime
    ? new Date(checkinData.checkinTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '-';
  const checkoutStr = checkinData.checkoutTime
    ? new Date(checkinData.checkoutTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '-';
  const durationText = checkinData.durationMinutes != null
    ? `${checkinData.durationMinutes} นาที`
    : '-';

  return {
    type: 'flex',
    altText: `✅ บันทึกการสอนสำเร็จ — ${checkinData.subjectName}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          {
            type: 'box', layout: 'vertical', alignItems: 'center',
            contents: [
              { type: 'text', text: statusIcon, size: '5xl', align: 'center' },
              { type: 'text', text: 'บันทึกการสอนสำเร็จ!', size: 'lg', weight: 'bold', color: statusColor, align: 'center', margin: 'md' },
              { type: 'text', text: checkinData.status || '', size: 'sm', color: statusColor, align: 'center' },
            ],
          },
          { type: 'separator', margin: 'lg' },
          _infoRow('📚', 'วิชา',        checkinData.subjectName   || '-'),
          _infoRow('🕐', 'คาบ',         checkinData.periodName    || '-'),
          _infoRow('🏫', 'ห้องเรียน',   checkinData.classroom     || '-'),
          { type: 'separator', margin: 'md' },
          _infoRow('🟢', 'เวลาเข้าสอน', `${checkinStr} น.`),
          _infoRow('🔴', 'เวลาออก',     `${checkoutStr} น.`),
          _infoRow('⏱️', 'รวมเวลาสอน',  durationText),
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.LIGHT_BG, cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
            contents: [
              { type: 'text', text: '📝 เรื่องที่สอน', size: 'xs', color: FLEX_COLORS.NEUTRAL, weight: 'bold' },
              { type: 'text', text: checkinData.teachingTopic || '-', size: 'sm', color: FLEX_COLORS.TEXT_MAIN, wrap: true, margin: 'xs' },
            ],
          },
          {
            type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.LIGHT_BG, cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
            contents: [
              { type: 'text', text: '📋 งานมอบหมาย', size: 'xs', color: FLEX_COLORS.NEUTRAL, weight: 'bold' },
              { type: 'text', text: checkinData.assignment || 'ไม่มีงานมอบหมาย', size: 'sm', color: checkinData.assignment ? FLEX_COLORS.TEXT_MAIN : FLEX_COLORS.TEXT_SUB, wrap: true, margin: 'xs' },
            ],
          },
          { type: 'text', text: 'ขอบคุณค่ะ 🙏', size: 'sm', color: FLEX_COLORS.NEUTRAL, align: 'center', margin: 'md' },
        ],
      },
    },
  };
}


/**
 * [TEACHER] ประวัติการเช็คอิน 5 รายการล่าสุด
 *
 * @param {string}        teacherName
 * @param {Array<Object>} history
 * @returns {Object}
 */
function flexTeacherHistory(teacherName, history) {
  const rows = history.slice(0, 5).map(log => {
    const d       = new Date(log['Timestamp']);
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const onTime  = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME;

    return {
      type: 'box', layout: 'horizontal', paddingAll: '8px', spacing: 'sm',
      contents: [
        { type: 'text', text: onTime ? '🟢' : '🟡', size: 'xs', flex: 0 },
        {
          type: 'box', layout: 'vertical', flex: 1,
          contents: [
            { type: 'text', text: log['Subject_Name'] || '-', size: 'xs', weight: 'bold', color: FLEX_COLORS.TEXT_MAIN, wrap: true },
            { type: 'text', text: `${log['Period_Name']} • ${log['Classroom']}`, size: 'xxs', color: FLEX_COLORS.TEXT_SUB },
          ],
        },
        {
          type: 'box', layout: 'vertical', flex: 0, alignItems: 'flex-end',
          contents: [
            { type: 'text', text: dateStr, size: 'xxs', color: FLEX_COLORS.TEXT_SUB, align: 'end' },
            { type: 'text', text: timeStr, size: 'xxs', color: FLEX_COLORS.TEXT_SUB, align: 'end' },
          ],
        },
      ],
    };
  });

  if (rows.length === 0) {
    rows.push({ type: 'text', text: 'ยังไม่มีประวัติการเช็คอินค่ะ', size: 'sm', color: FLEX_COLORS.TEXT_SUB, align: 'center' });
  }

  return {
    type: 'flex',
    altText: `ประวัติการเช็คอินของ ${teacherName}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '📊 ประวัติการเช็คอิน', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: `${teacherName} (5 รายการล่าสุด)`, color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: '8px', contents: rows },
      footer: {
        type: 'box', layout: 'horizontal', paddingAll: '8px',
        contents: [{ type: 'text', text: '🟢 ตรงเวลา   🟡 สาย', size: 'xxs', color: FLEX_COLORS.TEXT_SUB, align: 'center' }],
      },
    },
  };
}


/**
 * [TEACHER] เมนูหลักของครู
 *
 * @param {string} teacherName
 * @returns {Object}
 */
function flexTeacherMenu(teacherName) {
  return {
    type: 'flex',
    altText: `สวัสดีค่ะ ${teacherName}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '👋 สวัสดีค่ะ', color: FLEX_COLORS.WHITE, size: 'sm' },
          { type: 'text', text: teacherName, color: FLEX_COLORS.WHITE, size: 'lg', weight: 'bold', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'text', text: 'ระบบเช็คอินการเข้าสอน พร้อมใช้งานค่ะ ✅', size: 'sm', color: FLEX_COLORS.TEXT_SUB, wrap: true },
          { type: 'separator', margin: 'md' },
          _menuButton('📊 ประวัติการเช็คอินของฉัน', 'action=teacher_history', FLEX_COLORS.SECONDARY),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{ type: 'text', text: '💡 สแกน QR Code จากหัวหน้าห้อง\nเพื่อเช็คอินการเข้าสอนได้เลยค่ะ', size: 'xs', color: FLEX_COLORS.NEUTRAL, align: 'center', wrap: true }],
      },
    },
  };
}


// ── Admin Templates ───────────────────────────────────────────

/**
 * [ADMIN] รายงานสรุปประจำวัน
 *
 * @param {Object} summary
 * @returns {Object}
 */
function flexAdminDailyReport(summary) {
  return {
    type: 'flex',
    altText: `📊 รายงานสรุปวันนี้ — เช็คอินแล้ว ${summary.totalCheckIns} คาบ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '📊 รายงานสรุปประจำวัน', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: summary.date || formatThaiDate(new Date()), color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              _statBox('รวมทั้งหมด', `${summary.totalCheckIns} คาบ`, FLEX_COLORS.SECONDARY),
              _statBox('ตรงเวลา',    `${summary.onTime} คาบ`,        FLEX_COLORS.PRIMARY),
              _statBox('สาย',        `${summary.late} คาบ`,          FLEX_COLORS.WARNING),
            ],
          },
          { type: 'separator', margin: 'md' },
          _infoRow('👩‍🏫', 'ครูที่เช็คอินแล้ว', `${summary.uniqueTeachers} คน`),
          { type: 'separator', margin: 'sm' },
          { type: 'text', text: 'กดปุ่มด้านล่างเพื่อดูรายละเอียดค่ะ', size: 'xs', color: FLEX_COLORS.TEXT_SUB, align: 'center', margin: 'md' },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'secondary', height: 'sm', flex: 1, action: { type: 'postback', label: '📋 รายละเอียด', data: 'action=admin_detail_report', displayText: 'ดูรายละเอียด' } },
          { type: 'button', style: 'primary', color: FLEX_COLORS.SECONDARY, height: 'sm', flex: 1, action: { type: 'postback', label: '📥 Export', data: 'action=admin_export', displayText: 'Export รายงาน' } },
        ],
      },
    },
  };
}


/**
 * [ADMIN] รายละเอียดการเช็คอินวันนี้ แยกตามคาบ — Carousel
 *
 * @param {Array<Object>} logs
 * @returns {Object}
 */
function flexAdminDetailReport(logs) {
  const byPeriod = {};
  logs.forEach(log => {
    const key = `${log['Period_Number']}_${log['Period_Name']}`;
    if (!byPeriod[key]) byPeriod[key] = [];
    byPeriod[key].push(log);
  });

  const periodKeys = Object.keys(byPeriod).sort((a, b) =>
    Number(a.split('_')[0]) - Number(b.split('_')[0])
  );

  if (periodKeys.length === 0) {
    return {
      type: 'flex', altText: 'ยังไม่มีการเช็คอินในวันนี้ค่ะ',
      contents: {
        type: 'bubble',
        body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: [{ type: 'text', text: '📋 ยังไม่มีการเช็คอิน\nในวันนี้ค่ะ', size: 'md', color: FLEX_COLORS.TEXT_SUB, align: 'center', wrap: true }] },
      },
    };
  }

  const bubbles = periodKeys.map(key => {
    const periodLogs = byPeriod[key];
    const periodName = key.split('_').slice(1).join('_');
    const period     = getPeriodByNumber(Number(key.split('_')[0]));
    const timeLabel  = period ? `${period.start}–${period.end}` : '';

    const teacherRows = periodLogs.map(log => ({
      type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
      contents: [
        { type: 'text', text: log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡', size: 'xs', flex: 0 },
        {
          type: 'box', layout: 'vertical', flex: 1,
          contents: [
            { type: 'text', text: log['Teacher_Name'] || '-', size: 'xs', weight: 'bold', color: FLEX_COLORS.TEXT_MAIN },
            { type: 'text', text: log['Subject_Name'] || '-', size: 'xxs', color: FLEX_COLORS.TEXT_SUB },
          ],
        },
      ],
    }));

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '10px',
        contents: [
          { type: 'text', text: periodName, color: FLEX_COLORS.WHITE, size: 'sm', weight: 'bold' },
          { type: 'text', text: timeLabel, color: '#B0BEC5', size: 'xxs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs', contents: teacherRows },
    };
  });

  return {
    type: 'flex',
    altText: `รายละเอียดการเช็คอินวันนี้ — ${logs.length} รายการ`,
    contents: { type: 'carousel', contents: bubbles },
  };
}


/**
 * [ADMIN] รายงานรายสัปดาห์
 *
 * @param {Object} byDay
 * @param {Date}   startDate
 * @param {Date}   endDate
 * @returns {Object}
 */
function flexAdminWeeklyReport(byDay, startDate, endDate) {
  const days     = Object.keys(byDay);
  const maxTotal = Math.max(...days.map(d => byDay[d].total), 1);
  const totalAll  = days.reduce((s, d) => s + byDay[d].total,  0);
  const onTimeAll = days.reduce((s, d) => s + byDay[d].onTime, 0);
  const lateAll   = days.reduce((s, d) => s + byDay[d].late,   0);
  const startStr  = startDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const endStr    = endDate.toLocaleDateString('th-TH',   { day: 'numeric', month: 'short' });

  const dayRows = days.map(day => {
    const d = byDay[day];
    const barWidth = Math.round((d.total / maxTotal) * 100);
    return {
      type: 'box', layout: 'vertical', margin: 'sm',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: day,           size: 'xs', color: FLEX_COLORS.TEXT_SUB,  flex: 3 },
            { type: 'text', text: `${d.total} คาบ`, size: 'xs', color: FLEX_COLORS.TEXT_MAIN, align: 'end', flex: 2 },
          ],
        },
        {
          type: 'box', layout: 'vertical', margin: 'xs', height: '6px', backgroundColor: '#E0E0E0', cornerRadius: '3px',
          contents: [{ type: 'box', layout: 'vertical', width: `${barWidth}%`, height: '6px', backgroundColor: FLEX_COLORS.PRIMARY, cornerRadius: '3px', contents: [] }],
        },
      ],
    };
  });

  return {
    type: 'flex',
    altText: `รายงานรายสัปดาห์ — ${totalAll} รายการ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '📅 รายงานรายสัปดาห์', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: `${startStr} – ${endStr}`, color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              _statBox('รวมทั้งหมด', `${totalAll}`,  FLEX_COLORS.SECONDARY),
              _statBox('ตรงเวลา',    `${onTimeAll}`, FLEX_COLORS.PRIMARY),
              _statBox('สาย',        `${lateAll}`,   FLEX_COLORS.WARNING),
            ],
          },
          { type: 'separator', margin: 'md' },
          ...dayRows,
        ],
      },
    },
  };
}


/**
 * [ADMIN] เมนูหลัก
 *
 * @returns {Object}
 */
function flexAdminMenu() {
  return {
    type: 'flex',
    altText: 'เมนู Admin ฝ่ายวิชาการ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '👔 Admin ฝ่ายวิชาการ', color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold' },
          { type: 'text', text: SCHOOL_CONFIG.SCHOOL_NAME, color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          _menuButton('📊 ดูสรุปวันนี้',      'action=admin_today_summary',  FLEX_COLORS.SECONDARY),
          _menuButton('📋 รายละเอียดวันนี้',   'action=admin_detail_report',  FLEX_COLORS.SECONDARY),
          _menuButton('📅 รายงานรายสัปดาห์',  'action=admin_weekly_report',  FLEX_COLORS.NEUTRAL),
          _menuButton('📥 Export รายงาน',      'action=admin_export',         FLEX_COLORS.NEUTRAL),
        ],
      },
    },
  };
}


/**
 * [SUPER ADMIN] เมนูเลือกโหมดการทำงาน
 * แสดงตอนที่ Admin ยังไม่ได้เลือกโหมด
 *
 * @returns {Object} Flex Message
 */
function flexSuperAdminMenu() {
  return {
    type: 'flex',
    altText: '⚙️ Super Admin — เลือกโหมดการทำงานค่ะ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY, paddingAll: '16px',
        contents: [
          { type: 'text', text: '⚙️ Super Admin', color: FLEX_COLORS.WHITE, size: 'sm' },
          { type: 'text', text: 'เลือกโหมดการทำงาน', color: FLEX_COLORS.WHITE, size: 'lg', weight: 'bold', margin: 'xs' },
          { type: 'text', text: SCHOOL_CONFIG.SCHOOL_NAME, color: '#B0BEC5', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical',
        spacing: 'sm', paddingAll: '12px',
        contents: [

          // ── โหมดรายงาน ───────────────────────────────────
          {
            type: 'box', layout: 'horizontal',
            backgroundColor: '#E3F2FD', cornerRadius: '10px',
            paddingAll: '12px', margin: 'xs', spacing: 'md',
            action: {
              type: 'postback', label: 'โหมดรายงาน',
              data: 'action=admin_switch_mode&mode=REPORT',
              displayText: 'เข้าโหมดรายงาน',
            },
            contents: [
              { type: 'text', text: '📊', size: 'xl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: 'โหมดรายงาน', size: 'sm', weight: 'bold', color: FLEX_COLORS.SECONDARY },
                  { type: 'text', text: 'ดูสรุป / รายงานการเช็คอิน / Export', size: 'xs', color: FLEX_COLORS.TEXT_SUB, wrap: true },
                ],
              },
              { type: 'text', text: '›', size: 'lg', color: FLEX_COLORS.SECONDARY, flex: 0, align: 'end' },
            ],
          },

          // ── โหมดครูผู้สอน ─────────────────────────────────
          {
            type: 'box', layout: 'horizontal',
            backgroundColor: '#E8F5E9', cornerRadius: '10px',
            paddingAll: '12px', margin: 'xs', spacing: 'md',
            action: {
              type: 'postback', label: 'โหมดเช็คอิน',
              data: 'action=admin_switch_mode&mode=TEACHER',
              displayText: 'เข้าโหมดครูผู้สอน',
            },
            contents: [
              { type: 'text', text: '👩‍🏫', size: 'xl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: 'โหมดครูผู้สอน', size: 'sm', weight: 'bold', color: FLEX_COLORS.PRIMARY },
                  { type: 'text', text: 'สแกน QR เช็คอินการเข้าสอน', size: 'xs', color: FLEX_COLORS.TEXT_SUB, wrap: true },
                ],
              },
              { type: 'text', text: '›', size: 'lg', color: FLEX_COLORS.PRIMARY, flex: 0, align: 'end' },
            ],
          },

          // ── โหมดสร้าง QR ──────────────────────────────────
          {
            type: 'box', layout: 'horizontal',
            backgroundColor: '#FFF3E0', cornerRadius: '10px',
            paddingAll: '12px', margin: 'xs', spacing: 'md',
            action: {
              type: 'postback', label: 'โหมดสร้าง QR',
              data: 'action=admin_switch_mode&mode=MONITOR',
              displayText: 'เข้าโหมดสร้าง QR',
            },
            contents: [
              { type: 'text', text: '📲', size: 'xl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: 'โหมดสร้าง QR', size: 'sm', weight: 'bold', color: FLEX_COLORS.ACCENT },
                  { type: 'text', text: 'สร้าง QR ให้ครูสแกนได้ทุกห้อง', size: 'xs', color: FLEX_COLORS.TEXT_SUB, wrap: true },
                ],
              },
              { type: 'text', text: '›', size: 'lg', color: FLEX_COLORS.ACCENT, flex: 0, align: 'end' },
            ],
          },

        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'text',
          text: '💡 กดที่การ์ดหรือ Quick Reply\nเพื่อเลือกโหมดการทำงานค่ะ',
          size: 'xs', color: FLEX_COLORS.NEUTRAL,
          align: 'center', wrap: true,
        }],
      },
    },
  };
}


/**
 * [ADMIN] ปุ่ม Export พร้อม Link Sheets
 *
 * @param {string} sheetsUrl
 * @returns {Object}
 */
function flexExportCard(sheetsUrl) {
  return {
    type: 'flex',
    altText: 'Export รายงาน — กดเพื่อเปิด Google Sheets',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          { type: 'text', text: '📥 Export รายงาน', size: 'md', weight: 'bold', color: FLEX_COLORS.SECONDARY },
          { type: 'text', text: 'กดปุ่มด้านล่างเพื่อเปิด Google Sheets\nแล้วเลือก File > Download ได้เลยค่ะ', size: 'sm', color: FLEX_COLORS.TEXT_SUB, wrap: true },
          {
            type: 'box', layout: 'vertical', backgroundColor: '#E8F5E9', cornerRadius: '8px', paddingAll: '10px', margin: 'md',
            contents: [
              { type: 'text', text: '💡 วิธี Export เป็น Excel', size: 'xs', color: FLEX_COLORS.PRIMARY, weight: 'bold' },
              { type: 'text', text: '1. เปิด Sheets\n2. เลือก Teacher_CheckIn_Log\n3. File > Download > .xlsx', size: 'xs', color: FLEX_COLORS.TEXT_SUB, wrap: true, margin: 'xs' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{ type: 'button', style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm', action: { type: 'uri', label: '📊 เปิด Google Sheets', uri: sheetsUrl } }],
      },
    },
  };
}


// ── System Templates ──────────────────────────────────────────

/**
 * [SYSTEM] ไม่มีตารางเรียนวันนี้
 *
 * @param {string} classroom
 * @returns {Object}
 */
function flexNoSchedule(classroom) {
  return {
    type: 'flex',
    altText: `ไม่พบตารางสอนของ ${classroom} วันนี้ค่ะ`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '24px', alignItems: 'center', spacing: 'md',
        contents: [
          { type: 'text', text: '📅', size: '5xl', align: 'center' },
          { type: 'text', text: 'ไม่พบตารางสอนวันนี้', size: 'lg', weight: 'bold', color: FLEX_COLORS.TEXT_MAIN, align: 'center' },
          { type: 'text', text: `ห้อง ${classroom}\n${formatThaiDate(new Date())}`, size: 'sm', color: FLEX_COLORS.TEXT_SUB, align: 'center', wrap: true },
          { type: 'text', text: 'หากมีข้อสงสัย กรุณาติดต่อฝ่ายวิชาการค่ะ', size: 'xs', color: FLEX_COLORS.NEUTRAL, align: 'center', wrap: true, margin: 'md' },
        ],
      },
    },
  };
}

/**
 * [REGISTRATION] แสดงผลลัพธ์การค้นหาครู — Carousel
 * แต่ละ Bubble = ครู 1 คน พร้อมปุ่มยืนยัน
 *
 * @param {string}        keyword - คำค้นที่ใช้
 * @param {Array<Object>} results - ผลลัพธ์จาก searchTeachersByKeyword()
 * @returns {Object} Flex Message
 */
function flexRegSearchResults(keyword, results) {
  const headerBubble = {
    type: 'bubble', size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
      justifyContent: 'center', alignItems: 'center',
      contents: [
        { type: 'text', text: '🔍', size: '4xl', align: 'center' },
        { type: 'text', text: `พบ ${results.length} ชื่อ`, size: 'lg', weight: 'bold', color: FLEX_COLORS.SECONDARY, align: 'center', margin: 'md' },
        { type: 'text', text: `สำหรับคำค้น "${keyword}"`, size: 'sm', color: FLEX_COLORS.TEXT_SUB, align: 'center' },
        { type: 'separator', margin: 'lg' },
        { type: 'text', text: 'เลื่อนดูรายชื่อ แล้วกดปุ่ม\n"นี่คือฉัน" เพื่อลงทะเบียนค่ะ 👉', size: 'xs', color: FLEX_COLORS.NEUTRAL, align: 'center', wrap: true, margin: 'md' },
      ],
    },
  };

  const teacherBubbles = results.map(teacher => {
    const hasLineId   = teacher['LINE_User_ID'] && teacher['LINE_User_ID'].toString().trim() !== '';
    const dept        = teacher['Department'] || teacher['Subject_Group'] || '';
    const statusColor = hasLineId ? FLEX_COLORS.NEUTRAL : FLEX_COLORS.PRIMARY;
    const statusText  = hasLineId ? '🔒 ลงทะเบียนแล้ว' : '✅ พร้อมลงทะเบียน';

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: hasLineId ? FLEX_COLORS.NEUTRAL : FLEX_COLORS.SECONDARY,
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '👩‍🏫 ครูผู้สอน', color: '#FFFFFF99', size: 'xs' },
          { type: 'text', text: teacher['Teacher_Name'], color: FLEX_COLORS.WHITE, size: 'md', weight: 'bold', wrap: true, margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          ...(dept ? [_infoRow('🏫', 'กลุ่มสาระ', dept)] : []),
          _infoRow('🆔', 'รหัส', teacher['Teacher_ID'] || '-'),
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal', backgroundColor: hasLineId ? '#F5F5F5' : '#E8F5E9',
            cornerRadius: '8px', paddingAll: '8px', margin: 'md',
            contents: [{
              type: 'text', text: statusText, size: 'xs',
              color: statusColor, align: 'center', weight: 'bold',
            }],
          },
        ],
      },
      footer: hasLineId ? undefined : {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm',
          action: {
            type: 'postback',
            label: '✋ นี่คือฉัน',
            data: `action=reg_confirm&teacher_id=${encodeURIComponent(teacher['Teacher_ID'])}`,
            displayText: `ยืนยัน: ${teacher['Teacher_Name']}`,
          },
        }],
      },
    };
  });

  return {
    type: 'flex',
    altText: `พบ ${results.length} ชื่อสำหรับ "${keyword}" — กรุณาเปิดเพื่อลงทะเบียนค่ะ`,
    contents: {
      type: 'carousel',
      contents: [headerBubble, ...teacherBubbles],
    },
  };
}

/**
 * [REGISTRATION QR] แสดงผลลัพธ์การค้นหาผู้สร้าง QR — Carousel
 * แต่ละ Bubble = ผู้สร้าง QR 1 คน พร้อมปุ่มยืนยัน
 *
 * @param {string}        keyword - คำค้นที่ใช้
 * @param {Array<Object>} results - ผลลัพธ์จาก searchMonitorsByKeyword()
 * @returns {Object} Flex Message
 */
function flexRegQRSearchResults(keyword, results) {

  // Header Bubble — สรุปผลการค้นหา
  const headerBubble = {
    type: 'bubble', size: 'kilo',
    body: {
      type: 'box', layout: 'vertical',
      paddingAll: '20px', spacing: 'md',
      justifyContent: 'center', alignItems: 'center',
      contents: [
        { type: 'text', text: '🔍', size: '4xl', align: 'center' },
        {
          type: 'text',
          text: `พบ ${results.length} ชื่อ`,
          size: 'lg', weight: 'bold',
          color: FLEX_COLORS.SECONDARY, align: 'center', margin: 'md',
        },
        {
          type: 'text',
          text: `สำหรับคำค้น "${keyword}"`,
          size: 'sm', color: FLEX_COLORS.TEXT_SUB, align: 'center',
        },
        { type: 'separator', margin: 'lg' },
        {
          type: 'text',
          text: 'เลื่อนดูรายชื่อ\nแล้วกดปุ่ม "นี่คือฉัน"\nเพื่อลงทะเบียนค่ะ 👉',
          size: 'xs', color: FLEX_COLORS.NEUTRAL,
          align: 'center', wrap: true, margin: 'md',
        },
      ],
    },
  };

  // Monitor Bubbles — แสดงผลทีละคน
  const monitorBubbles = results.map(monitor => {
    const hasLineId    = monitor['LINE_User_ID'] && monitor['LINE_User_ID'].toString().trim() !== '';
    const creatorLabel = _getCreatorTypeDisplay(monitor['Creator_Type']);
    const scopeLabel   = getScopeLabel(monitor);
    const noteText     = monitor['Note'] ? monitor['Note'].toString() : '';
    const headerColor  = hasLineId ? FLEX_COLORS.NEUTRAL : FLEX_COLORS.SECONDARY;
    const statusColor  = hasLineId ? FLEX_COLORS.NEUTRAL : FLEX_COLORS.PRIMARY;
    const statusText   = hasLineId ? '🔒 ลงทะเบียนแล้ว' : '✅ พร้อมลงทะเบียน';
    const statusBg     = hasLineId ? '#F5F5F5' : '#E8F5E9';

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: headerColor, paddingAll: '14px',
        contents: [
          {
            type: 'text',
            text: creatorLabel,
            color: '#FFFFFF99', size: 'xs',
          },
          {
            type: 'text',
            text: monitor['Student_Name'],
            color: FLEX_COLORS.WHITE, size: 'md',
            weight: 'bold', wrap: true, margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical',
        paddingAll: '14px', spacing: 'sm',
        contents: [
          _infoRow('📌', 'ขอบเขต',   scopeLabel),
          _infoRow('🆔', 'รหัส',     monitor['Monitor_ID'] || '-'),
          // แสดง Note เฉพาะเมื่อมีข้อมูล
          ...(noteText ? [_infoRow('📝', 'หมายเหตุ', noteText)] : []),
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal',
            backgroundColor: statusBg, cornerRadius: '8px',
            paddingAll: '8px', margin: 'md',
            contents: [{
              type: 'text', text: statusText,
              size: 'xs', color: statusColor,
              align: 'center', weight: 'bold',
            }],
          },
        ],
      },
      // ซ่อน Footer ถ้าลงทะเบียนแล้ว
      footer: hasLineId ? undefined : {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button',
          style: 'primary', color: FLEX_COLORS.PRIMARY, height: 'sm',
          action: {
            type: 'postback',
            label: '✋ นี่คือฉัน',
            data: `action=reg_qr_confirm&monitor_id=${encodeURIComponent(monitor['Monitor_ID'])}`,
            displayText: `ยืนยัน: ${monitor['Student_Name']}`,
          },
        }],
      },
    };
  });

  return {
    type: 'flex',
    altText: `พบ ${results.length} ชื่อสำหรับ "${keyword}" — กรุณาเปิดเพื่อลงทะเบียนค่ะ`,
    contents: {
      type: 'carousel',
      contents: [headerBubble, ...monitorBubbles],
    },
  };
}


// ── Private Helper Functions ──────────────────────────────────

/** สร้าง Row ข้อมูล Label:Value แบบ Horizontal @private */
function _infoRow(icon, label, value) {
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
    contents: [
      { type: 'text', text: icon,              size: 'sm', flex: 0 },
      { type: 'text', text: label,             size: 'sm', color: FLEX_COLORS.TEXT_SUB,  flex: 2 },
      { type: 'text', text: String(value||'-'), size: 'sm', color: FLEX_COLORS.TEXT_MAIN, flex: 3, wrap: true, align: 'end' },
    ],
  };
}

/** สร้างกล่องสถิติขนาดเล็ก @private */
function _statBox(label, value, color) {
  return {
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: color, cornerRadius: '8px', paddingAll: '10px', alignItems: 'center',
    contents: [
      { type: 'text', text: value, size: 'md', weight: 'bold', color: FLEX_COLORS.WHITE, align: 'center' },
      { type: 'text', text: label, size: 'xxs', color: '#FFFFFF99', align: 'center' },
    ],
  };
}

/** สร้างปุ่มเมนู Full Width @private */
function _menuButton(label, postbackData, color) {
  return {
    type: 'button', style: 'primary', color, height: 'sm', margin: 'xs',
    action: { type: 'postback', label, data: postbackData, displayText: label },
  };
}


// ============================================================
// 📤 SECTION 10: LINE API — sendLineMessage
// ============================================================

/**
 * ส่งข้อความไปยัง LINE User ด้วย Push Message API
 * รองรับ Array ของ Messages และแบ่ง Batch อัตโนมัติ
 * (LINE รองรับสูงสุด 5 Messages ต่อ Request)
 *
 * @param {string}        userId   - LINE User ID
 * @param {Array<Object>} messages - Message Objects
 * @returns {boolean}
 */
function sendLineMessage(userId, messages) {
  try {
    if (!userId || !messages || messages.length === 0) {
      logInfo('LINE', 'ERROR: userId หรือ messages ว่าง');
      return false;
    }

    const token   = getCredential('LINE_CHANNEL_ACCESS_TOKEN');
    const batches = chunkArray(messages, 5);

    for (const batch of batches) {
      const options = {
        method:             'post',
        contentType:        'application/json',
        headers:            { 'Authorization': `Bearer ${token}` },
        payload:            JSON.stringify({ to: userId, messages: batch }),
        muteHttpExceptions: true,
      };

      const result   = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
      const httpCode = result.getResponseCode();

      if (httpCode !== 200) {
        logInfo('LINE', `ERROR HTTP ${httpCode}`, result.getContentText());
        return false;
      }

      if (batches.length > 1) Utilities.sleep(200);
    }

    logInfo('LINE', `ส่งสำเร็จ ${messages.length} msgs → ${userId}`);
    return true;

  } catch (e) {
    logInfo('LINE', 'ERROR sendLineMessage', e.message);
    return false;
  }
}


/**
 * Broadcast ไปยังหลาย User พร้อมกัน
 *
 * @param {Array<string>} userIds
 * @param {Array<Object>} messages
 * @returns {Object} { success, failed }
 */
function sendBroadcastMessage(userIds, messages) {
  let success = 0, failed = 0;
  userIds.forEach(uid => {
    if (sendLineMessage(uid, messages)) success++;
    else failed++;
    Utilities.sleep(100);
  });
  logInfo('LINE', `Broadcast: ${success} สำเร็จ, ${failed} ล้มเหลว`);
  return { success, failed };
}


// ============================================================
// 🧪 SECTION 11: Setup & Testing Functions
// ============================================================

/**
 * ══════════════════════════════════════════════════════════
 * ตั้งค่า Credentials ครั้งแรก
 * รันฟังก์ชันนี้จาก GAS Editor ก่อนใช้งานระบบ
 * ══════════════════════════════════════════════════════════
 *
 * วิธีใช้:
 *   1. เปิด GAS Editor
 *   2. แก้ไขค่าด้านล่างให้ถูกต้อง
 *   3. กดปุ่ม Run (▶)
 *   4. ตรวจสอบด้วย checkCredentials() ว่าครบหรือไม่
 */
function setupCredentials() {
  const props = PropertiesService.getScriptProperties();

  props.setProperties({

    // ── LINE Bot ─────────────────────────────────────────────
    // หาได้จาก: LINE Developers Console > Channel > Messaging API
    'LINE_CHANNEL_ACCESS_TOKEN': 'YOUR_CHANNEL_ACCESS_TOKEN_HERE',
    'LINE_CHANNEL_SECRET':       'YOUR_CHANNEL_SECRET_HERE',

    // ── LINE Bot Basic ID ────────────────────────────────────
    // หาได้จาก: LINE Developers Console > Basic settings > Basic ID
    // รูปแบบ: @xxxxxxxx (มี @ นำหน้า)
    'BOT_BASIC_ID': '@your_bot_basic_id_here',

    // ── Google Sheets ────────────────────────────────────────
    // หาได้จาก: URL ของ Sheets ระหว่าง /d/ และ /edit
    'SPREADSHEET_ID': 'YOUR_SPREADSHEET_ID_HERE',

    // ── Admin LINE IDs ───────────────────────────────────────
    // ใส่เป็น JSON Array String
    // หา ID ได้จาก: ให้ Admin Add Bot แล้วดู Log ใน Executions
    'ADMIN_LINE_IDS': JSON.stringify([
      'U_ADMIN_LINE_ID_1_HERE',
      // 'U_ADMIN_LINE_ID_2_HERE', // เพิ่มได้ถ้ามีหลายคน
    ]),

  });

  logInfo('Setup', '✅ บันทึก Credentials สำเร็จ');
  logInfo('Setup', 'ตรวจสอบด้วย checkCredentials() ได้เลยค่ะ');
}


/**
 * ตรวจสอบว่า Credentials ครบหรือยัง
 * รันหลัง setupCredentials()
 */
function testCheckCredentials() {
  const result = checkCredentials();
  if (result.ok) {
    logInfo('Setup', '✅ Credentials ครบทุก Key พร้อมใช้งาน');
  } else {
    logInfo('Setup', '❌ Credentials ที่ยังขาด', result.missing.join(', '));
  }
}


/**
 * System Health Check ครบทุกส่วน
 * รันก่อน Go-Live ทุกครั้ง
 */
function systemHealthCheck() {
  logInfo('Health', '=== System Health Check ===');
  let allPassed = true;

  // 1. Credentials
  logInfo('Health', '1. ตรวจสอบ Credentials...');
  const credCheck = checkCredentials();
  if (credCheck.ok) {
    logInfo('Health', '  ✅ Credentials ครบ');
  } else {
    logInfo('Health', '  ❌ ขาด', credCheck.missing.join(', '));
    allPassed = false;
  }

  // 2. Google Sheets
  logInfo('Health', '2. ตรวจสอบ Google Sheets...');
  try {
    const ss         = getSpreadsheet();
    const sheetNames = ss.getSheets().map(s => s.getName());
    Object.values(SYSTEM_CONFIG.SHEETS).forEach(name => {
      if (sheetNames.includes(name)) {
        logInfo('Health', `  ✅ "${name}"`);
      } else {
        logInfo('Health', `  ❌ ไม่พบ Sheet "${name}"`);
        allPassed = false;
      }
    });
  } catch (e) {
    logInfo('Health', '  ❌ ไม่สามารถเชื่อมต่อ Sheets', e.message);
    allPassed = false;
  }

  // 3. LINE API
  logInfo('Health', '3. ตรวจสอบ LINE API...');
  try {
    const token  = getCredential('LINE_CHANNEL_ACCESS_TOKEN');
    const result = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
      method: 'get',
      headers: { 'Authorization': `Bearer ${token}` },
      muteHttpExceptions: true,
    });
    if (result.getResponseCode() === 200) {
      const info = JSON.parse(result.getContentText());
      logInfo('Health', `  ✅ Bot: ${info.displayName}`);
    } else {
      logInfo('Health', `  ❌ LINE API HTTP ${result.getResponseCode()}`);
      allPassed = false;
    }
  } catch (e) {
    logInfo('Health', '  ❌ ไม่สามารถเชื่อมต่อ LINE API', e.message);
    allPassed = false;
  }

  // 4. ข้อมูลใน Sheets
  logInfo('Health', '4. ตรวจสอบข้อมูลใน Sheets...');
  try {
    const teachers  = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS);
    const monitors  = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.MONITORS);
    const schedules = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE);
    logInfo('Health', `  ✅ Teachers: ${teachers.length} คน`);
    logInfo('Health', `  ✅ Monitors: ${monitors.length} คน`);
    logInfo('Health', `  ✅ Schedule: ${schedules.length} รายการ`);
  } catch (e) {
    logInfo('Health', '  ❌ ERROR ดึงข้อมูล', e.message);
    allPassed = false;
  }

  // 5. PERIODS
  logInfo('Health', '5. ตรวจสอบ PERIODS...');
  logInfo('Health', `  ✅ PERIODS: ${PERIODS.length} คาบ`);

  // สรุป
  logInfo('Health', '===========================');
  logInfo('Health', allPassed ? '🎉 ระบบพร้อมใช้งานทุกส่วน!' : '⚠️ พบปัญหา กรุณาแก้ไขก่อน Deploy');
  return allPassed;
}


/**
 * ทดสอบ State Cache (ScriptCache)
 */
function testStateCache() {
  const testId = 'U_TEST_CACHE_99999';

  const state = { step: SYSTEM_CONFIG.TEACHER_STATE.WAITING_TOPIC, token: 'TEST_ABC', teachingTopic: '' };
  saveTeacherState(testId, state);

  const got = getTeacherState(testId);
  logInfo('TEST_CACHE', got && got.step === state.step ? '✅ Save/Get สำเร็จ' : '❌ FAIL', got);

  clearTeacherState(testId);
  const gone = getTeacherState(testId);
  logInfo('TEST_CACHE', !gone ? '✅ Clear สำเร็จ' : '❌ FAIL');
}


/**
 * ทดสอบเชื่อมต่อ Google Sheets
 */
function testSheetConnection() {
  try {
    const ss     = getSpreadsheet();
    const sheets = ss.getSheets().map(s => s.getName());
    logInfo('TEST_SHEET', '✅ เชื่อมต่อสำเร็จ', sheets.join(', '));
  } catch (e) {
    logInfo('TEST_SHEET', '❌ ไม่สามารถเชื่อมต่อ', e.message);
  }
}


/**
 * ทดสอบส่ง Push Message ไปยัง User จริง
 * แก้ไข TEST_USER_ID ก่อนรัน
 */
function testSendMessage() {
  const TEST_USER_ID = 'U_TEST_LINE_ID_HERE'; // ← แก้ไข

  const ok = sendLineMessage(TEST_USER_ID, [{
    type: 'text',
    text:
      `✅ ทดสอบระบบสำเร็จค่ะ!\n\n` +
      `🏫 ${SCHOOL_CONFIG.SCHOOL_NAME}\n` +
      `📅 ภาคเรียน ${SCHOOL_CONFIG.SEMESTER_CURRENT}\n` +
      `⏰ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
  }]);
  logInfo('TEST_MSG', ok ? '✅ ส่งสำเร็จ' : '❌ ส่งไม่สำเร็จ');
}


/**
 * ทดสอบดึงข้อมูลรายงาน Admin
 */
function testAdminReports() {
  const summary = getTodayCheckInSummary();
  if (summary) {
    logInfo('TEST_ADMIN', '✅ Summary วันนี้', {
      total:    summary.totalCheckIns,
      onTime:   summary.onTime,
      late:     summary.late,
      teachers: summary.uniqueTeachers,
    });
  } else {
    logInfo('TEST_ADMIN', '❌ ดึง Summary ไม่สำเร็จ');
  }
}


/**
 * Cleanup Token หมดอายุ — ตั้ง Time Trigger รันทุกคืน
 * GAS Editor → Triggers → Add Trigger → cleanupExpiredQRTokens → Day timer
 */
function scheduledCleanup() {
  const count = cleanupExpiredQRTokens();
  logInfo('Cleanup', `✅ Cleanup สำเร็จ: ${count} Tokens`);
}


/**
 * รันทดสอบทั้งหมด
 */
function runAllTests() {
  logInfo('TEST_ALL', '=== Full Test Suite ===');
  const healthy = systemHealthCheck();
  if (!healthy) { logInfo('TEST_ALL', '❌ หยุด — แก้ไข Health Check ก่อน'); return; }
  testSheetConnection();
  testStateCache();
  testAdminReports();
  logInfo('TEST_ALL', '=== ✅ ทดสอบครบทุกส่วน ===');
}


/**
 * ตั้งค่า Time-based Trigger สำหรับ Cleanup QR Token หมดอายุ
 * รันฟังก์ชันนี้ครั้งเดียวหลัง Deploy
 * GAS Editor → Run → setupTimeTrigger
 */
function setupTimeTrigger() {
  // ลบ Trigger เดิมที่ชื่อ cleanupExpiredQRTokens ทั้งหมดก่อน (ป้องกันซ้ำ)
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'scheduledCleanup') {
      ScriptApp.deleteTrigger(trigger);
      logInfo('Trigger', 'ลบ Trigger เดิมออกแล้ว');
    }
  });

  // สร้าง Trigger ใหม่ — รันทุกคืนเวลา 02:00–03:00 น.
  ScriptApp.newTrigger('scheduledCleanup')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  logInfo('Trigger', '✅ ตั้ง Time Trigger สำเร็จ — รันทุกคืน 02:00 น.');
}


/**
 * สร้าง LINE Rich Menu สำหรับ Teacher และ Monitor
 *
 * ⚠️  ต้อง Deploy Web App และตั้งค่า Credentials ก่อน
 * รันฟังก์ชันนี้ครั้งเดียวหลัง Deploy
 * GAS Editor → Run → setupRichMenu
 *
 * Rich Menu นี้จะแสดงสำหรับทุกคนที่ Add Bot
 * (Default Rich Menu — ไม่แยกตาม Role)
 */
function setupRichMenu() {
  const token = getCredential('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) {
    logInfo('RichMenu', '❌ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN');
    return;
  }

  // Step 1: สร้าง Rich Menu Object
  const richMenu = {
    size:       { width: 2500, height: 843 },
    selected:   true,
    name:       'Teacher Check-in Menu',
    chatBarText: 'เมนู',
    areas: [
      // ปุ่มซ้ายบน — สแกน QR / สร้าง QR
      {
        bounds: { x: 0,    y: 0, width: 833, height: 421 },
        action: { type: 'message', text: 'QR' },
      },
      // ปุ่มกลางบน — ตารางวันนี้
      {
        bounds: { x: 833,  y: 0, width: 834, height: 421 },
        action: { type: 'message', text: 'ตาราง' },
      },
      // ปุ่มขวาบน — สถานะ / ประวัติ
      {
        bounds: { x: 1667, y: 0, width: 833, height: 421 },
        action: { type: 'message', text: '/status' },
      },
      // ปุ่มซ้ายล่าง — เมนูหลัก
      {
        bounds: { x: 0,    y: 421, width: 833, height: 422 },
        action: { type: 'message', text: 'เมนู' },
      },
      // ปุ่มกลางล่าง — ประวัติ
      {
        bounds: { x: 833,  y: 421, width: 834, height: 422 },
        action: { type: 'message', text: 'ประวัติ' },
      },
      // ปุ่มขวาล่าง — คู่มือ
      {
        bounds: { x: 1667, y: 421, width: 833, height: 422 },
        action: { type: 'message', text: '/help' },
      },
    ],
  };

  // Step 2: สร้าง Rich Menu ใน LINE
  const createResult = UrlFetchApp.fetch(
    'https://api.line.me/v2/bot/richmenu',
    {
      method:             'post',
      contentType:        'application/json',
      headers:            { 'Authorization': `Bearer ${token}` },
      payload:            JSON.stringify(richMenu),
      muteHttpExceptions: true,
    }
  );

  const createCode = createResult.getResponseCode();
  if (createCode !== 200) {
    logInfo('RichMenu', `❌ สร้างไม่สำเร็จ HTTP ${createCode}`, createResult.getContentText());
    return;
  }

  const richMenuId = JSON.parse(createResult.getContentText()).richMenuId;
  logInfo('RichMenu', `✅ สร้าง Rich Menu สำเร็จ ID: ${richMenuId}`);

  // Step 3: Upload รูปภาพ Rich Menu
  // ⚠️  ต้องอัปโหลดรูปเองด้วยมือใน LINE Official Account Manager
  // หรือใช้ URL รูปที่เตรียมไว้แล้ว uncomment บรรทัดด้านล่าง
  //
  // const imageUrl = 'https://your-image-host.com/richmenu.png';
  // uploadRichMenuImage(richMenuId, imageUrl, token);

  // Step 4: Set เป็น Default Rich Menu
  const setDefaultResult = UrlFetchApp.fetch(
    `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
    {
      method:             'post',
      headers:            { 'Authorization': `Bearer ${token}` },
      muteHttpExceptions: true,
    }
  );

  const setDefaultCode = setDefaultResult.getResponseCode();
  if (setDefaultCode === 200) {
    logInfo('RichMenu', `✅ Set Default Rich Menu สำเร็จ`);
    logInfo('RichMenu', `Rich Menu ID: ${richMenuId}`);
    logInfo('RichMenu', `⚠️  อย่าลืมอัปโหลดรูปใน LINE Official Account Manager`);
  } else {
    logInfo('RichMenu', `❌ Set Default ไม่สำเร็จ HTTP ${setDefaultCode}`, setDefaultResult.getContentText());
  }
}


/**
 * ดู Rich Menu ที่มีอยู่ทั้งหมด
 */
function listRichMenus() {
  const token = getCredential('LINE_CHANNEL_ACCESS_TOKEN');
  const result = UrlFetchApp.fetch(
    'https://api.line.me/v2/bot/richmenu/list',
    {
      method:             'get',
      headers:            { 'Authorization': `Bearer ${token}` },
      muteHttpExceptions: true,
    }
  );
  logInfo('RichMenu', 'Rich Menus ทั้งหมด', result.getContentText());
}


/**
 * ลบ Rich Menu ทั้งหมด (ใช้เมื่อต้องการ Reset)
 */
function deleteAllRichMenus() {
  const token = getCredential('LINE_CHANNEL_ACCESS_TOKEN');
  const listResult = UrlFetchApp.fetch(
    'https://api.line.me/v2/bot/richmenu/list',
    {
      method:             'get',
      headers:            { 'Authorization': `Bearer ${token}` },
      muteHttpExceptions: true,
    }
  );

  const menus = JSON.parse(listResult.getContentText()).richmenus || [];
  menus.forEach(menu => {
    UrlFetchApp.fetch(
      `https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`,
      {
        method:             'delete',
        headers:            { 'Authorization': `Bearer ${token}` },
        muteHttpExceptions: true,
      }
    );
    logInfo('RichMenu', `ลบ ${menu.richMenuId} แล้ว`);
  });

  logInfo('RichMenu', `✅ ลบ ${menus.length} Rich Menus สำเร็จ`);
}
