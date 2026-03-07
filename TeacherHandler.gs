// ============================================================
// TeacherHandler.gs — จัดการ Flow ทั้งหมดของครูผู้สอน
//
// Flow หลัก (State Machine):
//
//   [IDLE]
//     │  ครูสแกน QR → ส่งข้อความ "CHECKIN:[token]"
//     ▼
//   [VERIFY_TOKEN]
//     │  ตรวจสอบ Token → แสดงข้อมูลคาบ (flexClassInfo)
//     ▼
//   [WAITING_TOPIC]
//     │  ครูพิมพ์ "เรื่องที่สอน"
//     ▼
//   [WAITING_ASSIGNMENT]
//     │  ครูพิมพ์ "งานมอบหมาย" หรือกด Quick Reply "ไม่มีงาน"
//     ▼
//   [CONFIRM]
//     │  แสดงสรุป → ครูกด "ยืนยัน" หรือ "แก้ไข"
//     ▼
//   [SAVED] → กลับ [IDLE]
//
// State ถูกเก็บใน CacheService (TTL 10 นาที)
// รองรับ 100-200 ครูพร้อมกันได้ เพราะแยก Cache ตาม userId
// ============================================================


// ============================================================
// 🗝️ SECTION 0: State Machine Constants
// ============================================================

// ชื่อ State ทั้งหมดในระบบ
const TEACHER_STATE = {
  IDLE:               'IDLE',
  WAITING_TOPIC:      'WAITING_TOPIC',
  WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
  CONFIRM:            'CONFIRM',
};

// Prefix ของ Cache Key เพื่อไม่ให้ชนกับ Key อื่น
const CACHE_KEY_PREFIX = 'teacher_state_';


// ============================================================
// 🚦 SECTION 1: Entry Point — รับ Event จาก Code.gs
// ============================================================

/**
 * จุดเริ่มต้นของ TeacherHandler
 * Code.gs จะเรียกฟังก์ชันนี้เมื่อระบุได้ว่าผู้ส่งเป็นครู
 *
 * @param {Object} event       - LINE Event Object
 * @param {Object} teacherData - ข้อมูลครูจาก Teachers_Master
 */
function handleTeacherEvent(event, teacherData) {
  const eventType = event.type;

  try {
    if (eventType === 'message' && event.message.type === 'text') {
      handleTeacherMessage(event, teacherData);

    } else if (eventType === 'postback') {
      handleTeacherPostback(event, teacherData);

    } else {
      // Event อื่น เช่น sticker → ตรวจสอบ State ก่อน
      // ถ้ากำลังอยู่กลางการกรอกข้อมูล → แจ้งให้พิมพ์ข้อความ
      const state = getTeacherState(event.source.userId);
      if (state && state.step !== TEACHER_STATE.IDLE) {
        remindTeacherToType(event.source.userId, state);
      } else {
        sendTeacherMainMenu(event.source.userId, teacherData);
      }
    }

  } catch (e) {
    logInfo('TeacherHandler', 'ERROR handleTeacherEvent', e.message);
    // Clear State เมื่อเกิด Error เพื่อไม่ให้ค้างอยู่
    clearTeacherState(event.source.userId);
    sendLineMessage(event.source.userId, [{
      type: 'text',
      text: MESSAGES.ERROR_GENERAL,
    }]);
  }
}


// ============================================================
// 💬 SECTION 2: Message Handler
// ============================================================

/**
 * จัดการทุก Text Message จากครู
 * ตรวจสอบ State ปัจจุบันก่อนตัดสินใจว่าจะทำอะไร
 *
 * @param {Object} event       - LINE Event
 * @param {Object} teacherData - ข้อมูลครู
 */
