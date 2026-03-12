// ============================================================
// Config.gs — ค่าคงที่และ Helper Functions ของระบบทั้งหมด
// ระบบเช็คอินการเข้าสอนของครู
// โรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา)
//
// ⚠️  ไฟล์นี้ไม่มี CREDENTIALS ใด ๆ ทั้งสิ้น
//     ข้อมูลความลับทั้งหมดเก็บใน PropertiesService
//     ตั้งค่าครั้งแรกด้วยฟังก์ชัน setupCredentials()
//     ที่อยู่ใน Code.gs → SECTION 11
//
// สารบัญ:
//   SECTION 1 — ข้อมูลโรงเรียน (SCHOOL_CONFIG)
//   SECTION 2 — ตารางเวลาคาบเรียน (PERIODS)
//   SECTION 3 — ค่าตั้งค่าระบบ (SYSTEM_CONFIG)
//   SECTION 4 — ข้อความในระบบ (MESSAGES)
//   SECTION 5 — Design System สีและ Style (FLEX_COLORS)
//   SECTION 6 — Helper Functions
// ============================================================


// ============================================================
// 🏫 SECTION 1: ข้อมูลโรงเรียน
// ============================================================

/**
 * ข้อมูลโรงเรียนและภาคเรียนปัจจุบัน
 * แก้ไข SEMESTER_CURRENT ทุกต้นภาคเรียน
 */
const SCHOOL_CONFIG = {
  SCHOOL_NAME:      'โรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา)',
  SEMESTER_CURRENT: '1/2569', // ← อัปเดตทุกภาคเรียน
  ACADEMIC_YEAR:    '2569',

  // เวลาทำการของระบบ
  // นอกช่วงนี้ระบบยังทำงานได้ปกติ แต่ใช้สำหรับ Validation ใน Future Feature
  SCHOOL_DAY_START: '06:00',
  SCHOOL_DAY_END:   '18:00',
};


// ============================================================
// ⏰ SECTION 2: ตารางเวลาคาบเรียน (10 คาบ)
// ============================================================

/**
 * PERIODS — Array ของข้อมูลคาบเรียนทั้ง 10 คาบ
 *
 * แต่ละคาบมี:
 *   number    — หมายเลขคาบ (1-10) ใช้เป็น Key หลัก
 *   name      — ชื่อที่แสดงในระบบ
 *   start     — เวลาเริ่มต้น (HH:MM)
 *   end       — เวลาสิ้นสุด (HH:MM)
 *   alertTime — เวลาที่ระบบจะแจ้ง Admin ถ้าครูยังไม่เช็คอิน
 *               ปกติ = เวลาเริ่มคาบ + CHECKIN_GRACE_MINUTES
 *   note      — หมายเหตุ (optional)
 */
const PERIODS = [
  {
    number:    1,
    name:      'คาบที่ 1',
    start:     '08:15',
    end:       '09:05',
    alertTime: '08:30',
  },
  {
    number:    2,
    name:      'คาบที่ 2',
    start:     '09:05',
    end:       '09:55',
    alertTime: '09:20',
  },
  {
    number:    3,
    name:      'คาบที่ 3',
    start:     '09:55',
    end:       '10:45',
    alertTime: '10:10',
  },
  {
    number:    4,
    name:      'คาบที่ 4',
    start:     '10:45',
    end:       '11:35',
    alertTime: '11:00',
  },
  {
    number:    5,
    name:      'คาบที่ 5',
    start:     '11:35',
    end:       '12:25',
    alertTime: '11:50',
    note:      'พักกลางวัน ม.ต้น / เรียนปกติ ม.ปลาย',
  },
  {
    number:    6,
    name:      'คาบที่ 6',
    start:     '12:25',
    end:       '13:15',
    alertTime: '12:40',
    note:      'พักกลางวัน ม.ปลาย / เรียนปกติ ม.ต้น',
  },
  {
    number:    7,
    name:      'คาบที่ 7',
    start:     '13:15',
    end:       '14:05',
    alertTime: '13:30',
  },
  {
    number:    8,
    name:      'คาบที่ 8',
    start:     '14:05',
    end:       '14:55',
    alertTime: '14:20',
  },
  {
    number:    9,
    name:      'คาบที่ 9',
    start:     '14:55',
    end:       '15:45',
    alertTime: '15:10',
  },
  {
    number:    10,
    name:      'คาบที่ 10',
    start:     '15:45',
    end:       '16:35',
    alertTime: '16:00',
  },
];


// ============================================================
// ⚙️ SECTION 3: ค่าตั้งค่าระบบ (SYSTEM_CONFIG)
// ============================================================

/**
 * SYSTEM_CONFIG — ค่าคงที่ที่ใช้ทั่วทั้งระบบ
 *
 * ⚠️  อย่าแก้ไข QR_STATUS, CHECKIN_STATUS, USER_ROLE
 *     เพราะค่าเหล่านี้ถูกใช้เป็น String ใน Google Sheets ด้วย
 *     ถ้าแก้ไขต้องแก้ข้อมูลใน Sheets ด้วย
 */
