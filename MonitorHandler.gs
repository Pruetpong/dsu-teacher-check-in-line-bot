// ============================================================
// MonitorHandler.gs — จัดการ Flow ทั้งหมดของหัวหน้าห้อง
//
// Flow หลัก:
//   1. หัวหน้าห้องส่งข้อความ / กด Rich Menu
//      → แสดงตารางสอนวันนี้ของห้องตัวเอง
//   2. หัวหน้าห้องกด "สร้าง QR" ของคาบที่ต้องการ
//      → แสดง Flex Card ยืนยันข้อมูล
//   3. หัวหน้าห้องกด "ยืนยันสร้าง QR"
//      → สร้าง QR Token → ส่ง QR Code Image กลับ
//   4. ครูสแกน QR สำเร็จ
//      → แจ้งหัวหน้าห้องโดยอัตโนมัติ
// ============================================================


// ============================================================
// 🚦 SECTION 1: Entry Point — รับ Event จาก Code.gs
// ============================================================

/**
 * จุดเริ่มต้นของ MonitorHandler
 * Code.gs จะเรียกฟังก์ชันนี้เมื่อระบุได้ว่าผู้ส่งเป็น Monitor
 *
 * @param {Object} event      - LINE Event Object
 * @param {Object} monitorData - ข้อมูล Monitor จาก ClassMonitors_Master
 */
function handleMonitorEvent(event, monitorData) {
  const eventType = event.type;

  try {
    if (eventType === 'message' && event.message.type === 'text') {
      // กรณีส่งข้อความ
      handleMonitorMessage(event, monitorData);

    } else if (eventType === 'postback') {
      // กรณีกดปุ่ม Postback (ปุ่มใน Flex Message)
      handleMonitorPostback(event, monitorData);

    } else {
      // Event ประเภทอื่น เช่น sticker, image → ตอบเมนูหลัก
      sendMonitorMainMenu(event.source.userId, monitorData);
    }

  } catch (e) {
    logInfo('MonitorHandler', 'ERROR handleMonitorEvent', e.message);
    sendLineMessage(event.source.userId, [
      { type: 'text', text: MESSAGES.ERROR_GENERAL },
    ]);
  }
}


// ============================================================
// 💬 SECTION 2: Message Handler (กรณีพิมพ์ข้อความ)
// ============================================================

/**
 * จัดการกรณีหัวหน้าห้องพิมพ์ข้อความ
 * รองรับ Keyword ต่าง ๆ เช่น "QR", "ตาราง", "เมนู"
 *
 * @param {Object} event       - LINE Event
 * @param {Object} monitorData - ข้อมูล Monitor
 */
function handleMonitorMessage(event, monitorData) {
  const userId  = event.source.userId;
  const text    = event.message.text.trim();
  const textLow = text.toLowerCase();

  logInfo('MonitorHandler', `ข้อความจาก Monitor: "${text}"`, monitorData['Student_Name']);

  // --- Keywords ที่รองรับ ---
  // "qr", "สร้าง qr", "สร้างคิวอาร์" → แสดงตารางวันนี้
  if (
    textLow === 'qr'           ||
    textLow === 'สร้าง qr'    ||
    textLow === 'สร้างqr'     ||
    textLow === 'สร้างคิวอาร์' ||
    textLow === 'qr code'
  ) {
    showTodaySchedule(userId, monitorData);
    return;
  }

  // "ตาราง", "ตารางเรียน" → แสดงตารางวันนี้เช่นกัน
  if (
    textLow === 'ตาราง'      ||
    textLow === 'ตารางเรียน' ||
    textLow === 'ตารางสอน'
  ) {
    showTodaySchedule(userId, monitorData);
    return;
  }

  // "เมนู", "menu", "หน้าหลัก" → เมนูหลัก
  if (
    textLow === 'เมนู'    ||
    textLow === 'menu'    ||
    textLow === 'หน้าหลัก'
  ) {
    sendMonitorMainMenu(userId, monitorData);
    return;
  }

  // ข้อความอื่น ๆ → แสดงเมนูหลัก
  sendMonitorMainMenu(userId, monitorData);
}


// ============================================================
// 🔘 SECTION 3: Postback Handler (กรณีกดปุ่ม)
// ============================================================

