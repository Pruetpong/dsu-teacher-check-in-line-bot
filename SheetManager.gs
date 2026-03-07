// ============================================================
// SheetManager.gs — จัดการข้อมูลทั้งหมดกับ Google Sheets
// 
// ไฟล์นี้รวม CRUD Functions ทั้งหมดไว้ที่เดียว
// Code ไฟล์อื่นจะเรียกใช้ฟังก์ชันจากไฟล์นี้เท่านั้น
// ไม่มีการเรียก SpreadsheetApp โดยตรงจากไฟล์อื่น
// ============================================================


// ============================================================
// 🔌 SECTION 1: การเชื่อมต่อ Google Sheets (Connection)
// ============================================================

/**
 * เปิด Spreadsheet และคืนค่า Object สำหรับใช้งานต่อ
 * ใช้ Cache เพื่อไม่ต้องเปิดซ้ำในการ Request เดียวกัน
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(CREDENTIALS.SPREADSHEET_ID);
  } catch (e) {
    logInfo('SheetManager', 'ERROR: ไม่สามารถเปิด Spreadsheet ได้', e.message);
    throw new Error('ไม่สามารถเชื่อมต่อ Google Sheets ได้ กรุณาตรวจสอบ SPREADSHEET_ID');
  }
}


/**
 * ดึง Sheet ตามชื่อ
 * @param {string} sheetName - ชื่อ Sheet (ใช้ค่าจาก SYSTEM_CONFIG.SHEETS)
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(sheetName) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`ไม่พบ Sheet ชื่อ "${sheetName}" กรุณาตรวจสอบชื่อ Sheet ใน Google Sheets`);
  }
  return sheet;
}


/**
 * ดึงข้อมูลทั้งหมดจาก Sheet เป็น Array of Objects
 * Row แรก = Header, Row ต่อไป = ข้อมูล
 * @param {string} sheetName - ชื่อ Sheet
 * @returns {Array<Object>} Array ของ Object โดย Key = Header
 */
function getAllDataAsObjects(sheetName) {
  const sheet  = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();

  // ถ้ามีแค่ Row Header หรือว่างเปล่า คืนค่า Array ว่าง
  if (values.length <= 1) return [];

  const headers = values[0]; // Row แรกคือ Header
  const rows    = values.slice(1); // Row ที่ 2 เป็นต้นไปคือข้อมูล

  // แปลงแต่ละ Row เป็น Object โดยใช้ Header เป็น Key
  return rows
    .filter(row => row.some(cell => cell !== '')) // กรอง Row ว่างออก
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] !== undefined ? row[index] : '';
      });
      return obj;
    });
}


// ============================================================
// 👩‍🏫 SECTION 2: Teachers_Master (ข้อมูลครู)
// ============================================================

/**
 * ค้นหาครูจาก LINE User ID
 * @param {string} lineUserId - LINE User ID ของครู
 * @returns {Object|null} ข้อมูลครู หรือ null ถ้าไม่พบ
 */
function getTeacherByLineId(lineUserId) {
  try {
    const teachers = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS);
    const teacher  = teachers.find(t => 
      t['LINE_User_ID'] === lineUserId && 
      t['Status'] === 'Active'
    );
    return teacher || null;
  } catch (e) {
    logInfo('SheetManager', 'ERROR getTeacherByLineId', e.message);
    return null;
  }
}


/**
 * ค้นหาครูจาก Teacher_ID
 * @param {string} teacherId - รหัสครู เช่น T001
 * @returns {Object|null} ข้อมูลครู หรือ null ถ้าไม่พบ
 */
function getTeacherById(teacherId) {
  try {
    const teachers = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.TEACHERS);
    return teachers.find(t => t['Teacher_ID'] === teacherId) || null;
  } catch (e) {
    logInfo('SheetManager', 'ERROR getTeacherById', e.message);
    return null;
  }
}


/**
 * อัปเดต LINE User ID ของครู (ใช้ตอน Admin ลงทะเบียนครูใหม่)
 * @param {string} teacherId  - รหัสครู
 * @param {string} lineUserId - LINE User ID ที่จะอัปเดต
 * @returns {boolean} สำเร็จหรือไม่
 */