const SYSTEM_CONFIG = {

  // --- QR Code Settings ---
  // อายุของ QR Token นับจากเวลาที่หัวหน้าห้องสร้าง (นาที)
  QR_TOKEN_EXPIRE_MINUTES: 30,

  // ช่วงเวลาอนุโลมการเช็คอินหลังคาบเริ่ม (นาที)
  // เช่น 15 = สแกนได้ภายใน 15 นาทีหลังคาบเริ่ม ถือว่า "ตรงเวลา"
  CHECKIN_GRACE_MINUTES: 15,

  // --- Conversation State Settings ---
  // อายุของ State ในระบบ Teacher Flow (วินาที)
  // ถ้าครูไม่ตอบภายในเวลานี้ State จะถูก Reset อัตโนมัติ
  STATE_CACHE_EXPIRE_SECONDS: 21600, // 360 นาที

  // --- ชื่อ Sheets ใน Google Spreadsheet ---
  // ⚠️  ต้องตรงกับชื่อ Sheet จริงทุกตัวอักษร รวมถึงช่องว่าง
  SHEETS: {
    TEACHERS:    'Teachers_Master',
    MONITORS:    'ClassMonitors_Master',
    SCHEDULE:    'Subjects_Schedule',
    QR_SESSIONS: 'QR_Sessions',
    CHECKIN_LOG: 'Teacher_CheckIn_Log',
    SETTINGS:    'Admin_Settings',
  },

  // --- QR Token Status ---
  QR_STATUS: {
    ACTIVE:  'Active',
    USED:    'Used',
    EXPIRED: 'Expired',
  },

  // --- Check-in Status (บันทึกลง Sheets) ---
  CHECKIN_STATUS: {
    ON_TIME: 'เข้าสอนตรงเวลา',
    LATE:    'เข้าสอนสาย',
  },

  // --- User Role ---
  USER_ROLE: {
    TEACHER:   'Teacher',
    MONITOR:   'Monitor',
    ADMIN:     'Admin',
    DUAL_ROLE: 'DualRole', // ← ใหม่: ครูที่มีสิทธิ์ทั้งสอน + สร้าง QR
    UNKNOWN:   'Unknown',
  },

  // --- Teacher State Machine ---
  // ค่าเหล่านี้ใช้ใน CacheService ไม่ได้บันทึกลง Sheets
  TEACHER_STATE: {
    IDLE:          'IDLE',
    SCANNED:       'SCANNED',        // สแกน QR แล้ว รอกดปุ่ม "เข้าสอน"
    WAITING_INPUT: 'WAITING_INPUT',  // รอรับ Topic + Assignment ในขั้นตอนเดียว
    CONFIRM:       'CONFIRM',
  },

  // Prefix ของ Cache Key เพื่อป้องกันชนกับ Key อื่น
  CACHE_KEY_PREFIX: 'tcheckin_state_',

  // Admin Mode Cache Key Prefix
  // ใช้แยก Cache Key ของ Admin Mode ออกจาก Teacher State Cache
  ADMIN_MODE_CACHE_KEY_PREFIX: 'admin_mode_',

  // โหมดการทำงานของ Super Admin
  // เก็บใน ScriptCache ตาม userId แต่ละคน
  ADMIN_MODE: {
    NONE:    'NONE',     // ยังไม่ได้เลือกโหมด → แสดงเมนูเลือกโหมด
    REPORT:  'REPORT',   // โหมดรายงาน (Admin ปกติ)
    TEACHER: 'TEACHER',  // โหมดครูผู้สอน (เช็คอิน)
    MONITOR: 'MONITOR',  // โหมดหัวหน้าห้อง (สร้าง QR ทุกห้อง)
  },

  // --- ประเภทผู้สร้าง QR (ตรงกับ Column Creator_Type ใน ClassMonitors_Master) ---
  CREATOR_TYPE: {
    STUDENT: 'Student',   // นักเรียนหัวหน้าห้อง — เห็นเฉพาะห้องตัวเอง
    TEACHER: 'Teacher',   // หัวหน้าระดับชั้น — เห็นทุกห้องในระดับตัวเอง
    STAFF:   'Staff',     // บุคลากรงานทะเบียน — เห็นทุกห้อง
    ADMIN:   'Admin',     // ผู้บริหาร — เห็นทุกห้อง
  },

  // Scope พิเศษ — เห็นตารางทุกห้องในวันนั้น
  SCOPE_ALL: 'ALL',
};


// ============================================================
// 💬 SECTION 4: ข้อความในระบบ (MESSAGES)
// ============================================================

/**
 * MESSAGES — ข้อความทั้งหมดที่ส่งออกไปหาผู้ใช้
 *
 * หมายเหตุ: LINE ไม่รองรับ Markdown ทุกรูปแบบ
 * ใช้ Emoji + ขึ้นบรรทัดใหม่เพื่อจัดรูปแบบแทน
 */