/**
 * จัดการกรณีหัวหน้าห้องกดปุ่มใน Flex Message
 * Parse Postback Data แล้วส่งไปยัง Action ที่ถูกต้อง
 *
 * @param {Object} event       - LINE Event
 * @param {Object} monitorData - ข้อมูล Monitor
 */
function handleMonitorPostback(event, monitorData) {
  const userId = event.source.userId;

  // แปลง Postback data string เป็น Object
  // รูปแบบ: "action=create_qr&period=1&classroom=ห้อง 1/1&subject=MATH101"
  const params = parsePostbackData(event.postback.data);
  const action = params['action'];

  logInfo('MonitorHandler', `Postback action: ${action}`, params);

  switch (action) {

    // กดปุ่ม "สร้าง QR" จาก flexPeriodList
    case 'create_qr':
      handleCreateQRRequest(userId, monitorData, params);
      break;

    // กดปุ่ม "ยืนยันสร้าง QR" จาก flexQRConfirm
    case 'confirm_qr':
      handleConfirmQR(userId, monitorData, params);
      break;

    // กดปุ่ม "ยกเลิก" จาก flexQRConfirm
    case 'cancel_qr':
      handleCancelQR(userId, monitorData);
      break;

    default:
      logInfo('MonitorHandler', `Unknown action: ${action}`);
      sendMonitorMainMenu(userId, monitorData);
  }
}


// ============================================================
// 📅 SECTION 4: แสดงตารางสอนวันนี้
// ============================================================

/**
 * ดึงตารางสอนวันนี้และส่ง Flex Card ให้หัวหน้าห้อง
 *
 * @param {string} userId      - LINE User ID ของหัวหน้าห้อง
 * @param {Object} monitorData - ข้อมูล Monitor
 */
function showTodaySchedule(userId, monitorData) {
  const classroom = monitorData['Classroom'];

  logInfo('MonitorHandler', `ดึงตาราง ${classroom} วันนี้`);

  // แสดง Loading ก่อน (ใช้เวลาดึงข้อมูล)
  sendLineMessage(userId, [
    {
      type: 'text',
      text: `⏳ กำลังดึงตารางสอนของ ${classroom} วันนี้ค่ะ...`,
    },
  ]);

  // ดึงตารางสอนจาก Google Sheets
  const schedules = getScheduleByClassroomToday(classroom);

  if (schedules.length === 0) {
    // ไม่มีตารางวันนี้
    logInfo('MonitorHandler', `ไม่พบตารางสอนของ ${classroom} วันนี้`);
    sendLineMessage(userId, [flexNoSchedule(classroom)]);
    return;
  }

  // ดึงชื่อครูมาแสดงใน Card ด้วย (เพื่อ UX ที่ดีขึ้น)
  const schedulesWithTeacher = schedules.map(s => {
    const teacher = getTeacherById(s['Teacher_ID']);
    return {
      ...s,
      // Override Teacher_ID ด้วยชื่อครูถ้าหาได้
      Teacher_ID: teacher ? teacher['Teacher_Name'] : s['Teacher_ID'],
    };
  });

  logInfo('MonitorHandler', `พบตารางสอน ${schedules.length} คาบ`);
  sendLineMessage(userId, [flexPeriodList(classroom, schedulesWithTeacher)]);
}


// ============================================================
// 📲 SECTION 5: สร้าง QR Code
// ============================================================

/**
 * ขั้นตอนที่ 1: หัวหน้าห้องกด "สร้าง QR" ของคาบที่ต้องการ
 * → แสดง Flex Card ยืนยันข้อมูลก่อนสร้าง QR จริง
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} monitorData - ข้อมูล Monitor
 * @param {Object} params      - Postback params (period, classroom, subject)
 */
