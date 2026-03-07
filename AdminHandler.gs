// ============================================================
// AdminHandler.gs — จัดการ Flow ทั้งหมดของ Admin ฝ่ายวิชาการ
//
// Flow หลัก:
//   Admin ส่งข้อความ / กด Rich Menu
//   → เมนูหลัก Admin
//   → เลือกดูรายงาน
//      ├─ สรุปวันนี้        (จำนวน เช็คอิน/สาย/ตรงเวลา)
//      ├─ รายละเอียดวันนี้  (แยกตามคาบ)
//      ├─ รายงานรายสัปดาห์  (สรุป 7 วันย้อนหลัง)
//      └─ Export รายงาน     (ส่งลิงก์ Google Sheets)
//
// Admin ไม่ต้องมี State Machine เพราะเป็นการ Pull ข้อมูล
// ไม่มีการกรอกข้อมูลหลายขั้นตอน
// ============================================================


// ============================================================
// 🚦 SECTION 1: Entry Point — รับ Event จาก Code.gs
// ============================================================

/**
 * จุดเริ่มต้นของ AdminHandler
 * Code.gs จะเรียกฟังก์ชันนี้เมื่อระบุได้ว่าผู้ส่งเป็น Admin
 *
 * @param {Object} event    - LINE Event Object
 * @param {Object} adminData - ข้อมูล Admin (จาก CREDENTIALS)
 */