function handleTeacherMessage(event, teacherData) {
  const userId = event.source.userId;
  const text   = event.message.text.trim();

  logInfo('TeacherHandler',
    `ข้อความจากครู: "${text}"`, teacherData['Teacher_Name']);

  // ---- ตรวจสอบ State ปัจจุบัน ----
  const currentState = getTeacherState(userId);
  const step         = currentState ? currentState.step : TEACHER_STATE.IDLE;

  logInfo('TeacherHandler', `State ปัจจุบัน: ${step}`);

  // ---- ถ้าเป็นข้อความ CHECKIN:[token] → สแกน QR ----
  // ตรวจสอบก่อนเสมอ ไม่ว่าจะอยู่ State ไหน
  if (text.startsWith('CHECKIN:')) {
    const token = text.replace('CHECKIN:', '').trim();
    handleQRScan(userId, teacherData, token);
    return;
  }

  // ---- ถ้าพิมพ์ "ยกเลิก" → รีเซ็ต State ----
  if (text === 'ยกเลิก' || text === 'cancel' || text === 'ออก') {
    handleTeacherCancel(userId, teacherData);
    return;
  }

  // ---- ดำเนินการตาม State ----
  switch (step) {

    case TEACHER_STATE.WAITING_TOPIC:
      // ครูกำลังรอพิมพ์เรื่องที่สอน
      handleTopicInput(userId, teacherData, text, currentState);
      break;

    case TEACHER_STATE.WAITING_ASSIGNMENT:
      // ครูกำลังรอพิมพ์งานมอบหมาย
      handleAssignmentInput(userId, teacherData, text, currentState);
      break;

    case TEACHER_STATE.CONFIRM:
      // อยู่หน้า Confirm แต่พิมพ์ข้อความมาแทนกดปุ่ม
      // → เตือนให้กดปุ่มในการ์ด
      remindTeacherToUseButton(userId);
      break;

    case TEACHER_STATE.IDLE:
    default:
      // ไม่มี State หรือ IDLE → ตรวจสอบ Keyword
      handleTeacherKeyword(userId, teacherData, text);
      break;
  }
}


// ============================================================
// 🔘 SECTION 3: Postback Handler
// ============================================================

/**
 * จัดการกรณีครูกดปุ่มใน Flex Message
 *
 * @param {Object} event       - LINE Event
 * @param {Object} teacherData - ข้อมูลครู
 */
function handleTeacherPostback(event, teacherData) {
  const userId = event.source.userId;
  const params = parsePostbackData(event.postback.data);
  const action = params['action'];

  logInfo('TeacherHandler', `Postback action: ${action}`);

  switch (action) {

    // กดปุ่ม "✅ ยืนยันเช็คอิน" จาก flexCheckinConfirm
    case 'confirm_checkin':
      handleConfirmCheckin(userId, teacherData);
      break;

    // กดปุ่ม "✏️ แก้ไข" จาก flexCheckinConfirm
    case 'edit_checkin':
      handleEditCheckin(userId, teacherData);
      break;

    // กดปุ่ม "📊 ประวัติ" จาก flexTeacherMenu
    case 'teacher_history':
      handleViewHistory(userId, teacherData);
      break;

    // กดปุ่มอื่น ๆ ที่ไม่รู้จัก
    default:
      logInfo('TeacherHandler', `Unknown postback action: ${action}`);
      sendTeacherMainMenu(userId, teacherData);
      break;
  }
}


// ============================================================
// 📲 SECTION 4: QR Scan Handler
// ============================================================

/**
 * จัดการเมื่อครูสแกน QR Code
 * → ตรวจสอบ Token → แสดงข้อมูลคาบ → เปลี่ยน State
 *
 * @param {string} userId      - LINE User ID ของครู
 * @param {Object} teacherData - ข้อมูลครู
 * @param {string} token       - QR Token จาก URL
 */