function handleCreateQRRequest(userId, monitorData, params) {
  const periodNumber  = Number(params['period']);
  const classroom     = decodeURIComponent(params['classroom'] || '');
  const subjectCode   = decodeURIComponent(params['subject']   || '');

  logInfo('MonitorHandler', `ขอสร้าง QR คาบ ${periodNumber} ห้อง ${classroom}`);

  // 1. ตรวจสอบว่า classroom ตรงกับห้องของหัวหน้าห้องคนนี้
  if (classroom !== monitorData['Classroom']) {
    logInfo('MonitorHandler', `⚠️ ห้องไม่ตรง: ${classroom} vs ${monitorData['Classroom']}`);
    sendLineMessage(userId, [{
      type: 'text',
      text: '⚠️ ไม่สามารถสร้าง QR ได้ค่ะ\nห้องเรียนไม่ตรงกับข้อมูลของคุณ',
    }]);
    return;
  }

  // 2. ดึงข้อมูลวิชาของคาบนี้
  const subject = getSubjectByClassroomAndPeriod(classroom, periodNumber);
  if (!subject) {
    logInfo('MonitorHandler', `ไม่พบข้อมูลวิชาคาบ ${periodNumber}`);
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ERROR_NO_SCHEDULE,
    }]);
    return;
  }

  // 3. ดึงข้อมูลครูผู้สอน
  const teacher = getTeacherById(subject['Teacher_ID']);

  // 4. ดึงข้อมูลคาบ
  const period = getPeriodByNumber(periodNumber);
  if (!period) {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ERROR_GENERAL,
    }]);
    return;
  }

  // 5. ตรวจสอบว่ามี QR ที่ Active อยู่แล้วสำหรับคาบนี้หรือไม่
  //    (ป้องกันหัวหน้าห้องสร้าง QR ซ้ำโดยไม่ตั้งใจ)
  const existingQR = checkActiveQRForPeriod(classroom, periodNumber);
  if (existingQR) {
    logInfo('MonitorHandler', `มี QR Active อยู่แล้วสำหรับคาบ ${periodNumber}`);
    sendLineMessage(userId, [{
      type: 'text',
      text: `⚠️ มี QR Code ที่ยังใช้งานได้อยู่แล้วสำหรับ ${period.name} ค่ะ\n\nถ้าต้องการสร้างใหม่ กรุณารอให้ QR เดิมหมดอายุก่อน (${SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES} นาที) หรือติดต่อฝ่ายวิชาการค่ะ`,
    }]);
    return;
  }

  // 6. แสดง Flex Card ยืนยัน
  logInfo('MonitorHandler', `แสดง Confirm Card สำหรับคาบ ${periodNumber}`);
  sendLineMessage(userId, [flexQRConfirm(subject, teacher, period)]);
}


/**
 * ขั้นตอนที่ 2: หัวหน้าห้องกด "ยืนยันสร้าง QR"
 * → สร้าง QR Token จริง → ส่ง QR Code Image
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} monitorData - ข้อมูล Monitor
 * @param {Object} params      - Postback params
 */
function handleConfirmQR(userId, monitorData, params) {
  const periodNumber = Number(params['period']);
  const classroom    = decodeURIComponent(params['classroom'] || '');
  const subjectCode  = decodeURIComponent(params['subject']   || '');

  logInfo('MonitorHandler', `ยืนยันสร้าง QR คาบ ${periodNumber}`);

  // แสดงข้อความ Loading
  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.QR_CREATING,
  }]);

  try {
    // 1. ดึงข้อมูลวิชาอีกครั้ง (เพื่อความถูกต้อง)
    const subject = getSubjectByClassroomAndPeriod(classroom, periodNumber);
    if (!subject) {
      sendLineMessage(userId, [{
        type: 'text',
        text: MESSAGES.ERROR_NO_SCHEDULE,
      }]);
      return;
    }

    const teacher  = getTeacherById(subject['Teacher_ID']);
    const period   = getPeriodByNumber(periodNumber);

    // 2. สร้าง QR Token ใน Google Sheets
    const token = createQRSession({
      subjectCode:      subject['Subject_Code'],
      teacherId:        subject['Teacher_ID'],
      teacherName:      teacher ? teacher['Teacher_Name'] : subject['Teacher_ID'],
      classroom:        classroom,
      periodNumber:     periodNumber,
      periodName:       period ? period.name : `คาบที่ ${periodNumber}`,
      createdByLineId:  userId,
      createdByName:    monitorData['Student_Name'],
    });

    logInfo('MonitorHandler', `สร้าง Token สำเร็จ: ${token}`);

    // 3. สร้าง URL สำหรับ QR Code
    //    เมื่อครูสแกน LINE จะเปิด URL นี้ → Bot รับ Event → ดำเนินการต่อ
    const qrUrl = buildQRUrl(token);
    logInfo('MonitorHandler', `QR URL: ${qrUrl}`);

    // 4. สร้าง QR Code Image URL โดยใช้ QR Code API
    //    ใช้ goqr.me API (ฟรี ไม่ต้อง Key)
    const qrImageUrl = buildQRImageUrl(qrUrl);

    // 5. ส่ง QR Code Image + ข้อความอธิบาย
    const periodName = period ? period.name : `คาบที่ ${periodNumber}`;

    sendLineMessage(userId, [
      // ข้อความสรุปก่อน QR
      {
        type: 'text',
        text: MESSAGES.QR_SUCCESS(
          `${periodName} — ${subject['Subject_Name']}`,
          SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES
        ),
      },
      // QR Code Image
      {
        type: 'image',
        originalContentUrl: qrImageUrl,
        previewImageUrl:    qrImageUrl,
      },
      // Quick Reply เพื่อสะดวกสร้างคาบต่อไป
      buildMonitorQuickReply(),
    ]);

    logInfo('MonitorHandler', `ส่ง QR Code สำเร็จสำหรับคาบ ${periodNumber}`);

  } catch (e) {
    logInfo('MonitorHandler', 'ERROR handleConfirmQR', e.message);
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ERROR_GENERAL,
    }]);
  }
}


