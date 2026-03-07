// ============================================================
// FlexMessages.gs — Templates Flex Message ทั้งหมดของระบบ
//
// ไฟล์นี้รวม Flex Message JSON Templates ทุกประเภท
// สำหรับหัวหน้าห้อง, ครูผู้สอน และ Admin
//
// หมายเหตุ: LINE ไม่รองรับ Markdown จึงใช้ Flex Message
//           แทนการจัดรูปแบบข้อความทั้งหมด
// ============================================================


// ============================================================
// 🎨 SECTION 0: ค่าสีและ Style กลาง (Design System)
// ============================================================

const FLEX_COLORS = {
  PRIMARY:      '#1DB954',  // เขียว — ปุ่มหลัก, สำเร็จ
  SECONDARY:    '#0D47A1',  // น้ำเงินเข้ม — Header
  ACCENT:       '#FF6B35',  // ส้ม — คาบเรียน, สำคัญ
  WARNING:      '#FFA000',  // เหลือง — เตือน, สาย
  DANGER:       '#D32F2F',  // แดง — Error, หมดอายุ
  NEUTRAL:      '#546E7A',  // เทาน้ำเงิน — ข้อความรอง
  LIGHT_BG:     '#F5F5F5',  // พื้นหลังอ่อน
  WHITE:        '#FFFFFF',
  TEXT_MAIN:    '#212121',  // ข้อความหลัก
  TEXT_SUB:     '#757575',  // ข้อความรอง
};


// ============================================================
// 👨‍🎓 SECTION 1: Flex Messages สำหรับหัวหน้าห้อง
// ============================================================

/**
 * [MONITOR] แสดงรายการคาบเรียนวันนี้ของห้อง
 * หัวหน้าห้องกดเพื่อเลือกคาบที่ต้องการสร้าง QR
 *
 * @param {string}        classroom   - ชื่อห้อง เช่น "ห้อง 1/1"
 * @param {Array<Object>} schedules   - ข้อมูลตารางสอนวันนี้จาก SheetManager
 * @returns {Object} Flex Message Object พร้อมส่ง
 */
function flexPeriodList(classroom, schedules) {

  // สร้าง Bubble ของแต่ละคาบ
  const periodBubbles = schedules.map(subject => {

    const period     = getPeriodByNumber(Number(subject['Period_Number']));
    const timeLabel  = period ? `${period.start} - ${period.end}` : '';
    const periodName = subject['Period_Name'] || `คาบที่ ${subject['Period_Number']}`;

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: periodName,
            color: FLEX_COLORS.WHITE,
            size: 'sm',
            weight: 'bold',
          },
          {
            type: 'text',
            text: timeLabel,
            color: '#B0BEC5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: subject['Subject_Name'] || '-',
            size: 'sm',
            weight: 'bold',
            color: FLEX_COLORS.TEXT_MAIN,
            wrap: true,
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: '👩‍🏫',
                size: 'xs',
                flex: 0,
              },
              {
                type: 'text',
                text: subject['Teacher_ID'] || '-',
                size: 'xs',
                color: FLEX_COLORS.TEXT_SUB,
                flex: 1,
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: FLEX_COLORS.PRIMARY,
            height: 'sm',
            action: {
              type: 'postback',
              label: '📲 สร้าง QR',
              // ส่ง Postback data พร้อมข้อมูลคาบ
              data: `action=create_qr&period=${subject['Period_Number']}&classroom=${encodeURIComponent(classroom)}&subject=${encodeURIComponent(subject['Subject_Code'])}`,
              displayText: `สร้าง QR ${periodName}`,
            },
          },
        ],
      },
    };
  });

  // ถ้าไม่มีตารางวันนี้
  if (periodBubbles.length === 0) {
    return flexNoSchedule(classroom);
  }

  // Wrapper Card หลัก
  const headerBubble = {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: '📅 ตารางสอนวันนี้',
          size: 'lg',
          weight: 'bold',
          color: FLEX_COLORS.SECONDARY,
        },
        {
          type: 'text',
          text: `🏫 ${classroom}`,
          size: 'sm',
          color: FLEX_COLORS.TEXT_SUB,
          margin: 'xs',
        },
        {
          type: 'text',
          text: formatThaiDate(new Date()),
          size: 'xs',
          color: FLEX_COLORS.TEXT_SUB,
        },
        {
          type: 'separator',
          margin: 'md',
        },
        {
          type: 'text',
          text: 'กดปุ่ม "สร้าง QR" เพื่อสร้าง QR Code ให้ครูผู้สอนสแกนค่ะ',
          size: 'xs',
          color: FLEX_COLORS.NEUTRAL,
          wrap: true,
          margin: 'md',
        },
      ],
    },
  };

  return {
    type: 'flex',
    altText: `ตารางสอนวันนี้ ${classroom} — กรุณาเปิดเพื่อดูรายละเอียดค่ะ`,
    contents: {
      type: 'carousel',
      contents: [headerBubble, ...periodBubbles],
    },
  };
}