const MESSAGES = {

  // --- ต้อนรับ ---
  WELCOME_UNKNOWN:
    'สวัสดีค่ะ 🙏\n\n' +
    'ป้าไพรขออภัยด้วยนะคะ\n' +
    'ยังไม่พบข้อมูลของคุณในระบบค่ะ\n\n' +
    'กรุณาติดต่อฝ่ายวิชาการ\n' +
    'เพื่อลงทะเบียนเข้าใช้งานนะคะ 🙏',

  WELCOME_TEACHER: (name) =>
    `สวัสดีค่ะ ${name} 🙏\n` +
    `ป้าไพรยินดีต้อนรับนะคะ ✅\n\n` +
    `พิมพ์ /help เพื่อดูวิธีใช้งานได้เลยค่ะ 😊`,

  WELCOME_MONITOR: (name, classroom) =>
    `สวัสดีค่ะ ${name} 🙏\n` +
    `ป้าไพรยินดีต้อนรับนะคะ ✅\n\n` +
    `คุณคือหัวหน้าห้อง ${classroom} ค่ะ\n` +
    `พิมพ์ /help เพื่อดูวิธีใช้งานได้เลยค่ะ 😊`,

  WELCOME_ADMIN:
    'สวัสดีค่ะ 🙏\n\n' +
    'ป้าไพรยินดีต้อนรับ Admin ฝ่ายวิชาการนะคะ\n' +
    'พิมพ์ /help เพื่อดูคำสั่งทั้งหมดได้เลยค่ะ 😊',

  // --- QR Code ---
  QR_CREATING:
    '⏳ ป้าไพรกำลังสร้าง QR Code ให้นะคะ\n' +
    'รอสักครู่เดียวค่ะ...',

  QR_SUCCESS: (periodLabel, expireMinutes) =>
    `✅ ป้าไพรสร้าง QR Code เรียบร้อยแล้วนะคะ!\n\n` +
    `📌 ${periodLabel}\n` +
    `⏱️ QR Code หมดอายุใน ${expireMinutes} นาทีค่ะ\n\n` +
    `📲 แสดง QR Code นี้ให้ครูผู้สอนสแกนได้เลยนะคะ 😊`,

  QR_EXPIRED:
    'ป้าไพรขอโทษด้วยนะคะ 😅\n\n' +
    '⏰ QR Code นี้หมดอายุแล้วค่ะ\n\n' +
    'ขอให้หัวหน้าห้องสร้าง QR Code ใหม่\n' +
    'อีกครั้งได้เลยนะคะ 🙏',

  QR_USED:
    'ป้าไพรขอโทษด้วยนะคะ 😅\n\n' +
    '⚠️ QR Code นี้ถูกใช้งานแล้วค่ะ\n\n' +
    'ขอให้หัวหน้าห้องสร้าง QR Code ใหม่\n' +
    'อีกครั้งได้เลยนะคะ 🙏',

  QR_INVALID:
    'ป้าไพรขอโทษด้วยนะคะ 😅\n\n' +
    '❌ ไม่พบข้อมูล QR Code ค่ะ\n\n' +
    'ขอให้หัวหน้าห้องสร้าง QR Code ใหม่\n' +
    'แล้วลองสแกนอีกครั้งนะคะ 🙏',

  QR_WRONG_TEACHER:
    'ป้าไพรขอโทษด้วยนะคะ 😅\n\n' +
    '⚠️ QR Code นี้ไม่ใช่วิชาของคุณค่ะ\n\n' +
    'กรุณาสแกน QR Code ที่ตรงกับ\n' +
    'วิชาที่คุณสอนนะคะ 🙏',

  QR_DUPLICATE_ACTIVE: (periodName, expireMinutes) =>
    `ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n` +
    `⚠️ มี QR Code ที่ยังใช้งานได้อยู่แล้ว\n` +
    `สำหรับ ${periodName} ค่ะ\n\n` +
    `กรุณารอให้ QR เดิมหมดอายุก่อนนะคะ\n` +
    `(อีกประมาณ ${expireMinutes} นาที)\n\n` +
    `หากมีปัญหา ติดต่อฝ่ายวิชาการได้เลยค่ะ 🙏`,

  // --- Teacher Check-in Flow ---
  CHECKIN_SUCCESS: (teacherName, subjectName, periodName) =>
    `🎉 ป้าไพรบันทึกการเข้าสอนเรียบร้อยแล้วนะคะ!\n\n` +
    `👩‍🏫 ${teacherName}\n` +
    `📚 ${subjectName}\n` +
    `🕐 ${periodName}\n\n` +
    `ขอบคุณนะคะ 🙏 สอนได้ดีนะคะ 😊`,

  REMIND_TYPE_INPUT:
    'ป้าไพรรอรับข้อมูลอยู่นะคะ 😊\n\n' +
    '📝 กรุณาพิมพ์ "เรื่องที่สอน" ในคาบนี้\n' +
    'หรือเรื่องที่สอน | งานมอบหมาย\n\n' +
    'ตัวอย่าง:\n' +
    'อสมการเชิงเส้น\n' +
    'หรือ: อสมการเชิงเส้น | แบบฝึกหัด 3.2\n\n' +
    'หรือกดปุ่ม "ไม่มีงานมอบหมาย" ด้านล่างนะคะ 🙏',

  REMIND_USE_BUTTON:
    'ป้าไพรรอการยืนยันอยู่นะคะ 😊\n\n' +
    '👆 กรุณากดปุ่ม "ยืนยันเช็คอิน" หรือ "แก้ไข"\n' +
    'ในการ์ดด้านบนนะคะ 🙏',

  CANCEL_CHECKIN:
    'รับทราบค่ะ 😊\n\n' +
    '❌ ป้าไพรยกเลิกการเช็คอินแล้วนะคะ\n\n' +
    'สแกน QR Code ใหม่ได้เลยเมื่อพร้อมค่ะ 🙏',

  EDIT_CHECKIN:
    'ได้เลยค่ะ ✏️ ป้าไพรรอข้อมูลใหม่นะคะ\n\n',

  // --- Monitor Flow ---
  LOADING_SCHEDULE: (classroom) =>
    `⏳ ป้าไพรกำลังดึงตารางสอนของ ${classroom} ให้นะคะ\n` +
    `รอสักครู่เดียวค่ะ...`,

  CANCEL_QR:
    'รับทราบค่ะ 😊\n\n' +
    '❌ ป้าไพรยกเลิกการสร้าง QR Code แล้วนะคะ\n\n' +
    'กดปุ่ม "สร้าง QR คาบเรียน" เพื่อเริ่มใหม่\n' +
    'ได้เลยนะคะ 🙏',

  MONITOR_CHECKIN_NOTIFY: (teacherName, subjectName) =>
    `ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n` +
    `✅ ครูเช็คอินแล้วค่ะ!\n\n` +
    `👩‍🏫 ${teacherName}\n` +
    `📚 ${subjectName}`,

  // --- Admin Flow ---
  ADMIN_LOADING_TODAY:
    '⏳ ป้าไพรกำลังดึงข้อมูลสรุปวันนี้ให้นะคะ\n' +
    'รอสักครู่เดียวค่ะ...',

  ADMIN_LOADING_DETAIL:
    '⏳ ป้าไพรกำลังดึงรายละเอียดให้นะคะ\n' +
    'รอสักครู่เดียวค่ะ...',

  ADMIN_LOADING_WEEKLY:
    '⏳ ป้าไพรกำลังสรุปข้อมูล 7 วันย้อนหลังให้นะคะ\n' +
    'รอสักครู่เดียวค่ะ...',

  ADMIN_NO_CHECKIN_TODAY: (dateStr) =>
    `ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n` +
    `📋 ยังไม่มีการเช็คอินในวันนี้ค่ะ\n\n` +
    `📅 ${dateStr}`,

  ADMIN_NO_WEEKLY_DATA:
    'ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n' +
    '📅 ไม่พบข้อมูลการเช็คอินใน 7 วันที่ผ่านมาค่ะ',

  ADMIN_MORE_REPORT:
    'ต้องการดูรายงานเพิ่มเติมไหมคะ? 📊\n' +
    'ป้าไพรยินดีช่วยเลยนะคะ 😊',

  ADMIN_QUICK_MENU:
    'หรือกดปุ่มด้านล่างเพื่อใช้งานได้เลยนะคะ 👇',

  ADMIN_NEW_USER_NOTIFY: (newUserId) =>
    `ป้าไพรขอแจ้ง Admin ให้ทราบนะคะ 📢\n\n` +
    `มีผู้ใช้ใหม่ Add Bot เข้ามาค่ะ\n\n` +
    `LINE User ID:\n${newUserId}\n\n` +
    `กรุณาตรวจสอบและลงทะเบียน\n` +
    `ใน Google Sheets ด้วยนะคะ 📋`,

  // --- Check-in / Teaching Flow ---
  // --- Combined Input Flow ---
  ASK_COMBINED_INPUT:
    '📝 ป้าไพรขอข้อมูลการสอนนะคะ\n\n' +
    'พิมพ์ในรูปแบบใดก็ได้ค่ะ:\n\n' +
    '✏️ แบบที่ 1 — บรรทัดเดียว (ไม่มีงาน):\n' +
    'อสมการเชิงเส้น\n\n' +
    '✏️ แบบที่ 2 — สองบรรทัด:\n' +
    'อสมการเชิงเส้น\n' +
    'แบบฝึกหัด 3.2 ข้อ 1-10\n\n' +
    '✏️ แบบที่ 3 — คั่นด้วย | :\n' +
    'อสมการเชิงเส้น | แบบฝึกหัด 3.2\n\n' +
    'หรือกดปุ่ม "ไม่มีงาน" ด้านล่างได้เลยค่ะ 👇',

  REMIND_PRESS_TEACHING_BUTTON:
    'ป้าไพรรออยู่นะคะ 😊\n\n' +
    '👆 กรุณากดปุ่ม "✅ เข้าสอน" หรือ "❌ ยกเลิก"\n' +
    'ในการ์ดด้านบนนะคะ 🙏',

  // --- Error / System ---
  ERROR_GENERAL:
    'ป้าไพรขอโทษด้วยนะคะ 🙏\n\n' +
    '❌ เกิดข้อผิดพลาดบางอย่างค่ะ\n\n' +
    'กรุณาลองใหม่อีกครั้ง\n' +
    'หรือติดต่อฝ่ายวิชาการได้เลยนะคะ 🙏',

  ERROR_NO_SCHEDULE:
    'ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n' +
    '📅 ไม่พบตารางสอนสำหรับห้องนี้ในวันนี้ค่ะ\n\n' +
    'กรุณาตรวจสอบตารางสอนกับฝ่ายวิชาการ\n' +
    'อีกครั้งนะคะ 🙏',

  ERROR_ALREADY_CHECKIN:
    'ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n' +
    '⚠️ ป้าไพรพบว่าคุณเช็คอินคาบนี้แล้วค่ะ\n\n' +
    'หากมีปัญหา กรุณาติดต่อฝ่ายวิชาการ\n' +
    'ได้เลยนะคะ 🙏',

  SESSION_TIMEOUT:
    'ป้าไพรขอโทษด้วยนะคะ 🙏\n\n' +
    '⏰ หมดเวลาการกรอกข้อมูลแล้วค่ะ\n\n' +
    'กรุณาสแกน QR Code ใหม่\n' +
    'อีกครั้งได้เลยนะคะ 😊',

  UNKNOWN_USER: (userId) =>
    `สวัสดีค่ะ 🙏\n\n` +
    `ป้าไพรยังไม่พบข้อมูลของคุณในระบบค่ะ\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 LINE User ID ของคุณ:\n` +
    `${userId}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `กรุณาแจ้ง ID นี้ให้ฝ่ายวิชาการ\n` +
    `เพื่อลงทะเบียนเข้าใช้งานนะคะ 🙏`,

  NOT_REGISTERED_CHECKIN:
    'ป้าไพรขอโทษด้วยนะคะ 🙏\n\n' +
    '⚠️ คุณยังไม่ได้ลงทะเบียนในระบบค่ะ\n\n' +
    'กรุณาติดต่อฝ่ายวิชาการเพื่อลงทะเบียน\n' +
    'ก่อนใช้งานนะคะ 🙏',

  // --- Registration ---
  REG_USAGE:
    'ป้าไพรยินดีช่วยลงทะเบียนนะคะ 😊\n\n' +
    '📋 วิธีลงทะเบียน:\n\n' +
    'พิมพ์ /reg ตามด้วยชื่อของคุณค่ะ\n\n' +
    'ตัวอย่าง:\n' +
    '• /reg สมชาย\n' +
    '• /reg วิทยา\n' +
    '• /reg สมศรี ใจดี',

  REG_SEARCHING: (keyword) =>
    `⏳ ป้าไพรกำลังค้นหา "${keyword}" ในระบบนะคะ\n` +
    `รอสักครู่เดียวค่ะ...`,

  REG_NOT_FOUND: (keyword) =>
    `ป้าไพรขอโทษด้วยนะคะ 🙏\n\n` +
    `❌ ไม่พบชื่อที่ตรงกับ "${keyword}" ค่ะ\n\n` +
    `กรุณาลองใหม่ด้วยชื่อจริงของคุณ\n` +
    `หรือติดต่อฝ่ายวิชาการเพื่อตรวจสอบนะคะ 🙏`,

  REG_ALREADY_REGISTERED:
    'ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n' +
    '⚠️ บัญชีนี้ลงทะเบียนในระบบแล้วค่ะ\n\n' +
    'หากพบปัญหา กรุณาติดต่อฝ่ายวิชาการ\n' +
    'ได้เลยนะคะ 🙏',

  REG_TEACHER_TAKEN: (name) =>
    `ป้าไพรขอแจ้งให้ทราบนะคะ 🙏\n\n` +
    `⚠️ "${name}" ลงทะเบียนด้วยบัญชีอื่นไปแล้วค่ะ\n\n` +
    `ถ้าเป็นชื่อของคุณจริง\n` +
    `กรุณาติดต่อฝ่ายวิชาการได้เลยนะคะ 🙏`,

  REG_SUCCESS: (name) =>
    `🎉 ป้าไพรลงทะเบียนให้เรียบร้อยแล้วนะคะ!\n\n` +
    `ยินดีต้อนรับ ${name} ค่ะ 🙏\n` +
    `ระบบเช็คอินพร้อมใช้งานแล้วค่ะ ✅\n\n` +
    `พิมพ์ /help เพื่อดูวิธีใช้งาน\n` +
    `ได้เลยนะคะ 😊`,

  REG_ADMIN_NOTIFY: (teacherName, userId) =>
    `ป้าไพรขอแจ้ง Admin ให้ทราบนะคะ 📢\n\n` +
    `✅ ครูลงทะเบียนใหม่แล้วค่ะ!\n\n` +
    `👩‍🏫 ${teacherName}\n` +
    `🆔 ${userId}`,

    // --- Registration QR Creator ---
  REG_QR_USAGE:
    'ป้าไพรยินดีช่วยลงทะเบียนนะคะ 😊\n\n' +
    '📋 วิธีลงทะเบียนสำหรับผู้สร้าง QR:\n\n' +
    'พิมพ์ /reg-qr ตามด้วยชื่อของคุณค่ะ\n\n' +
    'ตัวอย่าง:\n' +
    '• /reg-qr สมชาย\n' +
    '• /reg-qr วิทยา\n' +
    '• /reg-qr สมศรี ใจดี\n\n' +
    '💡 หมายเหตุ:\n' +
    'คำสั่งนี้สำหรับผู้ที่มีสิทธิ์สร้าง QR\n' +
    'เช่น หัวหน้าห้อง หัวหน้าระดับ\n' +
    'และบุคลากรงานทะเบียนค่ะ',

  REG_QR_SEARCHING: (keyword) =>
    `⏳ ป้าไพรกำลังค้นหา "${keyword}" ในระบบนะคะ\n` +
    `รอสักครู่เดียวค่ะ...`,

  REG_QR_NOT_FOUND: (keyword) =>
    `ป้าไพรขอโทษด้วยนะคะ 🙏\n\n` +
    `❌ ไม่พบชื่อที่ตรงกับ "${keyword}" ในระบบค่ะ\n\n` +
    `กรุณาตรวจสอบ:\n` +
    `• ชื่อที่พิมพ์ถูกต้องหรือไม่?\n` +
    `• ท่านได้รับสิทธิ์สร้าง QR แล้วหรือยัง?\n\n` +
    `หากมีปัญหา ติดต่อฝ่ายวิชาการ\n` +
    `ได้เลยนะคะ 🙏`,

  REG_QR_ALREADY_REGISTERED:
    'ป้าไพรขอแจ้งให้ทราบนะคะ 😊\n\n' +
    '⚠️ บัญชีนี้ลงทะเบียนในระบบแล้วค่ะ\n\n' +
    'หากพบปัญหา กรุณาติดต่อฝ่ายวิชาการ\n' +
    'ได้เลยนะคะ 🙏',

  REG_QR_MONITOR_TAKEN: (name) =>
    `ป้าไพรขอแจ้งให้ทราบนะคะ 🙏\n\n` +
    `⚠️ "${name}" ลงทะเบียนด้วยบัญชีอื่นไปแล้วค่ะ\n\n` +
    `ถ้าเป็นชื่อของคุณจริง\n` +
    `กรุณาติดต่อฝ่ายวิชาการได้เลยนะคะ 🙏`,

  REG_QR_SUCCESS: (name, scopeLabel) =>
    `🎉 ป้าไพรลงทะเบียนให้เรียบร้อยแล้วนะคะ!\n\n` +
    `ยินดีต้อนรับ ${name} ค่ะ 🙏\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 สิทธิ์ของคุณ:\n` +
    `สร้าง QR สำหรับ ${scopeLabel}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `พิมพ์ /help เพื่อดูวิธีใช้งาน\n` +
    `ได้เลยนะคะ 😊`,

  REG_QR_ADMIN_NOTIFY: (monitorName, creatorType, scopeLabel, userId) =>
    `ป้าไพรขอแจ้ง Admin ให้ทราบนะคะ 📢\n\n` +
    `✅ ผู้สร้าง QR ลงทะเบียนใหม่แล้วค่ะ!\n\n` +
    `👤 ${monitorName}\n` +
    `🏷️ ประเภท: ${creatorType}\n` +
    `📌 ขอบเขต: ${scopeLabel}\n` +
    `🆔 ${userId}`,
  
  // --- Super Admin Mode Switching ---
  ADMIN_MODE_PROMPT:
    'ป้าไพรยินดีต้อนรับนะคะ 👔\n\n' +
    'วันนี้ต้องการทำอะไรก่อนคะ?\n' +
    'กดเลือกโหมดการทำงานได้เลยนะคะ 😊',

  ADMIN_MODE_TEACHER_ENTER: (name) =>
    `✅ เข้าสู่โหมดครูผู้สอนแล้วนะคะ\n\n` +
    `👩‍🏫 ${name}\n\n` +
    `📲 สแกน QR Code จากหัวหน้าห้อง\n` +
    `เพื่อเช็คอินได้เลยค่ะ 😊\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💡 พิมพ์ "เมนู" เพื่อกลับ\n` +
    `เมนูหลัก Admin ได้เลยนะคะ`,

  ADMIN_MODE_MONITOR_ENTER:
    '✅ เข้าสู่โหมดสร้าง QR แล้วนะคะ\n\n' +
    '📲 คุณมีสิทธิ์สร้าง QR ได้ทุกห้องเรียนค่ะ\n\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '💡 พิมพ์ "เมนู" เพื่อกลับ\n' +
    'เมนูหลัก Admin ได้เลยนะคะ',

  ADMIN_MODE_REPORT_ENTER:
    '✅ เข้าสู่โหมดรายงานแล้วนะคะ\n\n' +
    '📊 กดปุ่มด้านล่างเพื่อดูรายงานได้เลยค่ะ\n\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '💡 พิมพ์ "เมนู" เพื่อกลับ\n' +
    'เมนูหลัก Admin ได้เลยนะคะ',

  ADMIN_MODE_EXIT:
    '✅ กลับสู่เมนูหลัก Admin แล้วนะคะ 😊',

  ADMIN_NO_TEACHER_PROFILE:
    'ป้าไพรขอโทษด้วยนะคะ 🙏\n\n' +
    '⚠️ ยังไม่พบข้อมูลครูของคุณในระบบค่ะ\n\n' +
    'กรุณาลงทะเบียนในฐานะครูก่อนนะคะ:\n' +
    'พิมพ์  /reg ชื่อของคุณ\n' +
    'เช่น   /reg สมชาย\n\n' +
    'หรือให้ผู้ดูแลเพิ่มข้อมูลใน\n' +
    'Teachers_Master Sheet ได้เลยค่ะ 🙏',
  
  // --- Dual-Role Teacher (หัวหน้าระดับชั้น) ---
  DUAL_ROLE_MODE_PROMPT:
    'ป้าไพรยินดีต้อนรับนะคะ 👋\n\n' +
    'วันนี้ต้องการทำอะไรก่อนคะ?\n' +
    'กดเลือกโหมดการทำงานได้เลยนะคะ 😊',

  DUAL_ROLE_MODE_TEACHER_ENTER: (name) =>
    `✅ เข้าสู่โหมดครูผู้สอนแล้วนะคะ\n\n` +
    `👩‍🏫 ${name}\n\n` +
    `📲 สแกน QR Code จากหัวหน้าห้อง\n` +
    `เพื่อเช็คอินได้เลยค่ะ 😊\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💡 พิมพ์ "เมนู" เพื่อกลับ\n` +
    `เมนูเลือกโหมดได้เลยนะคะ`,

  DUAL_ROLE_MODE_MONITOR_ENTER: (scopeLabel) =>
    `✅ เข้าสู่โหมดสร้าง QR แล้วนะคะ\n\n` +
    `📌 ขอบเขต: ${scopeLabel}\n\n` +
    `📲 กดปุ่ม "สร้าง QR คาบเรียน"\n` +
    `เพื่อสร้าง QR ให้ครูสแกนได้เลยค่ะ 😊\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💡 พิมพ์ "เมนู" เพื่อกลับ\n` +
    `เมนูเลือกโหมดได้เลยนะคะ`,

  DUAL_ROLE_MODE_EXIT:
    '✅ กลับสู่เมนูเลือกโหมดแล้วนะคะ 😊',
};