/**
 * กรณีหัวหน้าห้องกด "ยกเลิก" จาก flexQRConfirm
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} monitorData - ข้อมูล Monitor
 */
function handleCancelQR(userId, monitorData) {
  logInfo('MonitorHandler', `ยกเลิกการสร้าง QR โดย ${monitorData['Student_Name']}`);
  sendLineMessage(userId, [
    {
      type: 'text',
      text: '❌ ยกเลิกการสร้าง QR Code แล้วค่ะ\n\nกดปุ่ม "สร้าง QR คาบเรียน" เพื่อเริ่มใหม่ได้เลยค่ะ',
    },
  ]);
}


// ============================================================
// 🔔 SECTION 6: แจ้งหัวหน้าห้องเมื่อครูเช็คอินแล้ว
// ============================================================

/**
 * ส่งการแจ้งเตือนไปยังหัวหน้าห้องเมื่อครูเช็คอินสำเร็จ
 * ถูกเรียกจาก TeacherHandler หลังบันทึกข้อมูลสำเร็จ
 *
 * @param {string} monitorLineId  - LINE ID ของหัวหน้าห้อง
 * @param {string} teacherName    - ชื่อครูที่เช็คอิน
 * @param {string} subjectName    - ชื่อวิชา
 * @param {string} periodName     - ชื่อคาบ
 * @param {string} topic          - เรื่องที่สอน
 */
function notifyMonitorCheckin(monitorLineId, teacherName, subjectName, periodName, topic) {
  try {
    logInfo('MonitorHandler', `แจ้ง Monitor: ${monitorLineId} ว่าครูเช็คอินแล้ว`);
    sendLineMessage(monitorLineId, [
      flexMonitorCheckinNotify(teacherName, subjectName, periodName, topic),
    ]);
  } catch (e) {
    // ถ้าแจ้งไม่ได้ ไม่ต้อง Error หลัก ให้ Log ไว้แทน
    logInfo('MonitorHandler', 'ERROR notifyMonitorCheckin (non-critical)', e.message);
  }
}


// ============================================================
// 🏠 SECTION 7: เมนูหลักของหัวหน้าห้อง
// ============================================================

/**
 * ส่งเมนูหลักให้หัวหน้าห้อง
 * ใช้ Quick Reply เพื่อความสะดวก
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} monitorData - ข้อมูล Monitor
 */
function sendMonitorMainMenu(userId, monitorData) {
  const classroom   = monitorData['Classroom'];
  const studentName = monitorData['Student_Name'];
  const today       = formatThaiDate(new Date());

  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        `👋 สวัสดีค่ะ ${studentName}!\n` +
        `🏫 หัวหน้าห้อง ${classroom}\n` +
        `📅 ${today}\n\n` +
        `กดปุ่มด้านล่างเพื่อใช้งานระบบค่ะ 👇`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '📲 สร้าง QR คาบเรียน',
              text: 'สร้าง QR',
            },
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '📅 ดูตารางวันนี้',
              text: 'ตาราง',
            },
          },
        ],
      },
    },
  ]);
}