function handleQRScan(userId, teacherData, token) {
  logInfo('TeacherHandler',
    `ครูสแกน QR Token: ${token}`, teacherData['Teacher_Name']);

  // 1. ตรวจสอบ Token
  const validation = validateQRToken(token);

  if (!validation.valid) {
    // Token ไม่ Valid → แจ้งตามสาเหตุ
    let errorMsg = MESSAGES.QR_INVALID;
    if (validation.status === 'expired')   errorMsg = MESSAGES.QR_EXPIRED;
    if (validation.status === 'used')      errorMsg = MESSAGES.QR_USED;

    logInfo('TeacherHandler',
      `Token ไม่ Valid: ${validation.status}`, token);
    sendLineMessage(userId, [{ type: 'text', text: errorMsg }]);
    return;
  }

  const qrData = validation.data;

  // 2. ตรวจสอบว่าครูคนนี้สอนวิชานี้จริงหรือไม่
  //    (ป้องกันครูคนอื่นเช็คอินแทน)
  if (qrData['Teacher_ID'] !== teacherData['Teacher_ID']) {
    logInfo('TeacherHandler',
      `⚠️ ครูไม่ตรง: QR ของ ${qrData['Teacher_ID']} แต่สแกนโดย ${teacherData['Teacher_ID']}`);
    sendLineMessage(userId, [{
      type: 'text',
      text:
        '⚠️ QR Code นี้ไม่ใช่ของท่านค่ะ\n\n' +
        'กรุณาสแกน QR Code ที่ตรงกับวิชาที่ท่านสอนค่ะ 🙏',
    }]);
    return;
  }

  // 3. ตรวจสอบว่าเช็คอินคาบนี้แล้วหรือยัง
  if (isAlreadyCheckedIn(teacherData['Teacher_ID'],
      Number(qrData['Period_Number']))) {
    logInfo('TeacherHandler',
      `ครูเช็คอินคาบ ${qrData['Period_Number']} แล้ว`);
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ERROR_ALREADY_CHECKIN,
    }]);
    return;
  }

  // 4. Token ถูกต้อง → แสดงข้อมูลคาบ
  logInfo('TeacherHandler', `Token Valid — แสดงข้อมูลคาบ`);
  sendLineMessage(userId, [flexClassInfo(qrData, teacherData)]);

  // 5. บันทึก State = WAITING_TOPIC พร้อมข้อมูล QR
  //    เพื่อใช้ในขั้นตอนถัดไป
  saveTeacherState(userId, {
    step:      TEACHER_STATE.WAITING_TOPIC,
    token:     token,
    qrData:    qrData,
    // ข้อมูลที่จะกรอกเพิ่ม (ว่างก่อน)
    teachingTopic: '',
    assignment:    '',
  });

  // 6. ถามเรื่องที่สอน (รอครูพิมพ์ตอบกลับ)
  Utilities.sleep(500); // รอครึ่งวินาทีให้ Card โหลดก่อน

  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.ASK_TOPIC,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '❌ ยกเลิก',
            text: 'ยกเลิก',
          },
        },
      ],
    },
  }]);
}


// ============================================================
// ✏️ SECTION 5: Input Handlers (รับข้อมูลจากครู)
// ============================================================

/**
 * รับข้อมูล "เรื่องที่สอน" จากครู
 * State: WAITING_TOPIC → WAITING_ASSIGNMENT
 *
 * @param {string} userId       - LINE User ID
 * @param {Object} teacherData  - ข้อมูลครู
 * @param {string} text         - ข้อความที่ครูพิมพ์
 * @param {Object} currentState - State ปัจจุบัน
 */
function handleTopicInput(userId, teacherData, text, currentState) {
  logInfo('TeacherHandler',
    `รับ Topic จากครู: "${text}"`);

  // ตรวจสอบว่ากรอกข้อมูลมาหรือไม่
  if (!text || text.length < 2) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        '⚠️ กรุณาระบุเรื่องที่สอนให้ชัดเจนกว่านี้ค่ะ\n' +
        '(อย่างน้อย 2 ตัวอักษร)\n\n' +
        'ตัวอย่าง: อสมการเชิงเส้น, การอ่านจับใจความ',
    }]);
    return;
  }

  // บันทึก Topic และเปลี่ยน State → WAITING_ASSIGNMENT
  const updatedState = {
    ...currentState,
    step:          TEACHER_STATE.WAITING_ASSIGNMENT,
    teachingTopic: text,
  };
  saveTeacherState(userId, updatedState);

  // ถามงานมอบหมาย พร้อม Quick Reply "ไม่มีงาน"
  sendLineMessage(userId, [{
    type: 'text',
    text: MESSAGES.ASK_ASSIGNMENT,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '📭 ไม่มีงานมอบหมาย',
            text: 'ไม่มีงานมอบหมาย',
          },
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '❌ ยกเลิก',
            text: 'ยกเลิก',
          },
        },
      ],
    },
  }]);
}


/**
 * รับข้อมูล "งานมอบหมาย" จากครู
 * State: WAITING_ASSIGNMENT → CONFIRM
 *
 * @param {string} userId       - LINE User ID
 * @param {Object} teacherData  - ข้อมูลครู
 * @param {string} text         - ข้อความที่ครูพิมพ์
 * @param {Object} currentState - State ปัจจุบัน
 */