/**
 * [MONITOR] ยืนยันก่อนสร้าง QR Code
 * แสดงข้อมูลคาบและขอให้หัวหน้าห้องยืนยันอีกครั้ง
 *
 * @param {Object} subject  - ข้อมูลวิชาจาก Subjects_Schedule
 * @param {Object} teacher  - ข้อมูลครูจาก Teachers_Master
 * @param {Object} period   - ข้อมูลคาบจาก PERIODS
 * @returns {Object} Flex Message Object
 */
function flexQRConfirm(subject, teacher, period) {
  return {
    type: 'flex',
    altText: `ยืนยันสร้าง QR Code — ${subject['Subject_Name']} ${period.name}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '📲 ยืนยันสร้าง QR Code',
            color: FLEX_COLORS.WHITE,
            size: 'md',
            weight: 'bold',
          },
          {
            type: 'text',
            text: 'กรุณาตรวจสอบข้อมูลก่อนสร้างค่ะ',
            color: '#B0BEC5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          // แถวข้อมูลแต่ละบรรทัด
          _infoRow('📚', 'วิชา',         subject['Subject_Name'] || '-'),
          _infoRow('👩‍🏫', 'ครูผู้สอน',   teacher ? teacher['Teacher_Name'] : '-'),
          _infoRow('🏫', 'ห้องเรียน',    subject['Classroom'] || '-'),
          _infoRow('🕐', 'คาบ',          `${period.name} (${period.start}–${period.end})`),
          _infoRow('📅', 'วันที่',       formatThaiDate(new Date())),
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#FFF8E1',
            cornerRadius: '8px',
            paddingAll: '10px',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: `⏱️ QR Code จะหมดอายุใน ${SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES} นาทีค่ะ`,
                size: 'xs',
                color: FLEX_COLORS.WARNING,
                wrap: true,
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 1,
            action: {
              type: 'postback',
              label: '❌ ยกเลิก',
              data: `action=cancel_qr`,
              displayText: 'ยกเลิกการสร้าง QR',
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: FLEX_COLORS.PRIMARY,
            height: 'sm',
            flex: 2,
            action: {
              type: 'postback',
              label: '✅ ยืนยันสร้าง QR',
              data: `action=confirm_qr&period=${subject['Period_Number']}&classroom=${encodeURIComponent(subject['Classroom'])}&subject=${encodeURIComponent(subject['Subject_Code'])}`,
              displayText: 'ยืนยันสร้าง QR Code',
            },
          },
        ],
      },
    },
  };
}


/**
 * [MONITOR] แจ้งหัวหน้าห้องเมื่อครูเช็คอินสำเร็จ
 *
 * @param {string} teacherName  - ชื่อครู
 * @param {string} subjectName  - ชื่อวิชา
 * @param {string} periodName   - ชื่อคาบ
 * @param {string} topic        - เรื่องที่สอน
 * @returns {Object} Flex Message Object
 */
function flexMonitorCheckinNotify(teacherName, subjectName, periodName, topic) {
  return {
    type: 'flex',
    altText: `✅ ${teacherName} เช็คอินแล้วค่ะ`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            contents: [
              {
                type: 'text',
                text: '✅',
                size: 'xxl',
                flex: 0,
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                contents: [
                  {
                    type: 'text',
                    text: 'ครูเช็คอินแล้วค่ะ!',
                    size: 'md',
                    weight: 'bold',
                    color: FLEX_COLORS.PRIMARY,
                  },
                  {
                    type: 'text',
                    text: teacherName,
                    size: 'sm',
                    color: FLEX_COLORS.TEXT_MAIN,
                    margin: 'xs',
                  },
                ],
              },
            ],
          },
          { type: 'separator', margin: 'md' },
          _infoRow('📚', 'วิชา',     subjectName),
          _infoRow('🕐', 'คาบ',      periodName),
          _infoRow('📝', 'เรื่องที่สอน', topic || '-'),
        ],
      },
    },
  };
}


// ============================================================
// 👩‍🏫 SECTION 2: Flex Messages สำหรับครูผู้สอน
// ============================================================

/**
 * [TEACHER] แสดงข้อมูลคาบหลังจากสแกน QR สำเร็จ
 * ครูตรวจสอบข้อมูลก่อนกรอกรายละเอียด
 *
 * @param {Object} qrData     - ข้อมูลจาก QR_Sessions
 * @param {Object} teacher    - ข้อมูลครูจาก Teachers_Master
 * @returns {Object} Flex Message Object
 */
function flexClassInfo(qrData, teacher) {
  const period = getPeriodByNumber(Number(qrData['Period_Number']));
  const timeLabel = period ? `${period.start} – ${period.end}` : '-';

  return {
    type: 'flex',
    altText: `สแกน QR สำเร็จ — ${qrData['Subject_Name'] || qrData['Subject_Code']} ${qrData['Period_Name']}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '📲 สแกน QR สำเร็จ!',
            color: FLEX_COLORS.WHITE,
            size: 'md',
            weight: 'bold',
          },
          {
            type: 'text',
            text: 'กรุณาตรวจสอบข้อมูลด้านล่างค่ะ',
            color: '#B0BEC5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          // ชื่อวิชาขนาดใหญ่เด่นชัด
          {
            type: 'text',
            text: qrData['Subject_Name'] || qrData['Subject_Code'] || '-',
            size: 'lg',
            weight: 'bold',
            color: FLEX_COLORS.TEXT_MAIN,
            wrap: true,
          },
          { type: 'separator', margin: 'md' },
          _infoRow('👩‍🏫', 'ครูผู้สอน',   teacher ? teacher['Teacher_Name'] : '-'),
          _infoRow('🏫', 'ห้องเรียน',    qrData['Classroom'] || '-'),
          _infoRow('🕐', 'คาบเรียน',
            `${qrData['Period_Name']} (${timeLabel})`),
          _infoRow('📅', 'วันที่',        formatThaiDate(new Date())),
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: 'กรุณากรอกรายละเอียดการสอน\nด้วยการพิมพ์ตอบกลับในแชทค่ะ 👇',
            size: 'sm',
            color: FLEX_COLORS.NEUTRAL,
            wrap: true,
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: FLEX_COLORS.ACCENT,
            height: 'sm',
            action: {
              type: 'message',
              label: '✏️ เริ่มกรอกข้อมูล',
              text: 'เริ่มกรอกข้อมูลการสอน',
            },
          },
        ],
      },
    },
  };
}