/**
 * สร้าง Quick Reply สำหรับหลังส่ง QR แล้ว
 * ให้หัวหน้าห้องสะดวกสร้าง QR คาบถัดไปได้เลย
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
          action: {
            type: 'message',
            label: '📲 สร้าง QR คาบอื่น',
            text: 'สร้าง QR',
          },
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🏠 กลับเมนูหลัก',
            text: 'เมนู',
          },
        },
      ],
    },
  };
}


// ============================================================
// 🛠️ SECTION 8: Helper Functions
// ============================================================

/**
 * สร้าง URL สำหรับ QR Code
 * เมื่อครูสแกน LINE จะเปิด URL นี้เป็น LINE URL Scheme
 * ซึ่งจะส่ง Message กลับมาที่ Bot พร้อม Token
 *
 * รูปแบบ URL: https://line.me/R/oaMessage/@[BOT_BASIC_ID]/?[token]
 * หรือใช้วิธีส่ง Postback ผ่าน liff.sendMessages()
 *
 * แต่วิธีที่ง่ายที่สุดสำหรับระบบนี้คือ:
 * ใช้ LINE URL Scheme ให้เปิดแชทกับ Bot พร้อมข้อความ Token
 *
 * @param {string} token - QR Token
 * @returns {string} URL สำหรับฝังใน QR Code
 */
function buildQRUrl(token) {
  // URL Scheme ของ LINE: เมื่อสแกนแล้วจะเปิดแชทกับ Bot
  // และส่งข้อความ "CHECKIN:[token]" อัตโนมัติ
  //
  // วิธีที่ 1: ใช้ LINE URL Scheme (ง่ายที่สุด ไม่ต้อง LIFF)
  // รูปแบบ: https://line.me/R/oaMessage/@BOTID/?CHECKIN:TOKEN
  //
  // ⚠️ ต้องเปลี่ยน @your_bot_basic_id เป็น Basic ID ของ Bot จริง
  //    หาได้จาก LINE Developers Console > Basic settings > Basic ID
  const botBasicId = getBotBasicId(); // ดึงจาก Admin_Settings
  const message    = `CHECKIN:${token}`;

  return `https://line.me/R/oaMessage/${botBasicId}/?${encodeURIComponent(message)}`;
}


/**
 * สร้าง URL ของ QR Code Image
 * ใช้ goqr.me API ซึ่งเป็น Free API
 *
 * @param {string} url  - URL ที่จะฝังใน QR
 * @returns {string}    - URL ของรูป QR Code
 */