function handleAssignmentInput(userId, teacherData, text, currentState) {
  logInfo('TeacherHandler',
    `รับ Assignment จากครู: "${text}"`);

  // ถ้ากด "ไม่มีงานมอบหมาย" → ใส่ค่า null
  const isNoAssignment =
    text === 'ไม่มีงานมอบหมาย' ||
    text === 'ไม่มีงาน'         ||
    text === 'ไม่มี'            ||
    text === '-';

  const assignment = isNoAssignment ? '' : text;

  // ดึงข้อมูลครบถ้วนจาก QR Data
  const qrData = currentState.qrData;
  const period = getPeriodByNumber(Number(qrData['Period_Number']));

  // เตรียมข้อมูลสรุปสำหรับแสดง Confirm Card
  const checkinData = {
    teacherName:   teacherData['Teacher_Name'],
    teacherId:     teacherData['Teacher_ID'],
    subjectCode:   qrData['Subject_Code'],
    subjectName:   qrData['Subject_Name']   ||
                   qrData['Subject_Code'],
    classroom:     qrData['Classroom'],
    periodNumber:  Number(qrData['Period_Number']),
    periodName:    qrData['Period_Name']    ||
                   `คาบที่ ${qrData['Period_Number']}`,
    timeStart:     period ? period.start : '-',
    timeEnd:       period ? period.end   : '-',
    day:           getTodayDayName(),
    teachingTopic: currentState.teachingTopic,
    assignment:    assignment,
    token:         currentState.token,
  };

  // บันทึก State = CONFIRM พร้อมข้อมูลครบถ้วน
  saveTeacherState(userId, {
    ...currentState,
    step:       TEACHER_STATE.CONFIRM,
    assignment: assignment,
    checkinData: checkinData,
  });

  // แสดง Flex Card สรุปข้อมูลให้ยืนยัน
  sendLineMessage(userId, [flexCheckinConfirm(checkinData)]);
}


// ============================================================
// ✅ SECTION 6: Confirm & Save
// ============================================================

/**
 * ครูกด "ยืนยันเช็คอิน" → บันทึกข้อมูลลง Google Sheets
 * State: CONFIRM → IDLE
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} teacherData - ข้อมูลครู
 */
function handleConfirmCheckin(userId, teacherData) {
  logInfo('TeacherHandler',
    `ยืนยันเช็คอินโดย ${teacherData['Teacher_Name']}`);

  // ดึง State ปัจจุบัน
  const currentState = getTeacherState(userId);

  if (!currentState || currentState.step !== TEACHER_STATE.CONFIRM) {
    logInfo('TeacherHandler', 'ERROR: State ไม่ถูกต้องสำหรับ confirm_checkin');
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.SESSION_TIMEOUT,
    }]);
    clearTeacherState(userId);
    return;
  }

  const checkinData = currentState.checkinData;
  if (!checkinData) {
    logInfo('TeacherHandler', 'ERROR: ไม่พบ checkinData ใน State');
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    clearTeacherState(userId);
    return;
  }

  try {
    // 1. บันทึกการเช็คอินลง Google Sheets
    const success = saveCheckIn({
      teacherId:      checkinData.teacherId,
      teacherName:    checkinData.teacherName,
      subjectCode:    checkinData.subjectCode,
      subjectName:    checkinData.subjectName,
      classroom:      checkinData.classroom,
      periodNumber:   checkinData.periodNumber,
      periodName:     checkinData.periodName,
      timeStart:      checkinData.timeStart,
      timeEnd:        checkinData.timeEnd,
      day:            checkinData.day,
      teachingTopic:  checkinData.teachingTopic,
      assignment:     checkinData.assignment,
      qrToken:        checkinData.token,
    });

    if (!success) {
      throw new Error('saveCheckIn คืนค่า false');
    }

    // 2. Mark QR Token ว่าใช้แล้ว
    markQRTokenAsUsed(checkinData.token, userId);

    // 3. คำนวณ Status (ตรงเวลา/สาย)
    const period = getPeriodByNumber(checkinData.periodNumber);
    let   status = SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME;
    if (period) {
      const [sh, sm] = period.start.split(':').map(Number);
      const graceEnd = new Date();
      graceEnd.setHours(sh, sm + SYSTEM_CONFIG.CHECKIN_GRACE_MINUTES, 0);
      if (new Date() > graceEnd) {
        status = SYSTEM_CONFIG.CHECKIN_STATUS.LATE;
      }
    }

    // 4. แสดงผลสำเร็จให้ครู
    const successData = { ...checkinData, status };
    sendLineMessage(userId, [flexCheckinSuccess(successData)]);
    logInfo('TeacherHandler', `✅ บันทึกเช็คอินสำเร็จ: ${checkinData.subjectName}`);

    // 5. แจ้งหัวหน้าห้อง (Non-blocking)
    notifyMonitorAfterCheckin(checkinData, currentState.qrData);

    // 6. แจ้ง Admin ฝ่ายวิชาการ
    notifyAdminAfterCheckin(checkinData, status);

    // 7. Clear State → กลับ IDLE
    clearTeacherState(userId);

  } catch (e) {
    logInfo('TeacherHandler', 'ERROR handleConfirmCheckin', e.message);
    sendLineMessage(userId, [{ type: 'text', text: MESSAGES.ERROR_GENERAL }]);
    clearTeacherState(userId);
  }
}