function updateTeacherLineId(teacherId, lineUserId) {
  try {
    const sheet  = getSheet(SYSTEM_CONFIG.SHEETS.TEACHERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idCol   = headers.indexOf('Teacher_ID');
    const lineCol = headers.indexOf('LINE_User_ID');

    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] === teacherId) {
        sheet.getRange(i + 1, lineCol + 1).setValue(lineUserId);
        logInfo('SheetManager', `อัปเดต LINE ID ครู ${teacherId} สำเร็จ`);
        return true;
      }
    }
    return false;
  } catch (e) {
    logInfo('SheetManager', 'ERROR updateTeacherLineId', e.message);
    return false;
  }
}


// ============================================================
// 👨‍🎓 SECTION 3: ClassMonitors_Master (ข้อมูลหัวหน้าห้อง)
// ============================================================

/**
 * ค้นหาหัวหน้าห้องจาก LINE User ID
 * @param {string} lineUserId - LINE User ID ของหัวหน้าห้อง
 * @returns {Object|null} ข้อมูลหัวหน้าห้อง หรือ null ถ้าไม่พบ
 */
function getMonitorByLineId(lineUserId) {
  try {
    const monitors = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.MONITORS);
    const monitor  = monitors.find(m => 
      m['LINE_User_ID'] === lineUserId && 
      m['Status'] === 'Active'
    );
    return monitor || null;
  } catch (e) {
    logInfo('SheetManager', 'ERROR getMonitorByLineId', e.message);
    return null;
  }
}


// ============================================================
// 📅 SECTION 4: Subjects_Schedule (ตารางสอน)
// ============================================================

/**
 * ดึงรายวิชาทั้งหมดของห้องในวันนี้
 * @param {string} classroom - ชื่อห้อง เช่น "ห้อง 1/1"
 * @returns {Array<Object>} รายการวิชาเรียงตามคาบ
 */
function getScheduleByClassroomToday(classroom) {
  try {
    const today    = getTodayDayName(); // จันทร์, อังคาร, ...
    const semester = SCHOOL_CONFIG.SEMESTER_CURRENT;
    const schedule = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE);

    const todayClasses = schedule
      .filter(s => 
        s['Classroom']  === classroom &&
        s['Day']        === today     &&
        s['Semester']   === semester
      )
      .sort((a, b) => Number(a['Period_Number']) - Number(b['Period_Number']));

    logInfo('SheetManager', `ตารางวันนี้ของ ${classroom}`, `พบ ${todayClasses.length} คาบ`);
    return todayClasses;
  } catch (e) {
    logInfo('SheetManager', 'ERROR getScheduleByClassroomToday', e.message);
    return [];
  }
}


/**
 * ดึงข้อมูลวิชาเฉพาะคาบของห้อง
 * @param {string} classroom    - ชื่อห้อง
 * @param {number} periodNumber - หมายเลขคาบ (1-10)
 * @returns {Object|null} ข้อมูลวิชา หรือ null ถ้าไม่พบ
 */
function getSubjectByClassroomAndPeriod(classroom, periodNumber) {
  try {
    const today    = getTodayDayName();
    const semester = SCHOOL_CONFIG.SEMESTER_CURRENT;
    const schedule = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE);

    return schedule.find(s =>
      s['Classroom']     === classroom          &&
      s['Day']           === today              &&
      s['Period_Number'] == periodNumber         && // == เพราะอาจเป็น String/Number
      s['Semester']      === semester
    ) || null;
  } catch (e) {
    logInfo('SheetManager', 'ERROR getSubjectByClassroomAndPeriod', e.message);
    return null;
  }
}


/**
 * ดึงตารางสอนทั้งหมดของครูในวันนี้
 * @param {string} teacherId - รหัสครู
 * @returns {Array<Object>} รายการวิชาของครู
 */
function getTeacherScheduleToday(teacherId) {
  try {
    const today    = getTodayDayName();
    const semester = SCHOOL_CONFIG.SEMESTER_CURRENT;
    const schedule = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.SCHEDULE);

    return schedule
      .filter(s =>
        s['Teacher_ID'] === teacherId &&
        s['Day']        === today     &&
        s['Semester']   === semester
      )
      .sort((a, b) => Number(a['Period_Number']) - Number(b['Period_Number']));
  } catch (e) {
    logInfo('SheetManager', 'ERROR getTeacherScheduleToday', e.message);
    return [];
  }
}


// ============================================================
// 🔑 SECTION 5: QR_Sessions (จัดการ QR Token)
// ============================================================