function handleAdminEvent(event, adminData) {
  const eventType = event.type;

  try {
    if (eventType === 'message' && event.message.type === 'text') {
      handleAdminMessage(event, adminData);

    } else if (eventType === 'postback') {
      handleAdminPostback(event, adminData);

    } else {
      // Event อื่น → แสดงเมนูหลัก
      sendAdminMainMenu(event.source.userId);
    }

  } catch (e) {
    logInfo('AdminHandler', 'ERROR handleAdminEvent', e.message);
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
 * จัดการ Text Message จาก Admin
 * รองรับ Keyword หลักทั้งหมด
 *
 * @param {Object} event    - LINE Event
 * @param {Object} adminData - ข้อมูล Admin
 */
function handleAdminMessage(event, adminData) {
  const userId  = event.source.userId;
  const text    = event.message.text.trim();
  const textLow = text.toLowerCase();

  logInfo('AdminHandler', `Admin Message: "${text}"`);

  // --- Keyword Matching ---

  // เมนูหลัก
  if (
    textLow === 'เมนู'     ||
    textLow === 'menu'     ||
    textLow === 'หน้าหลัก' ||
    textLow === 'admin'
  ) {
    sendAdminMainMenu(userId);
    return;
  }

  // สรุปวันนี้
  if (
    textLow === 'สรุป'       ||
    textLow === 'วันนี้'     ||
    textLow === 'สรุปวันนี้' ||
    textLow === 'today'
  ) {
    handleTodaySummary(userId);
    return;
  }

  // รายละเอียดวันนี้
  if (
    textLow === 'รายละเอียด' ||
    textLow === 'detail'     ||
    textLow === 'รายการ'
  ) {
    handleDetailReport(userId);
    return;
  }

  // รายงานรายสัปดาห์
  if (
    textLow === 'สัปดาห์'   ||
    textLow === 'weekly'     ||
    textLow === 'รายสัปดาห์'
  ) {
    handleWeeklyReport(userId);
    return;
  }

  // Export
  if (
    textLow === 'export'  ||
    textLow === 'ส่งออก'  ||
    textLow === 'ลิงก์'
  ) {
    handleExportReport(userId);
    return;
  }

  // ไม่ตรง Keyword → แสดงเมนูหลัก
  sendAdminMainMenu(userId);
}


// ============================================================
// 🔘 SECTION 3: Postback Handler
// ============================================================

/**
 * จัดการกรณี Admin กดปุ่มใน Flex Message
 *
 * @param {Object} event    - LINE Event
 * @param {Object} adminData - ข้อมูล Admin
 */
function handleAdminPostback(event, adminData) {
  const userId = event.source.userId;
  const params = parsePostbackData(event.postback.data);
  const action = params['action'];

  logInfo('AdminHandler', `Admin Postback: ${action}`);

  switch (action) {

    case 'admin_today_summary':
      handleTodaySummary(userId);
      break;

    case 'admin_detail_report':
      handleDetailReport(userId);
      break;

    case 'admin_weekly_report':
      handleWeeklyReport(userId);
      break;

    case 'admin_export':
      handleExportReport(userId);
      break;

    // กดปุ่ม "ดูรายละเอียดครู" จาก Summary Card
    case 'admin_teacher_detail':
      handleTeacherDetail(userId, params);
      break;

    // กดปุ่ม "ดูตามคาบ" เลือกคาบที่ต้องการ
    case 'admin_period_detail':
      handlePeriodDetail(userId, params);
      break;

    default:
      logInfo('AdminHandler', `Unknown action: ${action}`);
      sendAdminMainMenu(userId);
      break;
  }
}


// ============================================================
// 📊 SECTION 4: รายงานสรุปวันนี้
// ============================================================

/**
 * แสดงสรุปการเช็คอินประจำวันนี้
 * แสดง: จำนวนทั้งหมด, ตรงเวลา, สาย, ครูที่เช็คอินแล้ว
 *
 * @param {string} userId - LINE User ID ของ Admin
 */
function handleTodaySummary(userId) {
  logInfo('AdminHandler', 'ดึงสรุปวันนี้');

  sendLineMessage(userId, [{
    type: 'text',
    text: '⏳ กำลังดึงข้อมูลสรุปวันนี้ค่ะ...',
  }]);

  const summary = getTodayCheckInSummary();

  if (!summary) {
    sendLineMessage(userId, [{
      type: 'text',
      text: '❌ ไม่สามารถดึงข้อมูลได้ค่ะ\nกรุณาลองใหม่อีกครั้งค่ะ 🙏',
    }]);
    return;
  }

  // ส่ง Flex Card สรุปหลัก
  sendLineMessage(userId, [flexAdminDailyReport(summary)]);

  // ถ้ามีการเช็คอินแล้ว → ส่งข้อมูลเพิ่มเติมเป็น Text
  // สรุปแบบ Quick Overview ให้เห็นภาพรวมทันที
  if (summary.totalCheckIns > 0) {
    Utilities.sleep(500);
    const quickOverview = buildQuickOverviewText(summary);
    sendLineMessage(userId, [{
      type: 'text',
      text: quickOverview,
    }]);
  }
}


/**
 * สร้างข้อความสรุปภาพรวมแบบ Text
 * สำหรับแสดงหลัง Flex Card เพื่อให้อ่านง่ายขึ้น
 *
 * @param {Object} summary - ข้อมูลจาก getTodayCheckInSummary()
 * @returns {string} ข้อความสรุป
 */
function buildQuickOverviewText(summary) {
  // จัดกลุ่มตามคาบ
  const byPeriod = {};
  summary.logs.forEach(log => {
    const key = `คาบที่ ${log['Period_Number']}`;
    if (!byPeriod[key]) byPeriod[key] = [];
    byPeriod[key].push(log);
  });

  // เรียงตามหมายเลขคาบ
  const sortedKeys = Object.keys(byPeriod).sort((a, b) => {
    const na = Number(a.replace('คาบที่ ', ''));
    const nb = Number(b.replace('คาบที่ ', ''));
    return na - nb;
  });

  let lines = [`📋 รายละเอียดการเช็คอินวันนี้\n`];

  sortedKeys.forEach(periodKey => {
    const logs = byPeriod[periodKey];
    lines.push(`${periodKey}:`);
    logs.forEach(log => {
      const icon   = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
        ? '🟢' : '🟡';
      const time   = new Date(log['Timestamp'])
        .toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      lines.push(
        `  ${icon} ${log['Teacher_Name']} (${time} น.)`
      );
      lines.push(
        `     📝 ${log['Teaching_Topic'] || '-'}`
      );
    });
    lines.push('');
  });

  lines.push('🟢 ตรงเวลา  🟡 สาย');
  return lines.join('\n');
}


// ============================================================
// 📋 SECTION 5: รายงานรายละเอียดวันนี้
// ============================================================

/**
 * แสดงรายละเอียดการเช็คอินวันนี้ แยกตามคาบ
 * ใช้ Flex Carousel แสดงทีละคาบ
 *
 * @param {string} userId - LINE User ID ของ Admin
 */
function handleDetailReport(userId) {
  logInfo('AdminHandler', 'ดึงรายละเอียดวันนี้');

  sendLineMessage(userId, [{
    type: 'text',
    text: '⏳ กำลังดึงรายละเอียดค่ะ...',
  }]);

  const summary = getTodayCheckInSummary();

  if (!summary || summary.totalCheckIns === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text:
        `📋 ยังไม่มีการเช็คอินในวันนี้ค่ะ\n\n` +
        `📅 ${formatThaiDate(new Date())}`,
    }]);
    return;
  }

  // ส่ง Flex Carousel แยกตามคาบ
  sendLineMessage(userId, [
    flexAdminDetailReport(summary.logs),
  ]);

  // ส่ง Quick Reply เพื่อดูรายงานอื่น
  Utilities.sleep(500);
  sendLineMessage(userId, [{
    type: 'text',
    text: 'ต้องการดูรายงานเพิ่มเติมไหมคะ? 📊',
    quickReply: buildAdminQuickReply(),
  }]);
}