/**
 * ครูกด "แก้ไข" → กลับไปกรอกเรื่องที่สอนใหม่
 * State: CONFIRM → WAITING_TOPIC
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} teacherData - ข้อมูลครู
 */
function handleEditCheckin(userId, teacherData) {
  logInfo('TeacherHandler',
    `ครูขอแก้ไขข้อมูล: ${teacherData['Teacher_Name']}`);

  const currentState = getTeacherState(userId);
  if (!currentState) {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.SESSION_TIMEOUT,
    }]);
    return;
  }

  // รีเซ็ตกลับไปถามเรื่องที่สอนใหม่
  saveTeacherState(userId, {
    ...currentState,
    step:          TEACHER_STATE.WAITING_TOPIC,
    teachingTopic: '', // ล้างค่าเดิม
    assignment:    '',
    checkinData:   null,
  });

  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        '✏️ แก้ไขข้อมูลได้เลยค่ะ\n\n' +
        MESSAGES.ASK_TOPIC,
      quickReply: {
        items: [{
          type: 'action',
          action: {
            type: 'message',
            label: '❌ ยกเลิก',
            text: 'ยกเลิก',
          },
        }],
      },
    },
  ]);
}


// ============================================================
// 🔔 SECTION 7: Notifications หลังเช็คอินสำเร็จ
// ============================================================

/**
 * แจ้งหัวหน้าห้องหลังครูเช็คอินสำเร็จ
 * ดึง LINE ID ของหัวหน้าห้องจาก ClassMonitors_Master
 *
 * @param {Object} checkinData - ข้อมูลการเช็คอิน
 * @param {Object} qrData      - ข้อมูล QR Session
 */
function notifyMonitorAfterCheckin(checkinData, qrData) {
  try {
    // ดึง LINE ID ของหัวหน้าห้องที่สร้าง QR นี้
    const monitorLineId = qrData['Created_By_LineID'];
    if (!monitorLineId) {
      logInfo('TeacherHandler',
        'ไม่พบ Monitor LINE ID ใน QR Data — ข้ามการแจ้ง Monitor');
      return;
    }

    // เรียก MonitorHandler เพื่อส่งแจ้งเตือน
    notifyMonitorCheckin(
      monitorLineId,
      checkinData.teacherName,
      checkinData.subjectName,
      checkinData.periodName,
      checkinData.teachingTopic
    );

    logInfo('TeacherHandler',
      `แจ้ง Monitor ${monitorLineId} สำเร็จ`);

  } catch (e) {
    // Non-critical Error — Log แล้วผ่านไป
    logInfo('TeacherHandler',
      'ERROR notifyMonitorAfterCheckin (non-critical)', e.message);
  }
}


/**
 * แจ้ง Admin ฝ่ายวิชาการหลังครูเช็คอินสำเร็จ
 * (แบบ Real-time ทุกครั้งที่มีการเช็คอิน)
 *
 * @param {Object} checkinData - ข้อมูลการเช็คอิน
 * @param {string} status      - สถานะ (ตรงเวลา/สาย)
 */
function notifyAdminAfterCheckin(checkinData, status) {
  try {
    const statusIcon  = status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
      ? '🟢' : '🟡';
    const statusLabel = status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
      ? 'ตรงเวลา' : 'สาย';
    const timeNow = new Date().toLocaleTimeString('th-TH', {
      hour:   '2-digit',
      minute: '2-digit',
    });

    const adminMsg =
      `${statusIcon} เช็คอินใหม่ — ${statusLabel}\n` +
      `👩‍🏫 ${checkinData.teacherName}\n`             +
      `📚 ${checkinData.subjectName}\n`               +
      `🏫 ${checkinData.classroom}\n`                 +
      `🕐 ${checkinData.periodName} (${timeNow} น.)\n` +
      `📝 ${checkinData.teachingTopic}`;

    // ส่งไปยัง Admin ทุกคนใน CREDENTIALS.ADMIN_LINE_IDS
    CREDENTIALS.ADMIN_LINE_IDS.forEach(adminId => {
      sendLineMessage(adminId, [{
        type: 'text',
        text: adminMsg,
      }]);
    });

    logInfo('TeacherHandler',
      `แจ้ง Admin สำเร็จ (${CREDENTIALS.ADMIN_LINE_IDS.length} คน)`);

  } catch (e) {
    logInfo('TeacherHandler',
      'ERROR notifyAdminAfterCheckin (non-critical)', e.message);
  }
}