/**
 * [TEACHER] แสดงสรุปข้อมูลก่อนยืนยันเช็คอิน
 * ครูตรวจสอบข้อมูลทั้งหมดครั้งสุดท้ายก่อนบันทึก
 *
 * @param {Object} checkinData  - ข้อมูลการเช็คอินที่กรอก
 * @returns {Object} Flex Message Object
 */
function flexCheckinConfirm(checkinData) {
  return {
    type: 'flex',
    altText: 'ยืนยันการเช็คอิน — กรุณาตรวจสอบข้อมูลค่ะ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.ACCENT,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '📋 ยืนยันการเช็คอิน',
            color: FLEX_COLORS.WHITE,
            size: 'md',
            weight: 'bold',
          },
          {
            type: 'text',
            text: 'กรุณาตรวจสอบข้อมูลก่อนกดยืนยันค่ะ',
            color: '#FFE0CC',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          _infoRow('👩‍🏫', 'ครูผู้สอน',       checkinData.teacherName     || '-'),
          _infoRow('📚', 'วิชา',             checkinData.subjectName     || '-'),
          _infoRow('🏫', 'ห้องเรียน',        checkinData.classroom       || '-'),
          _infoRow('🕐', 'คาบเรียน',
            `${checkinData.periodName} (${checkinData.timeStart}–${checkinData.timeEnd})`),
          _infoRow('📅', 'วันที่',            formatThaiDate(new Date())),
          { type: 'separator', margin: 'md' },
          // เรื่องที่สอน — กล่องเด่นชัด
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: FLEX_COLORS.LIGHT_BG,
            cornerRadius: '8px',
            paddingAll: '12px',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: '📝 เรื่องที่สอน',
                size: 'xs',
                color: FLEX_COLORS.NEUTRAL,
                weight: 'bold',
              },
              {
                type: 'text',
                text: checkinData.teachingTopic || '-',
                size: 'sm',
                color: FLEX_COLORS.TEXT_MAIN,
                wrap: true,
                margin: 'xs',
              },
            ],
          },
          // งานมอบหมาย
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: FLEX_COLORS.LIGHT_BG,
            cornerRadius: '8px',
            paddingAll: '12px',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: '📋 งานมอบหมาย',
                size: 'xs',
                color: FLEX_COLORS.NEUTRAL,
                weight: 'bold',
              },
              {
                type: 'text',
                text: checkinData.assignment || 'ไม่มีงานมอบหมาย',
                size: 'sm',
                color: checkinData.assignment ? FLEX_COLORS.TEXT_MAIN : FLEX_COLORS.TEXT_SUB,
                wrap: true,
                margin: 'xs',
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 1,
            action: {
              type: 'postback',
              label: '✏️ แก้ไข',
              data: 'action=edit_checkin',
              displayText: 'ขอแก้ไขข้อมูลค่ะ',
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: FLEX_COLORS.PRIMARY,
            height: 'sm',
            flex: 2,
            action: {
              type: 'postback',
              label: '✅ ยืนยันเช็คอิน',
              data: 'action=confirm_checkin',
              displayText: 'ยืนยันการเช็คอินค่ะ',
            },
          },
        ],
      },
    },
  };
}


