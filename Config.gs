// ============================================================
// Config.gs — ไฟล์ตั้งค่าระบบทั้งหมด
// ระบบเช็คอินการเข้าสอนของครู โรงเรียนสาธิตมหาวิทยาลัยศิลปากร
// 
// วิธีใช้: แก้ไขค่าใน SCHOOL_CONFIG และ CREDENTIALS ด้านล่าง
//          แล้ว Deploy ใหม่ทุกครั้งที่มีการเปลี่ยนแปลง
// ============================================================


// ============================================================
// 🔐 SECTION 1: ข้อมูล Credentials (แก้ไขก่อนใช้งาน)
// ============================================================
const CREDENTIALS = {

  // --- LINE Bot ---
  // หาได้จาก: LINE Developers Console > Channel > Messaging API
  LINE_CHANNEL_ACCESS_TOKEN: 'YOUR_CHANNEL_ACCESS_TOKEN_HERE',
  LINE_CHANNEL_SECRET:       'YOUR_CHANNEL_SECRET_HERE',

  // --- Google Sheets ---
  // หาได้จาก: URL ของ Google Sheets ระหว่าง /d/ และ /edit
  // ตัวอย่าง: https://docs.google.com/spreadsheets/d/[ID อยู่ตรงนี้]/edit
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',

  // --- LINE User ID ของ Admin ฝ่ายวิชาการ ---
  // หาได้จาก: ให้ Admin ส่งข้อความมาที่ Bot แล้วดู Log ใน GAS
  // สามารถใส่ได้มากกว่า 1 คน โดยเพิ่มใน Array
  ADMIN_LINE_IDS: [
    'U_ADMIN_LINE_ID_1_HERE',  // หัวหน้าฝ่ายวิชาการ
    // 'U_ADMIN_LINE_ID_2_HERE', // เพิ่มได้ถ้ามีหลายคน
  ],
};


// ============================================================
// 🏫 SECTION 2: ข้อมูลโรงเรียน
// ============================================================
const SCHOOL_CONFIG = {
  SCHOOL_NAME:       'โรงเรียนสาธิตมหาวิทยาลัยศิลปากร (มัธยม)',
  SEMESTER_CURRENT:  '2/2567',  // อัปเดตทุกภาคเรียน
  ACADEMIC_YEAR:     '2567',
  
  // เวลาทำการของระบบ (ก่อนและหลังเวลานี้ QR จะไม่สามารถสร้างได้)
  SCHOOL_DAY_START:  '07:30',
  SCHOOL_DAY_END:    '17:00',
};