// ============================================================
// 📅 SECTION 6: รายงานรายสัปดาห์
// ============================================================

/**
 * แสดงสรุปการเช็คอินย้อนหลัง 7 วัน
 *
 * @param {string} userId - LINE User ID ของ Admin
 */
function handleWeeklyReport(userId) {
  logInfo('AdminHandler', 'ดึงรายงานรายสัปดาห์');

  sendLineMessage(userId, [{
    type: 'text',
    text: '⏳ กำลังสรุปข้อมูล 7 วันย้อนหลังค่ะ...',
  }]);

  // กำหนดช่วงวันที่: 7 วันย้อนหลังจนถึงวันนี้
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 6); // 7 วัน รวมวันนี้
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const logs = getCheckInsByDateRange(startDate, endDate);

  if (logs.length === 0) {
    sendLineMessage(userId, [{
      type: 'text',
      text: '📅 ไม่พบข้อมูลการเช็คอินใน 7 วันที่ผ่านมาค่ะ',
    }]);
    return;
  }

  // จัดกลุ่มตามวัน
  const byDay = {};
  logs.forEach(log => {
    const date = new Date(log['Timestamp']);
    date.setHours(0, 0, 0, 0);
    const dayKey = date.toLocaleDateString('th-TH', {
      weekday: 'short',
      day:     'numeric',
      month:   'short',
    });
    if (!byDay[dayKey]) {
      byDay[dayKey] = { total: 0, onTime: 0, late: 0 };
    }
    byDay[dayKey].total++;
    if (log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME) {
      byDay[dayKey].onTime++;
    } else {
      byDay[dayKey].late++;
    }
  });

  // สร้างข้อความสรุปรายสัปดาห์
  const weeklyText = buildWeeklyReportText(byDay, logs.length);
  sendLineMessage(userId, [{ type: 'text', text: weeklyText }]);

  // ส่ง Flex Card สรุปรายสัปดาห์
  Utilities.sleep(500);
  sendLineMessage(userId, [
    flexAdminWeeklyReport(byDay, startDate, endDate),
  ]);
}


/**
 * สร้างข้อความสรุปรายสัปดาห์
 *
 * @param {Object} byDay    - ข้อมูลจัดกลุ่มตามวัน
 * @param {number} total    - จำนวนทั้งหมด
 * @returns {string}
 */
function buildWeeklyReportText(byDay, total) {
  const days = Object.keys(byDay);
  let lines  = [
    `📅 รายงานการเช็คอิน 7 วันย้อนหลัง\n`,
    `รวมทั้งสิ้น: ${total} รายการ\n`,
  ];

  days.forEach(day => {
    const d      = byDay[day];
    const onTimeIcon = d.onTime > 0 ? `🟢${d.onTime}` : '';
    const lateIcon   = d.late   > 0 ? `🟡${d.late}`   : '';
    lines.push(
      `${day}: ${d.total} คาบ  ${onTimeIcon} ${lateIcon}`
    );
  });

  lines.push('\n🟢 ตรงเวลา  🟡 สาย');
  return lines.join('\n');
}