/**
 * สร้าง QR Session ใหม่ในตาราง
 * @param {Object} params - ข้อมูลสำหรับสร้าง QR
 * @param {string} params.subjectCode
 * @param {string} params.teacherId
 * @param {string} params.teacherName
 * @param {string} params.classroom
 * @param {number} params.periodNumber
 * @param {string} params.periodName
 * @param {string} params.createdByLineId  - LINE ID ของหัวหน้าห้อง
 * @param {string} params.createdByName    - ชื่อหัวหน้าห้อง
 * @returns {string} Token ที่สร้างขึ้น
 */
function createQRSession(params) {
  try {
    const sheet     = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const token     = generateQRToken();
    const createdAt = new Date();
    const expiresAt = getQRExpireTime();

    // เพิ่มข้อมูลใน Row ใหม่ (ลำดับต้องตรงกับ Header ของ Sheet)
    sheet.appendRow([
      token,                              // Token
      params.subjectCode,                 // Subject_Code
      params.teacherId,                   // Teacher_ID
      params.teacherName,                 // Teacher_Name
      params.classroom,                   // Classroom
      params.periodNumber,                // Period_Number
      params.periodName,                  // Period_Name
      params.createdByLineId,             // Created_By_LineID
      params.createdByName,               // Created_By_Name
      createdAt,                          // Created_At
      expiresAt,                          // Expires_At
      SYSTEM_CONFIG.QR_STATUS.ACTIVE,     // Status = Active
      '',                                 // Used_By_LineID (ว่างก่อน)
      '',                                 // Used_At (ว่างก่อน)
    ]);

    logInfo('SheetManager', `สร้าง QR Token สำเร็จ: ${token}`);
    return token;
  } catch (e) {
    logInfo('SheetManager', 'ERROR createQRSession', e.message);
    throw new Error('ไม่สามารถสร้าง QR Session ได้');
  }
}


/**
 * ค้นหาและตรวจสอบ QR Token
 * @param {string} token - Token ที่ต้องการตรวจสอบ
 * @returns {Object} { valid: boolean, status: string, data: Object|null }
 */
function validateQRToken(token) {
  try {
    const sheet  = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];

    // หา Column Index ของแต่ละ Field
    const tokenCol   = headers.indexOf('Token');
    const statusCol  = headers.indexOf('Status');
    const expireCol  = headers.indexOf('Expires_At');

    // ค้นหา Row ที่มี Token ตรงกัน
    for (let i = 1; i < values.length; i++) {
      if (values[i][tokenCol] === token) {
        const status    = values[i][statusCol];
        const expireAt  = values[i][expireCol];

        // ตรวจสอบสถานะ
        if (status === SYSTEM_CONFIG.QR_STATUS.USED) {
          return { valid: false, status: 'used', data: null };
        }

        if (status === SYSTEM_CONFIG.QR_STATUS.EXPIRED || isQRExpired(expireAt)) {
          // อัปเดต Status เป็น Expired ถ้ายังไม่ได้อัปเดต
          if (status !== SYSTEM_CONFIG.QR_STATUS.EXPIRED) {
            sheet.getRange(i + 1, statusCol + 1).setValue(SYSTEM_CONFIG.QR_STATUS.EXPIRED);
          }
          return { valid: false, status: 'expired', data: null };
        }

        // Token ใช้งานได้ — แปลง Row เป็น Object
        const data = {};
        headers.forEach((header, idx) => {
          data[header] = values[i][idx];
        });
        data['_rowIndex'] = i + 1; // เก็บ Row Number ไว้สำหรับอัปเดตทีหลัง

        return { valid: true, status: 'active', data: data };
      }
    }

    // ไม่พบ Token
    return { valid: false, status: 'not_found', data: null };

  } catch (e) {
    logInfo('SheetManager', 'ERROR validateQRToken', e.message);
    return { valid: false, status: 'error', data: null };
  }
}


/**
 * อัปเดต QR Token ว่าถูกใช้งานแล้ว
 * @param {string} token        - Token ที่ใช้
 * @param {string} usedByLineId - LINE ID ของครูที่สแกน
 * @returns {boolean} สำเร็จหรือไม่
 */