// ============================================================
// 📊 SECTION 8: Teacher History
// ============================================================

/**
 * แสดงประวัติการเช็คอินของครู
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} teacherData - ข้อมูลครู
 */
function handleViewHistory(userId, teacherData) {
  logInfo('TeacherHandler',
    `ดูประวัติการเช็คอิน: ${teacherData['Teacher_Name']}`);

  sendLineMessage(userId, [{
    type: 'text',
    text: '⏳ กำลังดึงประวัติการเช็คอินค่ะ...',
  }]);

  const history = getTeacherCheckInHistory(
    teacherData['Teacher_ID'], 10
  );

  sendLineMessage(userId, [
    flexTeacherHistory(teacherData['Teacher_Name'], history),
  ]);
}


// ============================================================
// 🏠 SECTION 9: เมนูหลักและ Helpers สำหรับครู
// ============================================================

/**
 * ส่งเมนูหลักให้ครู
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} teacherData - ข้อมูลครู
 */
function sendTeacherMainMenu(userId, teacherData) {
  sendLineMessage(userId, [
    flexTeacherMenu(teacherData['Teacher_Name']),
  ]);
}


/**
 * จัดการ Keyword ต่าง ๆ เมื่อครูอยู่ใน State IDLE
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} teacherData - ข้อมูลครู
 * @param {string} text        - ข้อความที่พิมพ์
 */
function handleTeacherKeyword(userId, teacherData, text) {
  const textLow = text.toLowerCase();

  // "เมนู", "menu", "หน้าหลัก"
  if (
    textLow === 'เมนู'     ||
    textLow === 'menu'     ||
    textLow === 'หน้าหลัก' ||
    textLow === 'help'
  ) {
    sendTeacherMainMenu(userId, teacherData);
    return;
  }

  // "ประวัติ", "history"
  if (
    textLow === 'ประวัติ'        ||
    textLow === 'history'        ||
    textLow === 'ประวัติการสอน'
  ) {
    handleViewHistory(userId, teacherData);
    return;
  }

  // ข้อความอื่น ๆ → แสดงเมนูหลัก พร้อมแจ้งวิธีใช้
  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        '💡 วิธีใช้งานระบบเช็คอินค่ะ\n\n' +
        '📲 สแกน QR Code จากหัวหน้าห้อง\n' +
        '   เพื่อเริ่มกระบวนการเช็คอินค่ะ\n\n' +
        'หรือกดปุ่มด้านล่างเพื่อดูประวัติการสอนค่ะ 👇',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '📊 ประวัติการเช็คอิน',
              data: 'action=teacher_history',
              displayText: 'ดูประวัติการเช็คอินค่ะ',
            },
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🏠 เมนูหลัก',
              text: 'เมนู',
            },
          },
        ],
      },
    },
  ]);
}


/**
 * ครูกด "ยกเลิก" ระหว่างกรอกข้อมูล
 * → Clear State → กลับ IDLE
 *
 * @param {string} userId      - LINE User ID
 * @param {Object} teacherData - ข้อมูลครู
 */
function handleTeacherCancel(userId, teacherData) {
  logInfo('TeacherHandler',
    `ครูยกเลิก: ${teacherData['Teacher_Name']}`);
  clearTeacherState(userId);
  sendLineMessage(userId, [
    {
      type: 'text',
      text:
        '❌ ยกเลิกการเช็คอินแล้วค่ะ\n\n' +
        'สแกน QR Code ใหม่เมื่อพร้อมได้เลยค่ะ 🙏',
    },
  ]);
}


/**
 * เตือนครูให้กรอกข้อมูลเป็นข้อความ
 * (กรณีส่ง Sticker หรือ Image มาแทน)
 *
 * @param {string} userId - LINE User ID
 * @param {Object} state  - State ปัจจุบัน
 */
function remindTeacherToType(userId, state) {
  let reminderText = '';

  if (state.step === TEACHER_STATE.WAITING_TOPIC) {
    reminderText =
      '📝 กรุณาพิมพ์ข้อความ "เรื่องที่สอน"\n' +
      'ในคาบนี้เป็นข้อความค่ะ 🙏';
  } else if (state.step === TEACHER_STATE.WAITING_ASSIGNMENT) {
    reminderText =
      '📋 กรุณาพิมพ์ข้อความ "งานมอบหมาย"\n' +
      'หรือกดปุ่ม "ไม่มีงานมอบหมาย" ค่ะ 🙏';
  }

  if (reminderText) {
    sendLineMessage(userId, [{ type: 'text', text: reminderText }]);
  }
}