/**
 * [TEACHER] แจ้งผลการเช็คอินสำเร็จ
 *
 * @param {Object} checkinData  - ข้อมูลการเช็คอินที่บันทึกแล้ว
 * @returns {Object} Flex Message Object
 */
function flexCheckinSuccess(checkinData) {
  const statusColor = checkinData.status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
    ? FLEX_COLORS.PRIMARY
    : FLEX_COLORS.WARNING;

  const statusIcon = checkinData.status === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME
    ? '✅'
    : '⚠️';

  return {
    type: 'flex',
    altText: `✅ เช็คอินสำเร็จ — ${checkinData.subjectName}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        contents: [
          // ไอคอนและหัวข้อ
          {
            type: 'box',
            layout: 'vertical',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: statusIcon,
                size: '5xl',
                align: 'center',
              },
              {
                type: 'text',
                text: 'บันทึกการเข้าสอนสำเร็จ!',
                size: 'lg',
                weight: 'bold',
                color: statusColor,
                align: 'center',
                margin: 'md',
              },
              {
                type: 'text',
                text: checkinData.status || '',
                size: 'sm',
                color: statusColor,
                align: 'center',
              },
            ],
          },
          { type: 'separator', margin: 'lg' },
          _infoRow('📚', 'วิชา',       checkinData.subjectName  || '-'),
          _infoRow('🕐', 'คาบ',        checkinData.periodName   || '-'),
          _infoRow('📝', 'เรื่องที่สอน', checkinData.teachingTopic || '-'),
          _infoRow('📋', 'งานมอบหมาย',
            checkinData.assignment || 'ไม่มีงานมอบหมาย'),
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: `บันทึกเมื่อ ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`,
            size: 'xs',
            color: FLEX_COLORS.TEXT_SUB,
            align: 'center',
            margin: 'md',
          },
          {
            type: 'text',
            text: 'ขอบคุณค่ะ 🙏',
            size: 'sm',
            color: FLEX_COLORS.NEUTRAL,
            align: 'center',
          },
        ],
      },
    },
  };
}


/**
 * [TEACHER] แสดงประวัติการเช็คอินย้อนหลัง
 *
 * @param {string}        teacherName - ชื่อครู
 * @param {Array<Object>} history     - ประวัติจาก getTeacherCheckInHistory()
 * @returns {Object} Flex Message Object
 */
function flexTeacherHistory(teacherName, history) {

  // สร้าง Row สำหรับแต่ละรายการ
  const historyRows = history.slice(0, 5).map(log => { // แสดงแค่ 5 รายการล่าสุด
    const date = new Date(log['Timestamp']);
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
    const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const isOnTime = log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME;

    return {
      type: 'box',
      layout: 'horizontal',
      paddingAll: '8px',
      spacing: 'sm',
      contents: [
        {
          type: 'text',
          text: isOnTime ? '🟢' : '🟡',
          size: 'xs',
          flex: 0,
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          contents: [
            {
              type: 'text',
              text: log['Subject_Name'] || '-',
              size: 'xs',
              weight: 'bold',
              color: FLEX_COLORS.TEXT_MAIN,
              wrap: true,
            },
            {
              type: 'text',
              text: `${log['Period_Name']} • ${log['Classroom']}`,
              size: 'xxs',
              color: FLEX_COLORS.TEXT_SUB,
            },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 0,
          alignItems: 'flex-end',
          contents: [
            {
              type: 'text',
              text: dateStr,
              size: 'xxs',
              color: FLEX_COLORS.TEXT_SUB,
              align: 'end',
            },
            {
              type: 'text',
              text: timeStr,
              size: 'xxs',
              color: FLEX_COLORS.TEXT_SUB,
              align: 'end',
            },
          ],
        },
      ],
    };
  });

  // ถ้าไม่มีประวัติ
  if (historyRows.length === 0) {
    historyRows.push({
      type: 'text',
      text: 'ยังไม่มีประวัติการเช็คอินค่ะ',
      size: 'sm',
      color: FLEX_COLORS.TEXT_SUB,
      align: 'center',
    });
  }

  return {
    type: 'flex',
    altText: `ประวัติการเช็คอินของ ${teacherName}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '📊 ประวัติการเช็คอิน',
            color: FLEX_COLORS.WHITE,
            size: 'md',
            weight: 'bold',
          },
          {
            type: 'text',
            text: `${teacherName} (5 รายการล่าสุด)`,
            color: '#B0BEC5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'none',
        paddingAll: '8px',
        contents: historyRows,
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        paddingAll: '8px',
        contents: [
          {
            type: 'text',
            text: '🟢 ตรงเวลา   🟡 สาย',
            size: 'xxs',
            color: FLEX_COLORS.TEXT_SUB,
            align: 'center',
          },
        ],
      },
    },
  };
}