function markQRTokenAsUsed(token, usedByLineId) {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];

    const tokenCol    = headers.indexOf('Token');
    const statusCol   = headers.indexOf('Status');
    const usedByCol   = headers.indexOf('Used_By_LineID');
    const usedAtCol   = headers.indexOf('Used_At');

    for (let i = 1; i < values.length; i++) {
      if (values[i][tokenCol] === token) {
        const row = i + 1; // Row Number ใน Sheet (1-indexed)
        sheet.getRange(row, statusCol  + 1).setValue(SYSTEM_CONFIG.QR_STATUS.USED);
        sheet.getRange(row, usedByCol  + 1).setValue(usedByLineId);
        sheet.getRange(row, usedAtCol  + 1).setValue(new Date());
        logInfo('SheetManager', `Token ${token} ถูก Mark ว่าใช้แล้ว โดย ${usedByLineId}`);
        return true;
      }
    }
    return false;
  } catch (e) {
    logInfo('SheetManager', 'ERROR markQRTokenAsUsed', e.message);
    return false;
  }
}


/**
 * Expire QR Token ทั้งหมดที่หมดอายุแล้ว (Cleanup Function)
 * แนะนำให้ตั้ง Trigger รันทุกคืน
 */
function cleanupExpiredQRTokens() {
  try {
    const sheet   = getSheet(SYSTEM_CONFIG.SHEETS.QR_SESSIONS);
    const values  = sheet.getDataRange().getValues();
    const headers = values[0];

    const statusCol = headers.indexOf('Status');
    const expireCol = headers.indexOf('Expires_At');
    let   count     = 0;

    for (let i = 1; i < values.length; i++) {
      if (
        values[i][statusCol] === SYSTEM_CONFIG.QR_STATUS.ACTIVE &&
        isQRExpired(values[i][expireCol])
      ) {
        sheet.getRange(i + 1, statusCol + 1).setValue(SYSTEM_CONFIG.QR_STATUS.EXPIRED);
        count++;
      }
    }

    logInfo('SheetManager', `Cleanup สำเร็จ: Expire ${count} Tokens`);
    return count;
  } catch (e) {
    logInfo('SheetManager', 'ERROR cleanupExpiredQRTokens', e.message);
    return 0;
  }
}


// ============================================================
// 📝 SECTION 6: Teacher_CheckIn_Log (บันทึกการเช็คอิน)
// ============================================================

/**
 * บันทึกการเช็คอินของครูลง Google Sheets
 * @param {Object} params - ข้อมูลการเช็คอิน
 * @param {string} params.teacherId
 * @param {string} params.teacherName
 * @param {string} params.subjectCode
 * @param {string} params.subjectName
 * @param {string} params.classroom
 * @param {number} params.periodNumber
 * @param {string} params.periodName
 * @param {string} params.timeStart
 * @param {string} params.timeEnd
 * @param {string} params.day
 * @param {string} params.teachingTopic  - เรื่องที่สอน
 * @param {string} params.assignment     - งานมอบหมาย
 * @param {string} params.qrToken        - Token ที่ใช้เช็คอิน
 * @returns {boolean} สำเร็จหรือไม่
 */
function saveCheckIn(params) {
  try {
    // ใช้ LockService ป้องกัน Race Condition
    // เมื่อครูหลายคนเช็คอินพร้อมกัน
    const lock = LockService.getScriptLock();
    lock.waitLock(10000); // รอ Lock สูงสุด 10 วินาที

    try {
      const sheet     = getSheet(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);
      const now       = new Date();

      // คำนวณสถานะ: ตรงเวลา หรือ สาย
      const period    = getPeriodByNumber(params.periodNumber);
      let   status    = SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME;

      if (period) {
        const [startH, startM] = period.start.split(':').map(Number);
        const graceEnd = new Date();
        graceEnd.setHours(startH, startM + SYSTEM_CONFIG.CHECKIN_GRACE_MINUTES, 0);
        if (now > graceEnd) {
          status = SYSTEM_CONFIG.CHECKIN_STATUS.LATE;
        }
      }

      // บันทึกข้อมูลตามลำดับ Column ใน Sheet
      sheet.appendRow([
        now,                              // Timestamp
        params.teacherId,                 // Teacher_ID
        params.teacherName,               // Teacher_Name
        params.subjectCode,               // Subject_Code
        params.subjectName,               // Subject_Name
        params.classroom,                 // Classroom
        params.periodNumber,              // Period_Number
        params.periodName,                // Period_Name
        params.timeStart,                 // Time_Start
        params.timeEnd,                   // Time_End
        params.day,                       // Day
        params.teachingTopic,             // Teaching_Topic
        params.assignment || '-',         // Assignment (ถ้าไม่มี ใส่ -)
        params.qrToken,                   // QR_Token
        status,                           // Status
        SCHOOL_CONFIG.SEMESTER_CURRENT,   // Semester
      ]);

      logInfo('SheetManager', `บันทึกเช็คอินสำเร็จ: ${params.teacherName} - ${params.subjectName}`);
      return true;

    } finally {
      lock.releaseLock(); // คืน Lock เสมอ
    }

  } catch (e) {
    logInfo('SheetManager', 'ERROR saveCheckIn', e.message);
    return false;
  }
}