// ============================================================
// 🎨 SECTION 5: Design System — สีและ Style (FLEX_COLORS)
// ============================================================

/**
 * FLEX_COLORS — ค่าสีมาตรฐานสำหรับ Flex Messages ทั้งหมด
 * เปลี่ยนที่นี่ที่เดียว มีผลกับทุก Card ในระบบ
 */
const FLEX_COLORS = {
  PRIMARY:   '#1DB954', // เขียว — ปุ่มหลัก, สำเร็จ, ตรงเวลา
  SECONDARY: '#0D47A1', // น้ำเงินเข้ม — Header Card
  ACCENT:    '#FF6B35', // ส้ม — คาบเรียน, จุดสำคัญ
  WARNING:   '#FFA000', // เหลือง — เตือน, สาย
  DANGER:    '#D32F2F', // แดง — Error, หมดอายุ
  NEUTRAL:   '#546E7A', // เทาน้ำเงิน — ข้อความรอง
  LIGHT_BG:  '#F5F5F5', // พื้นหลังอ่อน — กล่องข้อมูล
  WHITE:     '#FFFFFF',
  TEXT_MAIN: '#212121', // ข้อความหลัก
  TEXT_SUB:  '#757575', // ข้อความรอง
};


// ============================================================
// 🛠️ SECTION 6: Helper Functions
// ============================================================