// ============================================================
// 👔 SECTION 3: Flex Messages สำหรับ Admin
// ============================================================

/**
 * [ADMIN] แสดงรายงานสรุปประจำวัน
 *
 * @param {Object} summary - ข้อมูลจาก getTodayCheckInSummary()
 * @returns {Object} Flex Message Object
 */
function flexAdminDailyReport(summary) {
  return {
    type: 'flex',
    altText: `📊 รายงานสรุปวันนี้ — เช็คอินแล้ว ${summary.totalCheckIns} คาบ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '📊 รายงานสรุปประจำวัน',
            color: FLEX_COLORS.WHITE,
            size: 'md',
            weight: 'bold',
          },
          {
            type: 'text',
            text: summary.date || formatThaiDate(new Date()),
            color: '#B0BEC5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          // สถิติหลัก — 3 ช่อง
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              _statBox('รวมทั้งหมด', `${summary.totalCheckIns} คาบ`, FLEX_COLORS.SECONDARY),
              _statBox('ตรงเวลา',    `${summary.onTime} คาบ`,        FLEX_COLORS.PRIMARY),
              _statBox('สาย',        `${summary.late} คาบ`,          FLEX_COLORS.WARNING),
            ],
          },
          { type: 'separator', margin: 'md' },
          _infoRow('👩‍🏫', 'ครูที่เช็คอินแล้ว', `${summary.uniqueTeachers} คน`),
          { type: 'separator', margin: 'sm' },
          {
            type: 'text',
            text: 'กดปุ่มด้านล่างเพื่อดูรายละเอียดค่ะ',
            size: 'xs',
            color: FLEX_COLORS.TEXT_SUB,
            align: 'center',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 1,
            action: {
              type: 'postback',
              label: '📋 รายละเอียด',
              data: 'action=admin_detail_report',
              displayText: 'ดูรายละเอียดการเช็คอินค่ะ',
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: FLEX_COLORS.SECONDARY,
            height: 'sm',
            flex: 1,
            action: {
              type: 'postback',
              label: '📥 Export',
              data: 'action=admin_export',
              displayText: 'ขอ Export รายงานค่ะ',
            },
          },
        ],
      },
    },
  };
}


/**
 * [ADMIN] แสดงรายละเอียดการเช็คอินวันนี้แบบ List
 *
 * @param {Array<Object>} logs - รายการ CheckIn ของวันนี้
 * @returns {Object} Flex Message Object
 */
function flexAdminDetailReport(logs) {

  // จัดกลุ่มตามคาบ
  const byPeriod = {};
  logs.forEach(log => {
    const key = `${log['Period_Number']}_${log['Period_Name']}`;
    if (!byPeriod[key]) byPeriod[key] = [];
    byPeriod[key].push(log);
  });

  const periodKeys = Object.keys(byPeriod).sort((a, b) => {
    return Number(a.split('_')[0]) - Number(b.split('_')[0]);
  });

  // สร้าง Bubble สำหรับแต่ละคาบ
  const bubbles = periodKeys.map(key => {
    const periodLogs = byPeriod[key];
    const periodName = key.split('_').slice(1).join('_');
    const period     = getPeriodByNumber(Number(key.split('_')[0]));
    const timeLabel  = period ? `${period.start}–${period.end}` : '';

    const teacherRows = periodLogs.map(log => ({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'xs',
      contents: [
        {
          type: 'text',
          text: log['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME ? '🟢' : '🟡',
          size: 'xs',
          flex: 0,
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          contents: [
            {
              type: 'text',
              text: log['Teacher_Name'] || '-',
              size: 'xs',
              weight: 'bold',
              color: FLEX_COLORS.TEXT_MAIN,
            },
            {
              type: 'text',
              text: log['Subject_Name'] || '-',
              size: 'xxs',
              color: FLEX_COLORS.TEXT_SUB,
            },
          ],
        },
      ],
    }));

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: periodName,
            color: FLEX_COLORS.WHITE,
            size: 'sm',
            weight: 'bold',
          },
          {
            type: 'text',
            text: timeLabel,
            color: '#B0BEC5',
            size: 'xxs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        spacing: 'xs',
        contents: teacherRows.length > 0 ? teacherRows : [
          {
            type: 'text',
            text: 'ยังไม่มีการเช็คอินค่ะ',
            size: 'xs',
            color: FLEX_COLORS.TEXT_SUB,
            align: 'center',
          },
        ],
      },
    };
  });

  if (bubbles.length === 0) {
    return {
      type: 'flex',
      altText: 'ยังไม่มีการเช็คอินในวันนี้ค่ะ',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'text',
              text: '📋 ยังไม่มีการเช็คอิน\nในวันนี้ค่ะ',
              size: 'md',
              color: FLEX_COLORS.TEXT_SUB,
              align: 'center',
              wrap: true,
            },
          ],
        },
      },
    };
  }

  return {
    type: 'flex',
    altText: `รายละเอียดการเช็คอินวันนี้ — ${logs.length} รายการ`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}


/**
 * [ADMIN] เมนูหลักของ Admin
 *
 * @returns {Object} Flex Message Object
 */
function flexAdminMenu() {
  return {
    type: 'flex',
    altText: 'เมนู Admin ฝ่ายวิชาการ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '👔 Admin ฝ่ายวิชาการ',
            color: FLEX_COLORS.WHITE,
            size: 'md',
            weight: 'bold',
          },
          {
            type: 'text',
            text: SCHOOL_CONFIG.SCHOOL_NAME,
            color: '#B0BEC5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          _menuButton('📊 ดูสรุปวันนี้',       'action=admin_today_summary',   FLEX_COLORS.SECONDARY),
          _menuButton('📋 รายละเอียดวันนี้',    'action=admin_detail_report',   FLEX_COLORS.SECONDARY),
          _menuButton('📅 รายงานรายสัปดาห์',   'action=admin_weekly_report',   FLEX_COLORS.NEUTRAL),
          _menuButton('📥 Export รายงาน',       'action=admin_export',          FLEX_COLORS.NEUTRAL),
        ],
      },
    },
  };
}


// ============================================================
// ❌ SECTION 4: Flex Messages สำหรับ Error และ System
// ============================================================

/**
 * [SYSTEM] ไม่มีตารางเรียนวันนี้
 * @param {string} classroom - ชื่อห้อง
 * @returns {Object} Flex Message Object
 */
function flexNoSchedule(classroom) {
  return {
    type: 'flex',
    altText: `ไม่พบตารางสอนของ ${classroom} วันนี้ค่ะ`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '24px',
        alignItems: 'center',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '📅',
            size: '5xl',
            align: 'center',
          },
          {
            type: 'text',
            text: 'ไม่พบตารางสอนวันนี้',
            size: 'lg',
            weight: 'bold',
            color: FLEX_COLORS.TEXT_MAIN,
            align: 'center',
          },
          {
            type: 'text',
            text: `ห้อง ${classroom}\n${formatThaiDate(new Date())}`,
            size: 'sm',
            color: FLEX_COLORS.TEXT_SUB,
            align: 'center',
            wrap: true,
          },
          {
            type: 'text',
            text: 'หากมีข้อสงสัย กรุณาติดต่อฝ่ายวิชาการค่ะ',
            size: 'xs',
            color: FLEX_COLORS.NEUTRAL,
            align: 'center',
            wrap: true,
            margin: 'md',
          },
        ],
      },
    },
  };
}


/**
 * [SYSTEM] เมนูหลักสำหรับครูผู้สอน
 * @param {string} teacherName - ชื่อครู
 * @returns {Object} Flex Message Object
 */
function flexTeacherMenu(teacherName) {
  return {
    type: 'flex',
    altText: `สวัสดีค่ะ ${teacherName}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_COLORS.SECONDARY,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: `👋 สวัสดีค่ะ`,
            color: FLEX_COLORS.WHITE,
            size: 'sm',
          },
          {
            type: 'text',
            text: teacherName,
            color: FLEX_COLORS.WHITE,
            size: 'lg',
            weight: 'bold',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: 'ระบบเช็คอินการเข้าสอน พร้อมใช้งานค่ะ ✅',
            size: 'sm',
            color: FLEX_COLORS.TEXT_SUB,
            wrap: true,
          },
          { type: 'separator', margin: 'md' },
          _menuButton('📊 ประวัติการเช็คอินของฉัน', 'action=teacher_history', FLEX_COLORS.SECONDARY),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: '💡 สแกน QR Code จากหัวหน้าห้อง\nเพื่อเช็คอินการเข้าสอนได้เลยค่ะ',
            size: 'xs',
            color: FLEX_COLORS.NEUTRAL,
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  };
}