// ============================================================
// 📥 SECTION 7: Export รายงาน
// ============================================================

/**
 * ส่ง Link Google Sheets ให้ Admin เปิดดูและ Export ได้เอง
 * พร้อมคำแนะนำวิธี Export เป็น Excel / CSV
 *
 * @param {string} userId - LINE User ID ของ Admin
 */
function handleExportReport(userId) {
  logInfo('AdminHandler', 'ส่ง Export Link');

  const sheetsUrl =
    `https://docs.google.com/spreadsheets/d/` +
    `${CREDENTIALS.SPREADSHEET_ID}/edit`;

  const checkInSheetUrl =
    `https://docs.google.com/spreadsheets/d/` +
    `${CREDENTIALS.SPREADSHEET_ID}/edit#gid=0`;

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
    // Flex Card พร้อมปุ่ม "เปิด Sheets"
    flexExportCard(sheetsUrl),
  ]);
}


// ============================================================
// 👩‍🏫 SECTION 8: รายละเอียดตามครู และตามคาบ
// ============================================================

/**
 * แสดงรายละเอียดการสอนของครูคนใดคนหนึ่งวันนี้
 *
 * @param {string} userId - LINE User ID ของ Admin
 * @param {Object} params - Postback params (teacher_id)
 */
function handleTeacherDetail(userId, params) {
  const teacherId = params['teacher_id'];
  if (!teacherId) {
    sendAdminMainMenu(userId);
    return;
  }

  logInfo('AdminHandler', `ดูรายละเอียดครู: ${teacherId}`);

  const summary = getTodayCheckInSummary();
  if (!summary) {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ERROR_GENERAL,
    }]);
    return;
  }

  // กรองเฉพาะครูคนนี้
  const teacherLogs = summary.logs.filter(
    log => log['Teacher_ID'] === teacherId
  );

  if (teacherLogs.length === 0) {
    const teacher = getTeacherById(teacherId);
    sendLineMessage(userId, [{
      type: 'text',
      text:
        `📋 ${teacher ? teacher['Teacher_Name'] : teacherId}\n` +
        `ยังไม่มีการเช็คอินในวันนี้ค่ะ`,
    }]);
    return;
  }

  // สร้างข้อความรายละเอียด
  const teacher   = getTeacherById(teacherId);
  const name      = teacher ? teacher['Teacher_Name'] : teacherId;
  let   lines     = [`👩‍🏫 ${name}\n📅 ${formatThaiDate(new Date())}\n`];

  teacherLogs.forEach(log => {
    const icon = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
      ? '🟢' : '🟡';
    const time = new Date(log['Timestamp'])
      .toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    lines.push(
      `${icon} ${log['Period_Name']} — ${log['Subject_Name']}\n` +
      `   🕐 ${time} น. | 🏫 ${log['Classroom']}\n` +
      `   📝 ${log['Teaching_Topic'] || '-'}\n` +
      `   📋 ${log['Assignment']     || 'ไม่มีงาน'}`
    );
  });

  sendLineMessage(userId, [{
    type: 'text',
    text: lines.join('\n'),
  }]);
}


/**
 * แสดงรายละเอียดการเช็คอินในคาบที่เลือก
 *
 * @param {string} userId - LINE User ID ของ Admin
 * @param {Object} params - Postback params (period_number)
 */
function handlePeriodDetail(userId, params) {
  const periodNumber = Number(params['period_number']);
  if (!periodNumber) {
    sendAdminMainMenu(userId);
    return;
  }

  logInfo('AdminHandler', `ดูรายละเอียดคาบ: ${periodNumber}`);

  const period  = getPeriodByNumber(periodNumber);
  const summary = getTodayCheckInSummary();

  if (!summary) {
    sendLineMessage(userId, [{
      type: 'text',
      text: MESSAGES.ERROR_GENERAL,
    }]);
    return;
  }

  // กรองเฉพาะคาบนี้
  const periodLogs = summary.logs.filter(
    log => Number(log['Period_Number']) === periodNumber
  );

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

  let lines = [`🕐 ${periodName}\n📅 ${formatThaiDate(new Date())}\n`];

  periodLogs.forEach(log => {
    const icon = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
      ? '🟢' : '🟡';
    const time = new Date(log['Timestamp'])
      .toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    lines.push(
      `${icon} ${log['Teacher_Name']}\n` +
      `   📚 ${log['Subject_Name']} | 🏫 ${log['Classroom']}\n` +
      `   🕐 ${time} น.\n` +
      `   📝 ${log['Teaching_Topic'] || '-'}\n` +
      `   📋 ${log['Assignment']     || 'ไม่มีงาน'}`
    );
  });

  sendLineMessage(userId, [{ type: 'text', text: lines.join('\n') }]);
}