// ------------------------------------------------------------
// 6A: เวลาและคาบเรียน
// ------------------------------------------------------------

/**
 * หาข้อมูลคาบปัจจุบันจากเวลาขณะนั้น
 * ใช้ Timezone Asia/Bangkok ทุกครั้ง
 *
 * @returns {Object|null} Object คาบเรียน หรือ null ถ้าไม่อยู่ในช่วงเรียน
 */
function getCurrentPeriod() {
  const now        = new Date();
  const hours      = now.getHours();
  const minutes    = now.getMinutes();
  const nowMinutes = hours * 60 + minutes;

  for (const period of PERIODS) {
    const [startH, startM] = period.start.split(':').map(Number);
    const [endH,   endM]   = period.end.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal   = endH   * 60 + endM;

    if (nowMinutes >= startTotal && nowMinutes < endTotal) {
      return period;
    }
  }
  return null;
}


/**
 * หาข้อมูลคาบจากหมายเลขคาบ
 *
 * @param {number} periodNumber - หมายเลขคาบ (1-10)
 * @returns {Object|null} Object คาบเรียน หรือ null ถ้าไม่พบ
 */
function getPeriodByNumber(periodNumber) {
  return PERIODS.find(p => p.number === Number(periodNumber)) || null;
}


/**
 * สร้าง Label แสดงช่วงคาบ
 * คาบเดี่ยว   → "คาบที่ 1"
 * คาบต่อเนื่อง → "คาบที่ 1–2"
 *
 * @param {string} periodName        - ชื่อคาบจาก PERIODS หรือ Schedule ("คาบที่ 1")
 * @param {number} periodEndNumber   - หมายเลขคาบสุดท้าย
 * @param {number} periodStartNumber - หมายเลขคาบแรก
 * @returns {string}
 */