function buildQRImageUrl(url) {
  // ใช้ QR Code API จาก api.qrserver.com (ฟรี ไม่ต้อง Key)
  // ขนาด 300x300 พิกเซล เหมาะกับการแสดงบนมือถือ
  const size    = '300x300';
  const encoded = encodeURIComponent(url);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encoded}&ecc=M`;
}


/**
 * ดึง Bot Basic ID จาก Admin_Settings Sheet
 * @returns {string} Basic ID ของ Bot เช่น "@abc1234d"
 */
function getBotBasicId() {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.SETTINGS);
    const values  = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === 'BOT_BASIC_ID') {
        return values[i][1];
      }
    }
    // ถ้าไม่พบใน Sheet ให้ใช้ค่า Fallback จาก Config
    return CREDENTIALS.BOT_BASIC_ID || '@your_bot_basic_id';

  } catch (e) {
    logInfo('MonitorHandler', 'ERROR getBotBasicId', e.message);
    return '@your_bot_basic_id';
  }
}


/**
 * ตรวจสอบว่ามี QR Token ที่ Active อยู่แล้วสำหรับคาบนี้หรือไม่
 * ป้องกันการสร้าง QR ซ้ำโดยไม่ตั้งใจ
 *
 * @param {string} classroom    - ชื่อห้อง
 * @param {number} periodNumber - หมายเลขคาบ
 * @returns {boolean} true = มี QR Active อยู่แล้ว
 */
function checkActiveQRForPeriod(classroom, periodNumber) {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];

    const classCol  = headers.indexOf('Classroom');
    const periodCol = headers.indexOf('Period_Number');
    const statusCol = headers.indexOf('Status');
    const expireCol = headers.indexOf('Expires_At');
    const createdCol = headers.indexOf('Created_At');

    // หา QR ที่สร้างวันนี้ + ห้องนี้ + คาบนี้ + Status = Active + ยังไม่หมดอายุ
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i < values.length; i++) {
      const row = values[i];

      // ตรวจสอบทุกเงื่อนไข
      const isClassroom  = row[classCol]  === classroom;
      const isPeriod     = Number(row[periodCol]) === Number(periodNumber);
      const isActive     = row[statusCol] === SYSTEM_CONFIG.QR_STATUS.ACTIVE;
      const isNotExpired = !isQRExpired(row[expireCol]);

      // สร้างวันนี้ไหม
      const createdDate = new Date(row[createdCol]);
      createdDate.setHours(0, 0, 0, 0);
      const isToday = createdDate.getTime() === today.getTime();

      if (isClassroom && isPeriod && isActive && isNotExpired && isToday) {
        return true; // มี QR Active อยู่แล้ว
      }
    }
    return false;

  } catch (e) {
    logInfo('MonitorHandler', 'ERROR checkActiveQRForPeriod', e.message);
    return false; // ถ้า Error ให้ผ่านไปก่อน
  }
}


/**
 * แปลง Postback Data String เป็น Object
 * รูปแบบ Input: "action=create_qr&period=1&classroom=ห้อง 1/1"
 * รูปแบบ Output: { action: "create_qr", period: "1", classroom: "ห้อง 1/1" }
 *
 * @param {string} dataString - Postback data string
 * @returns {Object} Object ของ key-value pairs
 */
function parsePostbackData(dataString) {
  const result = {};
  if (!dataString) return result;

  dataString.split('&').forEach(pair => {
    const [key, ...valueParts] = pair.split('=');
    // ใช้ ...valueParts เพื่อรองรับกรณีที่ value มีเครื่องหมาย = อยู่ด้วย
    result[key] = valueParts.join('=');
  });

  return result;
}


// ============================================================
// 🧪 SECTION 9: Testing Functions
// ============================================================

/**
 * ทดสอบ Flow หัวหน้าห้องทั้งหมด
 * แก้ไข TEST_MONITOR_LINE_ID ก่อนรัน
 */
function testMonitorFlow() {
  const TEST_MONITOR_LINE_ID = 'U_MONITOR_LINE_ID_HERE'; // ← แก้ไขตรงนี้

  // Mock monitor data
  const mockMonitor = {
    Monitor_ID:   'M001',
    LINE_User_ID: TEST_MONITOR_LINE_ID,
    Student_Name: 'ด.ช.ทดสอบ ระบบ',
    Classroom:    'ห้อง 1/1',
    Grade:        'ม.1',
    Status:       'Active',
  };

  // ทดสอบแสดงเมนูหลัก
  logInfo('TEST_MONITOR', '--- ทดสอบเมนูหลัก ---');
  sendMonitorMainMenu(TEST_MONITOR_LINE_ID, mockMonitor);
  Utilities.sleep(2000);

  // ทดสอบแสดงตารางวันนี้
  logInfo('TEST_MONITOR', '--- ทดสอบแสดงตารางวันนี้ ---');
  showTodaySchedule(TEST_MONITOR_LINE_ID, mockMonitor);
  Utilities.sleep(2000);

  logInfo('TEST_MONITOR', '✅ ทดสอบเสร็จสิ้น');
}


/**
 * ทดสอบการสร้าง QR URL
 */
function testBuildQRUrl() {
  const testToken  = generateQRToken();
  const qrUrl      = buildQRUrl(testToken);
  const qrImageUrl = buildQRImageUrl(qrUrl);

  logInfo('TEST_QR', 'Token', testToken);
  logInfo('TEST_QR', 'QR URL', qrUrl);
  logInfo('TEST_QR', 'QR Image URL', qrImageUrl);
}


/**
 * ทดสอบการแจ้งหัวหน้าห้อง
 * แก้ไข TEST_MONITOR_LINE_ID ก่อนรัน
 */
function testNotifyMonitor() {
  const TEST_MONITOR_LINE_ID = 'U_MONITOR_LINE_ID_HERE'; // ← แก้ไขตรงนี้

  notifyMonitorCheckin(
    TEST_MONITOR_LINE_ID,
    'อ.สมชาย ใจดี',
    'คณิตศาสตร์ ม.1/1',
    'คาบที่ 1',
    'อสมการเชิงเส้นตัวแปรเดียว'
  );

  logInfo('TEST_MONITOR', '✅ ทดสอบแจ้งหัวหน้าห้องเสร็จสิ้น');
}