// ============================================================
// 🏠 SECTION 9: เมนูหลัก Admin
// ============================================================

/**
 * ส่งเมนูหลักให้ Admin
 * แสดงเป็น Flex Card + Quick Reply
 *
 * @param {string} userId - LINE User ID ของ Admin
 */
function sendAdminMainMenu(userId) {
  sendLineMessage(userId, [
    // Flex Card เมนูหลัก
    flexAdminMenu(),
    // Quick Reply สำหรับความสะดวก
    buildAdminMenuMessage(),
  ]);
}


/**
 * สร้างข้อความ Quick Reply สำหรับ Admin
 * ใช้ต่อท้ายหลังส่ง Flex Card
 *
 * @returns {Object} Message Object พร้อม Quick Reply
 */
function buildAdminMenuMessage() {
  return {
    type: 'text',
    text: 'หรือกดปุ่มด้านล่างเพื่อใช้งานได้เลยค่ะ 👇',
    quickReply: buildAdminQuickReply(),
  };
}


/**
 * สร้าง Quick Reply Items สำหรับ Admin
 * ใช้ซ้ำได้หลายที่
 *
 * @returns {Object} quickReply Object
 */
function buildAdminQuickReply() {
  return {
    items: [
      {
        type: 'action',
        action: {
          type:        'postback',
          label:       '📊 สรุปวันนี้',
          data:        'action=admin_today_summary',
          displayText: 'ดูสรุปวันนี้ค่ะ',
        },
      },
      {
        type: 'action',
        action: {
          type:        'postback',
          label:       '📋 รายละเอียด',
          data:        'action=admin_detail_report',
          displayText: 'ดูรายละเอียดค่ะ',
        },
      },
      {
        type: 'action',
        action: {
          type:        'postback',
          label:       '📅 รายสัปดาห์',
          data:        'action=admin_weekly_report',
          displayText: 'ดูรายงานรายสัปดาห์ค่ะ',
        },
      },
      {
        type: 'action',
        action: {
          type:        'postback',
          label:       '📥 Export',
          data:        'action=admin_export',
          displayText: 'ขอ Export รายงานค่ะ',
        },
      },
    ],
  };
}


// ============================================================
// 🎨 SECTION 10: Flex Templates เฉพาะ Admin
//               (เพิ่มเติมจาก FlexMessages.gs)
// ============================================================

/**
 * [ADMIN] Flex Card รายงานสรุปรายสัปดาห์
 *
 * @param {Object} byDay    - ข้อมูลจัดกลุ่มตามวัน
 * @param {Date}   startDate - วันเริ่มต้น
 * @param {Date}   endDate   - วันสิ้นสุด
 * @returns {Object} Flex Message Object
 */