// ============================================================
// 🛠️ SECTION 5: Helper Functions (ใช้ภายในไฟล์นี้)
// ============================================================

/**
 * สร้าง Row ข้อมูล Label : Value แบบ Horizontal
 * ใช้ซ้ำในหลาย Template
 * @private
 */
function _infoRow(icon, label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    margin: 'xs',
    contents: [
      {
        type: 'text',
        text: icon,
        size: 'sm',
        flex: 0,
      },
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: FLEX_COLORS.TEXT_SUB,
        flex: 2,
      },
      {
        type: 'text',
        text: String(value || '-'),
        size: 'sm',
        color: FLEX_COLORS.TEXT_MAIN,
        flex: 3,
        wrap: true,
        align: 'end',
      },
    ],
  };
}


/**
 * สร้างกล่องสถิติขนาดเล็ก (ใช้ใน Admin Report)
 * @private
 */
function _statBox(label, value, color) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    backgroundColor: color,
    cornerRadius: '8px',
    paddingAll: '10px',
    alignItems: 'center',
    contents: [
      {
        type: 'text',
        text: value,
        size: 'md',
        weight: 'bold',
        color: FLEX_COLORS.WHITE,
        align: 'center',
      },
      {
        type: 'text',
        text: label,
        size: 'xxs',
        color: '#FFFFFF99',
        align: 'center',
      },
    ],
  };
}