/**
 * ตรวจสอบว่าครูเช็คอินคาบนี้แล้วหรือยัง (ป้องกันเช็คอินซ้ำ)
 * @param {string} teacherId    - รหัสครู
 * @param {number} periodNumber - หมายเลขคาบ
 * @returns {boolean} true = เช็คอินแล้ว
 */
function isAlreadyCheckedIn(teacherId, periodNumber) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // เริ่มต้นวันนี้ 00:00:00

    const logs = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);

    return logs.some(log => {
      const logDate = new Date(log['Timestamp']);
      logDate.setHours(0, 0, 0, 0);
      return (
        log['Teacher_ID']     === teacherId               &&
        Number(log['Period_Number']) === Number(periodNumber) &&
        logDate.getTime()     === today.getTime()
      );
    });
  } catch (e) {
    logInfo('SheetManager', 'ERROR isAlreadyCheckedIn', e.message);
    return false; // ถ้า Error ให้ผ่านไปก่อน ไม่บล็อก Flow
  }
}


/**
 * ดึงประวัติการเช็คอินของครู (สำหรับครูดูย้อนหลัง)
 * @param {string} teacherId - รหัสครู
 * @param {number} limit     - จำนวนรายการล่าสุด (default 10)
 * @returns {Array<Object>} ประวัติการเช็คอิน
 */
function getTeacherCheckInHistory(teacherId, limit = 10) {
  try {
    const logs = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);

    return logs
      .filter(log => log['Teacher_ID'] === teacherId)
      .sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']))
      .slice(0, limit);
  } catch (e) {
    logInfo('SheetManager', 'ERROR getTeacherCheckInHistory', e.message);
    return [];
  }
}


// ============================================================
// 📊 SECTION 7: รายงานสำหรับ Admin
// ============================================================

/**
 * ดึงสรุปการเช็คอินของวันนี้ (Admin ดูรายงาน)
 * @returns {Object} สรุปรายวัน
 */
function getTodayCheckInSummary() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);

    // กรองเฉพาะวันนี้
    const todayLogs = logs.filter(log => {
      const logDate = new Date(log['Timestamp']);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === today.getTime();
    });

    // นับสถิติ
    const onTime  = todayLogs.filter(l => l['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.ON_TIME).length;
    const late    = todayLogs.filter(l => l['Status'] === SYSTEM_CONFIG.CHECKIN_STATUS.LATE).length;

    // หาครูที่ไม่ซ้ำกัน
    const uniqueTeachers = [...new Set(todayLogs.map(l => l['Teacher_ID']))];

    return {
      date:           formatThaiDate(new Date()),
      totalCheckIns:  todayLogs.length,
      onTime:         onTime,
      late:           late,
      uniqueTeachers: uniqueTeachers.length,
      logs:           todayLogs, // ข้อมูลดิบทั้งหมด
    };
  } catch (e) {
    logInfo('SheetManager', 'ERROR getTodayCheckInSummary', e.message);
    return null;
  }
}


/**
 * ดึงรายการเช็คอินตามช่วงวันที่ (สำหรับ Admin Export)
 * @param {Date} startDate - วันเริ่มต้น
 * @param {Date} endDate   - วันสิ้นสุด
 * @returns {Array<Object>} รายการเช็คอิน
 */
function getCheckInsByDateRange(startDate, endDate) {
  try {
    const logs = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);

    return logs.filter(log => {
      const logDate = new Date(log['Timestamp']);
      return logDate >= startDate && logDate <= endDate;
    }).sort((a, b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
  } catch (e) {
    logInfo('SheetManager', 'ERROR getCheckInsByDateRange', e.message);
    return [];
  }
}


/**
 * ดึงรายชื่อครูที่เช็คอินแล้วในวันนี้ (เพื่อเปรียบเทียบกับตารางสอน)
 * @returns {Array<string>} Array ของ Teacher_ID
 */
function getCheckedInTeacherIdsToday() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = getAllDataAsObjects(SYSTEM_CONFIG.SHEETS.CHECKIN_LOG);

    return logs
      .filter(log => {
        const logDate = new Date(log['Timestamp']);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === today.getTime();
      })
      .map(log => log['Teacher_ID']);
  } catch (e) {
    logInfo('SheetManager', 'ERROR getCheckedInTeacherIdsToday', e.message);
    return [];
  }
}