function buildPeriodLabel(periodName, periodEndNumber, periodStartNumber) {
  const start = Number(periodStartNumber);
  const end   = Number(periodEndNumber);
  if (!end || end === start) return periodName || `คาบที่ ${start}`;
  return `คาบที่ ${start}–${end}`;
}


/**
 * แปลงชื่อวันในสัปดาห์เป็นภาษาไทย
 * ใช้ Query ตารางสอนใน Subjects_Schedule
 *
 * @returns {string} ชื่อวันภาษาไทย เช่น "จันทร์" "อังคาร"
 */
function getTodayDayName() {
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  return days[new Date().getDay()];
}


/**
 * Format วันที่เป็นภาษาไทยแบบเต็ม
 * พร้อมปีพุทธศักราช
 *
 * @param {Date} date - วันที่ (default: วันนี้)
 * @returns {string} เช่น "จันทร์ที่ 15 มีนาคม 2567"
 */
function formatThaiDate(date) {
  const days   = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  const d            = date || new Date();
  const buddhistYear = d.getFullYear() + 543;
  return `${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${buddhistYear}`;
}


// ------------------------------------------------------------
// 6B: QR Token
// ------------------------------------------------------------

/**
 * สร้าง QR Token แบบสุ่มที่ไม่ซ้ำกัน
 * รูปแบบ: [12 ตัวอักษรสุ่ม][Timestamp Base36 ตัวพิมพ์ใหญ่]
 * ตัวอย่าง: "aB3xYzQ1mNpK1HXK5W8"
 *
 * @returns {string} Token ความยาว 18-20 ตัวอักษร
 */