/**
 * สร้างปุ่มเมนูแบบ Full Width (ใช้ใน Admin Menu)
 * @private
 */
function _menuButton(label, postbackData, color) {
  return {
    type: 'button',
    style: 'primary',
    color: color,
    height: 'sm',
    margin: 'xs',
    action: {
      type: 'postback',
      label: label,
      data: postbackData,
      displayText: label,
    },
  };
}


// ============================================================
// 🧪 SECTION 6: Testing Functions
// ============================================================

/**
 * ทดสอบ Flex Message โดยส่งไปยัง LINE User ID ที่กำหนด
 * แก้ไข TEST_USER_ID ก่อนรัน
 */
function testFlexMessages() {
  const TEST_USER_ID = 'U_TEST_LINE_ID_HERE'; // ← แก้ไขตรงนี้

  // Mock data สำหรับทดสอบ
  const mockSubjects = [
    {
      Subject_Code:   'MATH101',
      Subject_Name:   'คณิตศาสตร์ ม.1/1',
      Teacher_ID:     'T001',
      Classroom:      'ห้อง 1/1',
      Period_Number:  '1',
      Period_Name:    'คาบที่ 1',
    },
    {
      Subject_Code:   'THAI101',
      Subject_Name:   'ภาษาไทย ม.1/1',
      Teacher_ID:     'T002',
      Classroom:      'ห้อง 1/1',
      Period_Number:  '2',
      Period_Name:    'คาบที่ 2',
    },
  ];

  const mockQrData = {
    Subject_Code:   'MATH101',
    Subject_Name:   'คณิตศาสตร์ ม.1/1',
    Teacher_ID:     'T001',
    Teacher_Name:   'อ.สมชาย ใจดี',
    Classroom:      'ห้อง 1/1',
    Period_Number:  '1',
    Period_Name:    'คาบที่ 1',
  };

  const mockTeacher = {
    Teacher_ID:   'T001',
    Teacher_Name: 'อ.สมชาย ใจดี',
    Department:   'คณิตศาสตร์',
  };

  const mockCheckinData = {
    teacherName:    'อ.สมชาย ใจดี',
    subjectName:    'คณิตศาสตร์ ม.1/1',
    classroom:      'ห้อง 1/1',
    periodName:     'คาบที่ 1',
    timeStart:      '08:15',
    timeEnd:        '09:05',
    teachingTopic:  'อสมการเชิงเส้นตัวแปรเดียว',
    assignment:     'แบบฝึกหัด 3.2 ข้อ 1-10',
    status:         SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME,
  };

  // ทดสอบ flexPeriodList
  try {
    const msg = flexPeriodList('ห้อง 1/1', mockSubjects);
    sendLineMessage(TEST_USER_ID, [msg]);
    logInfo('TEST_FLEX', '✅ flexPeriodList ส่งสำเร็จ');
  } catch (e) {
    logInfo('TEST_FLEX', '❌ flexPeriodList ERROR', e.message);
  }

  Utilities.sleep(1000);

  // ทดสอบ flexClassInfo
  try {
    const msg = flexClassInfo(mockQrData, mockTeacher);
    sendLineMessage(TEST_USER_ID, [msg]);
    logInfo('TEST_FLEX', '✅ flexClassInfo ส่งสำเร็จ');
  } catch (e) {
    logInfo('TEST_FLEX', '❌ flexClassInfo ERROR', e.message);
  }

  Utilities.sleep(1000);

  // ทดสอบ flexCheckinSuccess
  try {
    const msg = flexCheckinSuccess(mockCheckinData);
    sendLineMessage(TEST_USER_ID, [msg]);
    logInfo('TEST_FLEX', '✅ flexCheckinSuccess ส่งสำเร็จ');
  } catch (e) {
    logInfo('TEST_FLEX', '❌ flexCheckinSuccess ERROR', e.message);
  }
}