function flexAdminWeeklyReport(byDay, startDate, endDate) {
  const days     = Object.keys(byDay);
  const maxTotal = Math.max(...days.map(d => byDay[d].total), 1);

  // สร้าง Row สำหรับแต่ละวัน
  const dayRows = days.map(day => {
    const d         = byDay[day];
    const barWidth  = Math.round((d.total / maxTotal) * 100);

    return {
      type:    'box',
      layout:  'vertical',
      margin:  'sm',
      contents: [
        {
          type:   'box',
          layout: 'horizontal',
          contents: [
            {
              type:  'text',
              text:  day,
              size:  'xs',
              color: FLEX_COLORS.TEXT_SUB,
              flex:  3,
            },
            {
              type:  'text',
              text:  `${d.total} คาบ`,
              size:  'xs',
              color: FLEX_COLORS.TEXT_MAIN,
              align: 'end',
              flex:  2,
            },
          ],
        },
        // Progress Bar
        {
          type:   'box',
          layout: 'vertical',
          margin: 'xs',
          height: '6px',
          backgroundColor: '#E0E0E0',
          cornerRadius: '3px',
          contents: [
            {
              type:            'box',
              layout:          'vertical',
              width:           `${barWidth}%`,
              height:          '6px',
              backgroundColor: FLEX_COLORS.PRIMARY,
              cornerRadius:    '3px',
              contents:        [],
            },
          ],
        },
      ],
    };
  });

  // คำนวณรวม
  const totalAll  = days.reduce((s, d) => s + byDay[d].total,  0);
  const onTimeAll = days.reduce((s, d) => s + byDay[d].onTime, 0);
  const lateAll   = days.reduce((s, d) => s + byDay[d].late,   0);

  const startStr = startDate.toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short',
  });
  const endStr = endDate.toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short',
  });

  return {
    type:    'flex',
    altText: `รายงานรายสัปดาห์ — ${totalAll} รายการ`,
    contents: {
      type: 'bubble',
      header: {
        type:            'box',
        layout:          'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll:      '16px',
        contents: [
          {
            type:   'text',
            text:   '📅 รายงานรายสัปดาห์',
            color:  FLEX_COLORS.WHITE,
            size:   'md',
            weight: 'bold',
          },
          {
            type:   'text',
            text:   `${startStr} – ${endStr}`,
            color:  '#B0BEC5',
            size:   'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type:       'box',
        layout:     'vertical',
        paddingAll: '16px',
        spacing:    'sm',
        contents: [
          // สถิติรวม
          {
            type:    'box',
            layout:  'horizontal',
            spacing: 'sm',
            contents: [
              _statBox('รวมทั้งหมด', `${totalAll}`,  FLEX_COLORS.SECONDARY),
              _statBox('ตรงเวลา',    `${onTimeAll}`, FLEX_COLORS.PRIMARY),
              _statBox('สาย',        `${lateAll}`,   FLEX_COLORS.WARNING),
            ],
          },
          { type: 'separator', margin: 'md' },
          // Progress Bars รายวัน
          ...dayRows,
        ],
      },
    },
  };
}


/**
 * [ADMIN] Flex Card ปุ่ม Export พร้อม Link Google Sheets
 *
 * @param {string} sheetsUrl - URL ของ Google Sheets
 * @returns {Object} Flex Message Object
 */
function flexExportCard(sheetsUrl) {
  return {
    type:    'flex',
    altText: 'Export รายงาน — กดเพื่อเปิด Google Sheets',
    contents: {
      type: 'bubble',
      body: {
        type:       'box',
        layout:     'vertical',
        paddingAll: '16px',
        spacing:    'md',
        contents: [
          {
            type:   'text',
            text:   '📥 Export รายงาน',
            size:   'md',
            weight: 'bold',
            color:  FLEX_COLORS.SECONDARY,
          },
          {
            type:  'text',
            text:
              'กดปุ่มด้านล่างเพื่อเปิด Google Sheets\n' +
              'แล้วเลือก File > Download ได้เลยค่ะ',
            size:  'sm',
            color: FLEX_COLORS.TEXT_SUB,
            wrap:  true,
          },
          {
            type:       'box',
            layout:     'vertical',
            backgroundColor: '#E8F5E9',
            cornerRadius:    '8px',
            paddingAll:      '10px',
            margin:          'md',
            contents: [
              {
                type:  'text',
                text:  '💡 วิธี Export เป็น Excel',
                size:  'xs',
                color: FLEX_COLORS.PRIMARY,
                weight: 'bold',
              },
              {
                type:  'text',
                text:
                  '1. เปิด Sheets\n' +
                  '2. เลือก Teacher_CheckIn_Log\n' +
                  '3. File > Download > .xlsx',
                size:  'xs',
                color: FLEX_COLORS.TEXT_SUB,
                wrap:  true,
                margin: 'xs',
              },
            ],
          },
        ],
      },
      footer: {
        type:       'box',
        layout:     'vertical',
        paddingAll: '12px',
        contents: [
          {
            type:   'button',
            style:  'primary',
            color:  FLEX_COLORS.PRIMARY,
            height: 'sm',
            action: {
              type:  'uri',
              label: '📊 เปิด Google Sheets',
              uri:   sheetsUrl,
            },
          },
        ],
      },
    },
  };
}


// ============================================================
// 🧪 SECTION 11: Testing Functions
// ============================================================

/**
 * ทดสอบ Flow Admin ทั้งหมด
 * แก้ไข TEST_ADMIN_LINE_ID ก่อนรัน
 */
function testAdminFlow() {
  const TEST_ADMIN_LINE_ID = 'U_ADMIN_LINE_ID_HERE'; // ← แก้ไข

  logInfo('TEST_ADMIN', '=== ทดสอบ Admin Flow ===');

  // ทดสอบเมนูหลัก
  logInfo('TEST_ADMIN', '1. ทดสอบเมนูหลัก');
  sendAdminMainMenu(TEST_ADMIN_LINE_ID);
  Utilities.sleep(2000);

  // ทดสอบสรุปวันนี้
  logInfo('TEST_ADMIN', '2. ทดสอบสรุปวันนี้');
  handleTodaySummary(TEST_ADMIN_LINE_ID);
  Utilities.sleep(2000);

  // ทดสอบรายงานรายสัปดาห์
  logInfo('TEST_ADMIN', '3. ทดสอบรายงานรายสัปดาห์');
  handleWeeklyReport(TEST_ADMIN_LINE_ID);
  Utilities.sleep(2000);

  // ทดสอบ Export
  logInfo('TEST_ADMIN', '4. ทดสอบ Export');
  handleExportReport(TEST_ADMIN_LINE_ID);

  logInfo('TEST_ADMIN', '✅ ทดสอบ Admin Flow เสร็จสิ้น');
}


/**
 * ทดสอบรายงานด้วยข้อมูลจริงจาก Sheets
 */
function testAdminReportsWithRealData() {
  logInfo('TEST_ADMIN_DATA', '--- ทดสอบดึงข้อมูลจริง ---');

  // ทดสอบ getTodayCheckInSummary
  const summary = getTodayCheckInSummary();
  if (summary) {
    logInfo('TEST_ADMIN_DATA', '✅ Summary วันนี้', {
      total:          summary.totalCheckIns,
      onTime:         summary.onTime,
      late:           summary.late,
      uniqueTeachers: summary.uniqueTeachers,
    });
  } else {
    logInfo('TEST_ADMIN_DATA', '❌ ไม่สามารถดึง Summary ได้');
  }

  // ทดสอบ getCheckInsByDateRange (7 วัน)
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 6);
  const weekLogs = getCheckInsByDateRange(startDate, endDate);
  logInfo('TEST_ADMIN_DATA', '✅ Log 7 วัน', `${weekLogs.length} รายการ`);
}