/**
 * เตือนครูให้กดปุ่มในการ์ด Confirm
 * (กรณีพิมพ์ข้อความมาแทนกดปุ่ม)
 *
 * @param {string} userId - LINE User ID
 */
function remindTeacherToUseButton(userId) {
  sendLineMessage(userId, [{
    type: 'text',
    text:
      '👆 กรุณากดปุ่ม "ยืนยันเช็คอิน" หรือ "แก้ไข"\n' +
      'ในการ์ดด้านบนค่ะ 🙏',
  }]);
}


// ============================================================
// 💾 SECTION 10: State Management (CacheService)
// ============================================================

/**
 * บันทึก State ของครูลงใน Cache
 * ใช้ UserCache เพื่อแยก State ของแต่ละ User อย่างชัดเจน
 * รองรับ 100-200 ครูพร้อมกัน เพราะแยก Key ตาม userId
 *
 * @param {string} userId - LINE User ID
 * @param {Object} state  - ข้อมูล State ที่จะบันทึก
 */
function saveTeacherState(userId, state) {
  try {
    const cache    = CacheService.getUserCache();
    const cacheKey = CACHE_KEY_PREFIX + userId;
    const ttl      = SYSTEM_CONFIG.STATE_CACHE_EXPIRE_SECONDS;

    // แปลง Object เป็น JSON String ก่อนบันทึก
    cache.put(cacheKey, JSON.stringify(state), ttl);

    logInfo('TeacherHandler',
      `บันทึก State: ${state.step}`, userId);

  } catch (e) {
    logInfo('TeacherHandler', 'ERROR saveTeacherState', e.message);
    // ถ้า Cache ล้มเหลว ใช้ ScriptCache แทน
    try {
      const scriptCache = CacheService.getScriptCache();
      const cacheKey    = CACHE_KEY_PREFIX + userId;
      scriptCache.put(
        cacheKey,
        JSON.stringify(state),
        SYSTEM_CONFIG.STATE_CACHE_EXPIRE_SECONDS
      );
    } catch (e2) {
      logInfo('TeacherHandler', 'ERROR saveTeacherState (fallback)', e2.message);
    }
  }
}


/**
 * ดึง State ปัจจุบันของครูจาก Cache
 *
 * @param {string} userId - LINE User ID
 * @returns {Object|null} State Object หรือ null ถ้าไม่มี/หมดอายุ
 */
function getTeacherState(userId) {
  try {
    const cache    = CacheService.getUserCache();
    const cacheKey = CACHE_KEY_PREFIX + userId;
    const cached   = cache.get(cacheKey);

    if (!cached) {
      // ลอง ScriptCache เป็น Fallback
      const scriptCache  = CacheService.getScriptCache();
      const scriptCached = scriptCache.get(cacheKey);
      if (!scriptCached) return null;
      return JSON.parse(scriptCached);
    }

    return JSON.parse(cached);

  } catch (e) {
    logInfo('TeacherHandler', 'ERROR getTeacherState', e.message);
    return null;
  }
}


/**
 * ลบ State ของครูออกจาก Cache (กลับ IDLE)
 *
 * @param {string} userId - LINE User ID
 */
function clearTeacherState(userId) {
  try {
    const cacheKey = CACHE_KEY_PREFIX + userId;
    CacheService.getUserCache().remove(cacheKey);
    CacheService.getScriptCache().remove(cacheKey);
    logInfo('TeacherHandler', `Clear State สำเร็จ`, userId);
  } catch (e) {
    logInfo('TeacherHandler', 'ERROR clearTeacherState', e.message);
  }
}


// ============================================================
// 🧪 SECTION 11: Testing Functions
// ============================================================

/**
 * ทดสอบ State Machine ทั้งหมด
 * แก้ไข TEST_TEACHER_LINE_ID และ TEST_QR_TOKEN ก่อนรัน
 */