function generateQRToken() {
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let   token  = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // ต่อท้ายด้วย Timestamp Base36 เพื่อการันตีความไม่ซ้ำ
  token += Date.now().toString(36).toUpperCase();
  return token;
}


/**
 * คำนวณเวลาหมดอายุของ QR Token
 *
 * @returns {Date} เวลาหมดอายุ
 */
function getQRExpireTime() {
  const expire = new Date();
  expire.setMinutes(expire.getMinutes() + SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES);
  return expire;
}


/**
 * ตรวจสอบว่า QR Token หมดอายุแล้วหรือไม่
 *
 * @param {string|Date} expireTimeStr - เวลาหมดอายุ
 * @returns {boolean} true = หมดอายุแล้ว
 */
function isQRExpired(expireTimeStr) {
  if (!expireTimeStr) return true;
  return new Date() > new Date(expireTimeStr);
}


// ------------------------------------------------------------
// 6C: Postback Data
// ------------------------------------------------------------

/**
 * แปลง Postback Data String เป็น Object
 *
 * Input:  "action=create_qr&period=1&classroom=ห้อง 1/1"
 * Output: { action: "create_qr", period: "1", classroom: "ห้อง 1/1" }
 *
 * หมายเหตุ: ฟังก์ชันนี้อยู่ใน Config.gs เพื่อให้ทุก Handler
 * เรียกใช้ได้โดยไม่ต้องพึ่งพาไฟล์อื่น
 *
 * @param {string} dataString - Postback data string จาก LINE
 * @returns {Object} Object ของ key-value pairs
 */