/**
 * ทดสอบ buildQuickOverviewText
 * ตรวจสอบรูปแบบข้อความก่อน Deploy
 */
function testBuildOverviewText() {
  const mockSummary = {
    totalCheckIns:  4,
    onTime:         3,
    late:           1,
    uniqueTeachers: 4,
    date:           formatThaiDate(new Date()),
    logs: [
      {
        Timestamp:      new Date(),
        Teacher_Name:   'อ.สมชาย ใจดี',
        Period_Number:  '1',
        Period_Name:    'คาบที่ 1',
        Subject_Name:   'คณิตศาสตร์ ม.1/1',
        Teaching_Topic: 'อสมการเชิงเส้น',
        Status:         SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME,
      },
      {
        Timestamp:      new Date(),
        Teacher_Name:   'อ.สมหญิง ดีใจ',
        Period_Number:  '1',
        Period_Name:    'คาบที่ 1',
        Subject_Name:   'ภาษาไทย ม.2/1',
        Teaching_Topic: 'การเขียนสรุปความ',
        Status:         SYSTEM_CONFIG.CHECKIN_STATUS.LATE,
      },
    ],
  };

  const text = buildQuickOverviewText(mockSummary);
  logInfo('TEST_OVERVIEW', 'ข้อความที่ได้', text);
}