function testTeacherStateMachine() {
  const TEST_TEACHER_LINE_ID = 'U_TEACHER_LINE_ID_HERE'; // ← แก้ไข
  const TEST_QR_TOKEN        = 'TOKEN_FROM_SHEET_HERE';  // ← แก้ไข

  logInfo('TEST_TEACHER', '--- ทดสอบ State Machine ---');

  // Mock teacher
  const mockTeacher = {
    Teacher_ID:   'T001',
    LINE_User_ID: TEST_TEACHER_LINE_ID,
    Teacher_Name: 'อ.สมชาย ใจดี',
    Department:   'คณิตศาสตร์',
    Status:       'Active',
    Role:         'Teacher',
  };

  // Step 1: ทดสอบ QR Scan
  logInfo('TEST_TEACHER', 'Step 1: ทดสอบสแกน QR');
  const mockEvent1 = {
    type:    'message',
    source:  { userId: TEST_TEACHER_LINE_ID },
    message: {
      type: 'text',
      text: `CHECKIN:${TEST_QR_TOKEN}`,
    },
  };
  handleTeacherEvent(mockEvent1, mockTeacher);
  Utilities.sleep(2000);

  // ตรวจสอบ State หลัง QR Scan
  const stateAfterScan = getTeacherState(TEST_TEACHER_LINE_ID);
  logInfo('TEST_TEACHER',
    'State หลัง QR Scan',
    stateAfterScan ? stateAfterScan.step : 'null');

  logInfo('TEST_TEACHER', '✅ ทดสอบ State Machine เสร็จสิ้น');
  logInfo('TEST_TEACHER',
    'ต่อไป: ส่งข้อความ "เรื่องที่สอน" จากมือถือเพื่อทดสอบ Step 2');
}


/**
 * ทดสอบการบันทึก/ดึง State จาก Cache
 */
function testStateCache() {
  const testUserId = 'U_TEST_CACHE_12345';

  // ทดสอบ Save
  const testState = {
    step:          TEACHER_STATE.WAITING_TOPIC,
    token:         'TEST_TOKEN_ABC',
    teachingTopic: '',
    assignment:    '',
  };
  saveTeacherState(testUserId, testState);
  logInfo('TEST_CACHE', '✅ saveTeacherState สำเร็จ');

  // ทดสอบ Get
  const retrieved = getTeacherState(testUserId);
  if (retrieved && retrieved.step === TEACHER_STATE.WAITING_TOPIC) {
    logInfo('TEST_CACHE', '✅ getTeacherState สำเร็จ', retrieved.step);
  } else {
    logInfo('TEST_CACHE', '❌ getTeacherState ไม่พบข้อมูล');
  }

  // ทดสอบ Clear
  clearTeacherState(testUserId);
  const afterClear = getTeacherState(testUserId);
  if (!afterClear) {
    logInfo('TEST_CACHE', '✅ clearTeacherState สำเร็จ');
  } else {
    logInfo('TEST_CACHE', '❌ clearTeacherState ไม่สำเร็จ');
  }
}


/**
 * ทดสอบ Flow แบบ End-to-End
 * จำลองการเช็คอินครบทุกขั้นตอนจาก GAS Editor
 */
function testFullCheckinFlow() {
  const TEST_USER_ID = 'U_TEACHER_LINE_ID_HERE'; // ← แก้ไข

  logInfo('TEST_FULL', '=== ทดสอบ Full Check-in Flow ===');

  const mockTeacher = {
    Teacher_ID:   'T001',
    Teacher_Name: 'อ.ทดสอบ ระบบ',
    Department:   'ทดสอบ',
    Status:       'Active',
  };

  // Mock QR Data (ไม่ต้องสแกน QR จริง)
  const mockQrData = {
    Token:          'MOCK_TOKEN_001',
    Subject_Code:   'MATH101',
    Subject_Name:   'คณิตศาสตร์ ม.1/1',
    Teacher_ID:     'T001',
    Teacher_Name:   'อ.ทดสอบ ระบบ',
    Classroom:      'ห้อง 1/1',
    Period_Number:  '1',
    Period_Name:    'คาบที่ 1',
    Created_By_LineID: TEST_USER_ID,
  };

  // จำลอง State หลังสแกน QR
  const period = getPeriodByNumber(1);
  saveTeacherState(TEST_USER_ID, {
    step:          TEACHER_STATE.WAITING_TOPIC,
    token:         'MOCK_TOKEN_001',
    qrData:        mockQrData,
    teachingTopic: '',
    assignment:    '',
  });

  // แสดง Class Info Card
  sendLineMessage(TEST_USER_ID, [
    flexClassInfo(mockQrData, mockTeacher),
  ]);
  Utilities.sleep(1000);

  // ถามเรื่องที่สอน
  sendLineMessage(TEST_USER_ID, [{
    type: 'text',
    text: MESSAGES.ASK_TOPIC,
  }]);

  logInfo('TEST_FULL',
    '✅ ตั้งค่า State เสร็จแล้ว',
    'กรุณาพิมพ์เรื่องที่สอนจากมือถือเพื่อทดสอบต่อ');
}