// ============================================================
// 🔍 SECTION 8: ระบุ Role ของผู้ใช้
// ============================================================

/**
 * ระบุ Role ของผู้ใช้จาก LINE User ID
 * ลำดับการตรวจสอบ: Admin → Teacher → Monitor → Unknown
 * @param {string} lineUserId - LINE User ID
 * @returns {Object} { role: string, data: Object|null }
 */
function identifyUserRole(lineUserId) {
  // 1. ตรวจสอบ Admin ก่อน (เช็คจาก Config โดยตรง)
  if (CREDENTIALS.ADMIN_LINE_IDS.includes(lineUserId)) {
    return {
      role: SYSTEM_CONFIG.USER_ROLE.ADMIN,
      data: { lineUserId: lineUserId, name: 'Admin ฝ่ายวิชาการ' },
    };
  }

  // 2. ตรวจสอบว่าเป็นครูหรือไม่
  const teacher = getTeacherByLineId(lineUserId);
  if (teacher) {
    return {
      role: SYSTEM_CONFIG.USER_ROLE.TEACHER,
      data: teacher,
    };
  }

  // 3. ตรวจสอบว่าเป็นหัวหน้าห้องหรือไม่
  const monitor = getMonitorByLineId(lineUserId);
  if (monitor) {
    return {
      role: SYSTEM_CONFIG.USER_ROLE.MONITOR,
      data: monitor,
    };
  }

  // 4. ไม่พบในระบบ
  return {
    role: SYSTEM_CONFIG.USER_ROLE.UNKNOWN,
    data: null,
  };
}


// ============================================================
// 🧪 SECTION 9: Testing Functions (ใช้ทดสอบก่อน Deploy)
// ============================================================

/**
 * ทดสอบการเชื่อมต่อ Google Sheets
 * รันฟังก์ชันนี้ใน GAS Editor เพื่อตรวจสอบการตั้งค่า
 */
function testSheetConnection() {
  try {
    const ss = getSpreadsheet();
    const sheets = ss.getSheets().map(s => s.getName());
    logInfo('TEST', '✅ เชื่อมต่อ Spreadsheet สำเร็จ');
    logInfo('TEST', 'Sheets ที่พบ', sheets.join(', '));

    // ตรวจสอบว่ามีครบทุก Sheet ที่ต้องการ
    const requiredSheets = Object.values(SYSTEM_CONFIG.SHEETS);
    const missingSheets  = requiredSheets.filter(name => !sheets.includes(name));

    if (missingSheets.length > 0) {
      logInfo('TEST', '❌ ไม่พบ Sheets ต่อไปนี้', missingSheets.join(', '));
    } else {
      logInfo('TEST', '✅ พบ Sheets ครบทุก Sheet ที่ต้องการ');
    }
  } catch (e) {
    logInfo('TEST', '❌ เชื่อมต่อไม่สำเร็จ', e.message);
  }
}


/**
 * ทดสอบการค้นหาครูจาก LINE ID
 * แก้ไข testLineId เป็น LINE ID จริงก่อนทดสอบ
 */
function testGetTeacher() {
  const testLineId = 'U_TEST_LINE_ID_HERE'; // ← แก้ไขตรงนี้
  const result     = getTeacherByLineId(testLineId);
  if (result) {
    logInfo('TEST', '✅ พบครู', result['Teacher_Name']);
  } else {
    logInfo('TEST', '❌ ไม่พบครูที่มี LINE ID นี้');
  }
}


/**
 * ทดสอบการสร้าง QR Token
 */
function testCreateQRToken() {
  const token = generateQRToken();
  logInfo('TEST', '✅ Token ที่สร้าง', token);
  logInfo('TEST', 'ความยาว Token', token.length);
}


/**
 * ทดสอบการระบุ Role ของผู้ใช้
 * แก้ไข testLineId เป็น LINE ID จริงก่อนทดสอบ
 */
function testIdentifyRole() {
  const testLineId = 'U_TEST_LINE_ID_HERE'; // ← แก้ไขตรงนี้
  const result     = identifyUserRole(testLineId);
  logInfo('TEST', '✅ Role ที่ระบุได้', result.role);
  logInfo('TEST', 'ข้อมูลผู้ใช้', result.data);
}