// ============================================================
// ⏰ SECTION 3: ตารางเวลาคาบเรียน (10 คาบ)
// ============================================================
const PERIODS = [
  // index 0 = คาบที่ 1
  { 
    number:    1, 
    name:      'คาบที่ 1', 
    start:     '08:15', 
    end:       '09:05',
    // เวลา Trigger แจ้ง Admin = เริ่มคาบ + CHECKIN_GRACE_MINUTES
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
// ⚙️ SECTION 4: ค่าตั้งค่าระบบ
// ============================================================
const SYSTEM_CONFIG = {

  // --- QR Code ---
  // อายุของ QR Token (นาที) นับจากเวลาที่หัวหน้าห้องสร้าง
  QR_TOKEN_EXPIRE_MINUTES: 30,

  // ช่วงเวลาที่อนุญาตให้เช็คอินได้ (นาที) หลังจากคาบเริ่มต้น
  // เช่น 15 = เช็คอินได้ภายใน 15 นาทีหลังคาบเริ่ม
  CHECKIN_GRACE_MINUTES: 15,

  // --- Conversation State ---
  // อายุของ State ที่เก็บไว้ใน Cache (วินาที)
  // ถ้าครูไม่ตอบภายในเวลานี้ State จะถูกรีเซ็ต
  STATE_CACHE_EXPIRE_SECONDS: 600, // 10 นาที

  // --- ชื่อ Sheets ใน Google Sheets ---
  // ⚠️ ต้องตรงกับชื่อ Sheet จริงทุกตัวอักษร
  SHEETS: {
    TEACHERS:       'Teachers_Master',
    MONITORS:       'ClassMonitors_Master',
    SCHEDULE:       'Subjects_Schedule',
    QR_SESSIONS:    'QR_Sessions',
    CHECKIN_LOG:    'Teacher_CheckIn_Log',
    SETTINGS:       'Admin_Settings',
  },

  // --- Status Values ---
  // ค่า Status ที่ใช้ในระบบ (อย่าแก้ไขถ้าไม่จำเป็น)
  QR_STATUS: {
    ACTIVE:  'Active',
    USED:    'Used',
    EXPIRED: 'Expired',
  },

  CHECKIN_STATUS: {
    ON_TIME: 'เข้าสอนตรงเวลา',
    LATE:    'เข้าสอนสาย',
  },

  USER_ROLE: {
    TEACHER:  'Teacher',
    MONITOR:  'Monitor',
    ADMIN:    'Admin',
    UNKNOWN:  'Unknown',
  },
};


// ============================================================
// 💬 SECTION 5: ข้อความในระบบ (แก้ไขได้ตามต้องการ)
// ============================================================
const MESSAGES = {

  // --- ข้อความต้อนรับ ---
  WELCOME_UNKNOWN: 
    '👋 สวัสดีค่ะ!\n\n' +
    'ระบบยังไม่พบข้อมูลของท่านในฐานข้อมูล\n' +
    'กรุณาติดต่อฝ่ายวิชาการเพื่อลงทะเบียนใช้งานค่ะ 🙏',

  WELCOME_TEACHER: (name) =>
    `👋 สวัสดีค่ะ ${name}!\n` +
    `ระบบเช็คอินการเข้าสอน พร้อมใช้งานค่ะ ✅`,

  WELCOME_MONITOR: (name, classroom) =>
    `👋 สวัสดีค่ะ ${name}!\n` +
    `หัวหน้าห้อง ${classroom} พร้อมใช้งานค่ะ ✅`,

  // --- ข้อความ QR ---
  QR_CREATING: '⏳ กำลังสร้าง QR Code กรุณารอสักครู่ค่ะ...',
  
  QR_SUCCESS: (period, expireMinutes) =>
    `✅ สร้าง QR Code สำเร็จค่ะ!\n\n` +
    `📌 ${period}\n` +
    `⏱️ QR Code หมดอายุใน ${expireMinutes} นาที\n\n` +
    `📲 แสดง QR Code นี้ให้ครูผู้สอนสแกนได้เลยค่ะ`,

  QR_EXPIRED:
    '⏰ QR Code นี้หมดอายุแล้วค่ะ\n\n' +
    'กรุณาขอให้หัวหน้าห้องสร้าง QR Code ใหม่ค่ะ 🙏',

  QR_USED:
    '⚠️ QR Code นี้ถูกใช้งานแล้วค่ะ\n\n' +
    'กรุณาขอให้หัวหน้าห้องสร้าง QR Code ใหม่ค่ะ 🙏',

  QR_INVALID:
    '❌ ไม่พบข้อมูล QR Code ค่ะ\n\n' +
    'กรุณาขอให้หัวหน้าห้องสร้าง QR Code ใหม่ค่ะ 🙏',

  // --- ข้อความเช็คอิน ---
  ASK_TOPIC:
    '📝 กรุณาพิมพ์ "เรื่องที่สอน" ในคาบนี้ค่ะ\n\n' +
    'ตัวอย่าง: อสมการเชิงเส้นตัวแปรเดียว, การอ่านจับใจความ',

  ASK_ASSIGNMENT:
    '📋 กรุณาพิมพ์ "งานมอบหมาย" ในคาบนี้ค่ะ\n\n' +
    'ตัวอย่าง: แบบฝึกหัด 3.2 ข้อ 1-10\n' +
    'หรือกดปุ่ม "ไม่มีงานมอบหมาย" ด้านล่างค่ะ',

  CHECKIN_SUCCESS: (teacherName, subject, period) =>
    `✅ บันทึกการเข้าสอนสำเร็จค่ะ!\n\n` +
    `👩‍🏫 ${teacherName}\n` +
    `📚 ${subject}\n` +
    `🕐 ${period}\n\n` +
    `ขอบคุณค่ะ 🙏`,

  MONITOR_NOTIFY: (teacherName, subject) =>
    `✅ ครูเช็คอินแล้วค่ะ!\n\n` +
    `👩‍🏫 ${teacherName}\n` +
    `📚 ${subject}`,

  // --- ข้อความ Error ---
  ERROR_GENERAL:
    '❌ เกิดข้อผิดพลาดบางอย่างค่ะ\n\n' +
    'กรุณาลองใหม่อีกครั้ง หรือติดต่อฝ่ายวิชาการค่ะ 🙏',

  ERROR_NO_SCHEDULE:
    '📅 ไม่พบตารางสอนสำหรับห้องนี้ในวันนี้ค่ะ\n\n' +
    'กรุณาตรวจสอบตารางสอนกับฝ่ายวิชาการค่ะ',

  ERROR_ALREADY_CHECKIN:
    '⚠️ ท่านได้เช็คอินคาบนี้แล้วค่ะ\n\n' +
    'หากมีปัญหา กรุณาติดต่อฝ่ายวิชาการค่ะ 🙏',

  SESSION_TIMEOUT:
    '⏰ หมดเวลาการกรอกข้อมูลค่ะ\n\n' +
    'กรุณาสแกน QR Code ใหม่อีกครั้งค่ะ 🙏',
};


// ============================================================
// 🛠️ SECTION 6: Helper Functions สำหรับ Config
// ============================================================

/**
 * หาข้อมูลคาบปัจจุบันจากเวลาขณะนั้น
 * @returns {Object|null} ข้อมูลคาบ หรือ null ถ้าไม่อยู่ในช่วงเวลาเรียน
 */
function getCurrentPeriod() {
  const now       = new Date();
  const hours     = now.getHours();
  const minutes   = now.getMinutes();
  const nowMinutes = hours * 60 + minutes; // แปลงเป็นนาทีรวม

  for (const period of PERIODS) {
    const [startH, startM] = period.start.split(':').map(Number);
    const [endH,   endM]   = period.end.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal   = endH   * 60 + endM;

    if (nowMinutes >= startTotal && nowMinutes < endTotal) {
      return period;
    }
  }
  return null; // ไม่อยู่ในช่วงคาบเรียน
}


/**
 * หาข้อมูลคาบจากหมายเลขคาบ
 * @param {number} periodNumber - หมายเลขคาบ (1-10)
 * @returns {Object|null} ข้อมูลคาบ
 */
function getPeriodByNumber(periodNumber) {
  return PERIODS.find(p => p.number === periodNumber) || null;
}


/**
 * สร้าง QR Token แบบสุ่ม (12 ตัวอักษร)
 * @returns {string} Token ที่ไม่ซ้ำกัน
 */
function generateQRToken() {
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 12;
  let token    = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // เพิ่ม Timestamp ย่อ เพื่อให้แน่ใจว่าไม่ซ้ำ
  token += Date.now().toString(36).toUpperCase();
  return token;
}


/**
 * คำนวณเวลาหมดอายุของ QR Token
 * @returns {Date} เวลาหมดอายุ
 */
function getQRExpireTime() {
  const expire = new Date();
  expire.setMinutes(expire.getMinutes() + SYSTEM_CONFIG.QR_TOKEN_EXPIRE_MINUTES);
  return expire;
}


/**
 * ตรวจสอบว่า QR Token หมดอายุหรือยัง
 * @param {string} expireTimeStr - เวลาหมดอายุในรูปแบบ String
 * @returns {boolean} true = หมดอายุแล้ว
 */
function isQRExpired(expireTimeStr) {
  return new Date() > new Date(expireTimeStr);
}


/**
 * Format วันที่เป็นภาษาไทย
 * @param {Date} date
 * @returns {string} เช่น "จันทร์ที่ 15 มีนาคม 2567"
 */
function formatThaiDate(date) {
  const days    = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const months  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const d       = date || new Date();
  const buddhistYear = d.getFullYear() + 543;
  return `${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${buddhistYear}`;
}


/**
 * Format วันในสัปดาห์สำหรับ Query ตารางสอน
 * @returns {string} ชื่อวันภาษาไทย เช่น "จันทร์"
 */
function getTodayDayName() {
  const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  return days[new Date().getDay()];
}


/**
 * Log ข้อมูลพร้อม Timestamp (ใช้ Debug)
 * @param {string} tag - หมวดหมู่ของ Log
 * @param {string} message - ข้อความ
 * @param {*} data - ข้อมูลเพิ่มเติม (optional)
 */
function logInfo(tag, message, data) {
  const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const logMsg    = `[${timestamp}] [${tag}] ${message}`;
  if (data !== undefined) {
    console.log(logMsg, JSON.stringify(data));
  } else {
    console.log(logMsg);
  }
}


/**
 * ดึง GAS Web App URL ปัจจุบัน (ใช้สร้าง URL สำหรับ QR Code)
 * @returns {string} URL ของ Web App
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}