function parsePostbackData(dataString) {
  const result = {};
  if (!dataString) return result;

  dataString.split('&').forEach(pair => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) return;
    const key   = pair.substring(0, eqIndex);
    const value = pair.substring(eqIndex + 1);
    // decode เฉพาะ value ที่ถูก encode มา
    result[key] = decodeURIComponent(value);
  });

  return result;
}


// ------------------------------------------------------------
// 6D: Array Utility
// ------------------------------------------------------------

/**
 * แบ่ง Array เป็น Chunks ขนาดที่กำหนด
 * ใช้แบ่ง LINE Messages ที่เกิน 5 รายการต่อ Request
 *
 * @param {Array}  array     - Array ต้นฉบับ
 * @param {number} chunkSize - ขนาด Chunk (LINE รองรับสูงสุด 5)
 * @returns {Array<Array>}
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}


// ------------------------------------------------------------
// 6E: Logging
// ------------------------------------------------------------

/**
 * บันทึก Log พร้อม Timestamp และ Tag
 * ใช้แทน console.log ทั่วทั้งระบบเพื่อให้ Format สม่ำเสมอ
 * ดู Log ได้จาก GAS Editor → Executions
 *
 * @param {string} tag     - หมวดหมู่ เช่น 'Router', 'SheetManager'
 * @param {string} message - ข้อความ Log
 * @param {*}      data    - ข้อมูลเพิ่มเติม (optional)
 */
function logInfo(tag, message, data) {
  const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const logMsg    = `[${timestamp}] [${tag}] ${message}`;
  if (data !== undefined) {
    console.log(logMsg, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(logMsg);
  }
}


// ------------------------------------------------------------
// 6F: Web App URL
// ------------------------------------------------------------

/**
 * ดึง GAS Web App URL ปัจจุบัน
 * ใช้สร้าง Callback URL สำหรับ QR Code
 *
 * @returns {string} URL ของ Deployed Web App
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
