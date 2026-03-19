// Config.gs - Configuration and AI Engine for PAPRAI PU-HSET
// ไฟล์ Configuration และระบบ AI สำหรับหลักสูตร PU-HSET
// เวอร์ชัน: 2.1 (แก้ไข Gap 1, 2, 3, 4, 6, 8 + แยก Spreadsheet 2 ไฟล์
//               + ย้าย AI_MODEL และ LLM_ENDPOINT เข้า PropertiesService)

/**
 * ====================================
 * APPLICATION CONFIGURATION
 * ค่าที่ไม่ sensitive และไม่ต้องการเปลี่ยนบ่อยเก็บไว้ที่นี่
 * ค่าที่เกี่ยวกับ Provider / API ย้ายไปอยู่ใน PropertiesService แล้ว
 * (ดูที่ setupCredentials และ getCredentials)
 * ====================================
 */

const APP_CONFIG = {
  // จำนวนประวัติการสนทนาสูงสุดที่เก็บไว้เป็นบริบท (Context)
  MAX_HISTORY: 5,

  // พารามิเตอร์ AI
  AI_PARAMS: {
    temperature: 0.3, // ลด temperature เพื่อให้ตอบ Fact-based ตรงเอกสารมากขึ้น
    max_tokens: 500
  },

  // --- Gap 1: Rate Limiting ---
  // จำนวนข้อความสูงสุดที่ผู้ใช้แต่ละคนส่งได้ต่อวัน
  RATE_LIMIT_PER_DAY: 30,

  // --- Gap 4: CacheService สำหรับ FAQ ---
  // อายุ Cache ของ Knowledge Base (วินาที) = 10 นาที
  KNOWLEDGE_CACHE_TTL: 600,

  // Cache Key สำหรับ Knowledge Base
  KNOWLEDGE_CACHE_KEY: 'paprai_puhset_knowledge_base',

  // หมวดหมู่คำถามสำหรับ Auto-tagging สถิติ
  CATEGORIES: [
    'ค่าธรรมเนียมการศึกษา',
    'โครงสร้างหลักสูตร',
    'สายวิทยาศาสตร์สุขภาพ',
    'สายวิศวกรรมเทคโนโลยี',
    'คุณสมบัติและการรับสมัคร',
    'การเรียนการสอน',
    'การศึกษาต่อ',
    'อื่นๆ'
  ]
};

/**
 * ====================================
 * CREDENTIALS MANAGEMENT
 * แยก Spreadsheet ออกเป็น 2 ไฟล์:
 *   KNOWLEDGE_SPREADSHEET_ID  → Staff ฝ่ายวิชาการ (FAQ_Data, Curriculum_Info)
 *   LOGS_SPREADSHEET_ID       → ผู้บริหาร (Chat_Logs, Usage_Analytics)
 * ====================================
 */

/**
 * ฟังก์ชันตั้งค่า Credentials ครั้งแรก
 * วิธีใช้งาน:
 *   1. นำค่า API ต่างๆ มาใส่ในช่อง YOUR_..._HERE
 *   2. กด Run ฟังก์ชัน setupCredentials() เพียงครั้งเดียว
 *   3. ลบหรือ comment ค่า API ออกจากโค้ดหลังจาก Run แล้ว
 */
function setupCredentials() {
  const credentials = {
    OPENAI_API_KEY:              'YOUR_OPENAI_API_KEY_HERE',
    LINE_CHANNEL_ACCESS_TOKEN:   'YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE',

    // ID ของ Google Sheets ไฟล์ที่ 1: สำหรับ Staff ฝ่ายวิชาการ
    // มี Sheet: FAQ_Data, Curriculum_Info
    KNOWLEDGE_SPREADSHEET_ID:    'YOUR_KNOWLEDGE_SPREADSHEET_ID_HERE',

    // ID ของ Google Sheets ไฟล์ที่ 2: สำหรับผู้บริหาร
    // มี Sheet: Chat_Logs, Usage_Analytics
    LOGS_SPREADSHEET_ID:         'YOUR_LOGS_SPREADSHEET_ID_HERE',

    // ---- LLM Provider Settings ----
    // เก็บใน PropertiesService เพื่อรองรับการสลับ Provider ในอนาคต
    // โดยไม่ต้องแก้โค้ด เพียงรัน setupCredentials() ใหม่พร้อมค่าใหม่
    //
    // ตัวอย่าง Provider อื่น:
    //   OpenAI   → model: 'gpt-4o'              endpoint: 'https://api.openai.com/v1/chat/completions'
    //   DeepSeek → model: 'deepseek-chat'        endpoint: 'https://api.deepseek.com/chat/completions'
    //   Gemini   → model: 'gemini-1.5-flash'     endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    LLM_MODEL:                   'gpt-4o',
    LLM_ENDPOINT:                'https://api.openai.com/v1/chat/completions'
  };

  const props = PropertiesService.getScriptProperties();
  props.setProperty('OPENAI_API_KEY',            credentials.OPENAI_API_KEY);
  props.setProperty('LINE_CHANNEL_ACCESS_TOKEN', credentials.LINE_CHANNEL_ACCESS_TOKEN);
  props.setProperty('KNOWLEDGE_SPREADSHEET_ID',  credentials.KNOWLEDGE_SPREADSHEET_ID);
  props.setProperty('LOGS_SPREADSHEET_ID',       credentials.LOGS_SPREADSHEET_ID);
  props.setProperty('LLM_MODEL',                 credentials.LLM_MODEL);
  props.setProperty('LLM_ENDPOINT',              credentials.LLM_ENDPOINT);

  console.log('✅ Credentials setup completed');
  console.log('⚠️  กรุณาลบหรือ comment ค่า API ออกจากโค้ดหลัง Run เสร็จแล้ว');
}

/**
 * ดึง Credentials ทั้งหมดจาก Script Properties
 * ใช้งานทุกครั้งที่ต้องการเข้าถึง API key, Spreadsheet ID หรือ LLM settings
 */
function getCredentials() {
  try {
    const props = PropertiesService.getScriptProperties();
    return {
      OPENAI_API_KEY:            props.getProperty('OPENAI_API_KEY'),
      LINE_CHANNEL_ACCESS_TOKEN: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
      KNOWLEDGE_SPREADSHEET_ID:  props.getProperty('KNOWLEDGE_SPREADSHEET_ID'),
      LOGS_SPREADSHEET_ID:       props.getProperty('LOGS_SPREADSHEET_ID'),
      // LLM Provider — สามารถสลับ Provider ได้โดยรัน setupCredentials() ใหม่
      LLM_MODEL:                 props.getProperty('LLM_MODEL'),
      LLM_ENDPOINT:              props.getProperty('LLM_ENDPOINT')
    };
  } catch (error) {
    console.error('❌ Error getting credentials:', error);
    throw new Error('Failed to retrieve credentials');
  }
}

/**
 * ====================================
 * USER PROFILE MANAGEMENT
 * Bot เป็น Public — ทุกคนที่ทักมาได้รับ Guest Profile ทันที
 * ====================================
 */

function getUserProfile(userId) {
  if (!userId) return null;
  return {
    userId:     userId,
    name:       'ผู้ปกครอง/นักเรียน',
    role:       'GUEST',
    department: 'Public'
  };
}

/**
 * ====================================
 * GAP 1: RATE LIMITING
 * ใช้ CacheService นับจำนวนข้อความต่อวันต่อผู้ใช้
 * Key รูปแบบ: rate_{userId}_{yyyy-MM-dd}
 * ====================================
 */

/**
 * ตรวจสอบว่าผู้ใช้ยังส่งข้อความได้อยู่หรือไม่
 * @param {string} userId - LINE userId
 * @returns {boolean} true = ยังใช้งานได้, false = เกิน limit
 */
function checkRateLimit(userId) {
  try {
    const cache = CacheService.getScriptCache();
    const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    const cacheKey = `rate_${userId}_${today}`;

    const currentCount = parseInt(cache.get(cacheKey) || '0', 10);

    if (currentCount >= APP_CONFIG.RATE_LIMIT_PER_DAY) {
      console.log(`🚫 Rate limit reached for user: ${userId} (${currentCount}/${APP_CONFIG.RATE_LIMIT_PER_DAY})`);
      return false;
    }

    // เพิ่ม counter และตั้ง TTL ให้หมดอายุเที่ยงคืน (86400 วินาที = 24 ชั่วโมง)
    cache.put(cacheKey, String(currentCount + 1), 86400);
    console.log(`📊 Rate count for ${userId}: ${currentCount + 1}/${APP_CONFIG.RATE_LIMIT_PER_DAY}`);
    return true;

  } catch (error) {
    // หาก CacheService มีปัญหา ให้ผ่านไปก่อน ไม่บล็อกผู้ใช้
    console.error('⚠️ Rate limit check failed (allowing request):', error);
    return true;
  }
}

/**
 * ====================================
 * GAP 4: CACHE สำหรับ KNOWLEDGE BASE
 * ดึงข้อมูลจาก Sheets แล้ว Cache ไว้ 10 นาที
 * ช่วยลด Sheets API calls เมื่อมีผู้ใช้พร้อมกันจำนวนมาก
 * ====================================
 */

/**
 * ดึง Knowledge Base โดยตรวจ Cache ก่อนเสมอ
 * ถ้ามีใน Cache → ใช้เลยทันที
 * ถ้าไม่มี → ดึงจาก Sheets แล้วบันทึก Cache
 * @returns {string} context string สำหรับส่งเข้า Prompt
 */
function getKnowledgeWithCache() {
  try {
    const cache = CacheService.getScriptCache();

    // ตรวจสอบ Cache ก่อน
    const cachedData = cache.get(APP_CONFIG.KNOWLEDGE_CACHE_KEY);
    if (cachedData) {
      console.log('⚡ Knowledge Base loaded from Cache');
      return cachedData;
    }

    // Cache หมดอายุหรือยังไม่เคย Cache → ดึงจาก Sheets
    console.log('🔄 Cache miss — fetching Knowledge Base from Sheets');
    const freshData = retrieveKnowledge();

    // บันทึกลง Cache (TTL = KNOWLEDGE_CACHE_TTL วินาที)
    if (freshData && freshData.length > 0) {
      // CacheService รองรับสูงสุด 100,000 bytes ต่อ entry
      if (freshData.length < 90000) {
        cache.put(APP_CONFIG.KNOWLEDGE_CACHE_KEY, freshData, APP_CONFIG.KNOWLEDGE_CACHE_TTL);
        console.log(`✅ Knowledge Base cached (${freshData.length} chars, TTL: ${APP_CONFIG.KNOWLEDGE_CACHE_TTL}s)`);
      } else {
        console.warn('⚠️ Knowledge Base too large to cache — serving directly from Sheets');
      }
    }

    return freshData;

  } catch (error) {
    console.error('❌ Error in getKnowledgeWithCache:', error);
    // Fallback: พยายามดึงจาก Sheets โดยตรงแม้ Cache มีปัญหา
    return retrieveKnowledge();
  }
}

/**
 * ดึงข้อมูลทั้งหมดจาก KNOWLEDGE_SPREADSHEET_ID
 * (FAQ_Data + Curriculum_Info) → แปลงเป็น text context
 * ฟังก์ชันนี้เรียกผ่าน getKnowledgeWithCache() เท่านั้น
 */
function retrieveKnowledge() {
  try {
    const credentials = getCredentials();

    // Gap 6 pattern: null guard สำหรับ KNOWLEDGE_SPREADSHEET_ID
    if (!credentials.KNOWLEDGE_SPREADSHEET_ID) {
      console.warn('⚠️ KNOWLEDGE_SPREADSHEET_ID not configured');
      return '';
    }

    const ss = SpreadsheetApp.openById(credentials.KNOWLEDGE_SPREADSHEET_ID);
    let context = '';

    // ดึงข้อมูลจาก FAQ_Data
    const faqSheet = ss.getSheetByName('FAQ_Data');
    if (faqSheet) {
      const data = faqSheet.getDataRange().getDisplayValues();
      if (data.length > 1) {
        context += '📌 [คำถามที่พบบ่อย (FAQ)]:\n';
        for (let i = 1; i < data.length; i++) {
          // Column A = Category, B = Question, C = Answer
          if (data[i][1] && data[i][2]) {
            context += `คำถาม: ${data[i][1]}\nคำตอบ: ${data[i][2]}\n\n`;
          }
        }
      }
    } else {
      console.warn('⚠️ Sheet FAQ_Data not found');
    }

    // ดึงข้อมูลจาก Curriculum_Info
    const curSheet = ss.getSheetByName('Curriculum_Info');
    if (curSheet) {
      const data = curSheet.getDataRange().getDisplayValues();
      if (data.length > 1) {
        context += '📚 [ข้อมูลเชิงลึกและโครงสร้างหลักสูตร]:\n';
        for (let i = 1; i < data.length; i++) {
          // Column A = Topic, B = Details
          if (data[i][0] && data[i][1]) {
            context += `หัวข้อ: ${data[i][0]}\nรายละเอียด: ${data[i][1]}\n\n`;
          }
        }
      }
    } else {
      console.warn('⚠️ Sheet Curriculum_Info not found');
    }

    return context;

  } catch (error) {
    console.error('❌ Error retrieving knowledge from Sheets:', error);
    return '';
  }
}

/**
 * ล้าง Knowledge Cache ด้วยตนเอง
 * ใช้เมื่อ Staff อัปเดต FAQ แล้วต้องการให้ Bot ดึงข้อมูลใหม่ทันที
 * วิธีใช้: เปิด Apps Script Editor แล้ว Run ฟังก์ชันนี้
 */
function forceRefreshKnowledgeCache() {
  CacheService.getScriptCache().remove(APP_CONFIG.KNOWLEDGE_CACHE_KEY);
  console.log('🔄 Knowledge Cache cleared — Bot จะดึงข้อมูลใหม่จาก Sheets ในครั้งถัดไป');
}

/**
 * ====================================
 * CHAT HISTORY MANAGEMENT (LOGS_SPREADSHEET_ID)
 * ====================================
 */

/**
 * GAP 6: เพิ่ม null guard สำหรับ LOGS_SPREADSHEET_ID
 * ดึงประวัติการสนทนาล่าสุดของผู้ใช้ (จำกัดที่ MAX_HISTORY รายการ)
 */
function getChatHistory(userId) {
  try {
    const credentials = getCredentials();

    // Gap 6: null guard — คืน [] ทันทีแทน throw error
    if (!credentials.LOGS_SPREADSHEET_ID) {
      console.warn('⚠️ LOGS_SPREADSHEET_ID not configured — returning empty history');
      return [];
    }

    const ss = SpreadsheetApp.openById(credentials.LOGS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Chat_Logs');
    if (!sheet) {
      console.warn('⚠️ Sheet Chat_Logs not found');
      return [];
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // มีแค่ header หรือว่างเปล่า

    // กรองเฉพาะแถวของ userId นี้ → เอาล่าสุดตาม MAX_HISTORY
    // Schema: [Timestamp, User_ID, User_Message, AI_Response, Category, Tokens_Used]
    const userHistory = data
      .filter(row => row[1] === userId)
      .slice(-APP_CONFIG.MAX_HISTORY)
      .map(row => ({
        userMessage: row[2],
        aiResponse:  row[3]
      }));

    console.log(`📚 Retrieved ${userHistory.length} history entries for user`);
    return userHistory;

  } catch (error) {
    console.error('❌ Error getting chat history:', error);
    return [];
  }
}

/**
 * GAP 2: เพิ่ม LockService ก่อน write
 * บันทึกประวัติการสนทนาลงใน Chat_Logs
 */
function saveChatHistory(userProfile, User_Message, AI_Response, category, Tokens_Used) {
  // Gap 2: ขอ Script Lock ก่อน write เพื่อป้องกัน race condition
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // รอสูงสุด 10 วินาที
  } catch (lockError) {
    // หากล็อกไม่ได้ภายในเวลาที่กำหนด ให้ log warning แต่ไม่ throw
    // เพราะการสูญเสีย log 1 บรรทัดไม่กระทบการทำงานหลักของ Bot
    console.warn('⚠️ Could not acquire lock for saveChatHistory — skipping log');
    return;
  }

  try {
    const credentials = getCredentials();
    if (!credentials.LOGS_SPREADSHEET_ID) {
      console.warn('⚠️ LOGS_SPREADSHEET_ID not configured');
      return;
    }

    const ss = SpreadsheetApp.openById(credentials.LOGS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Chat_Logs');
    if (!sheet) {
      console.warn('⚠️ Sheet Chat_Logs not found');
      return;
    }

    // Schema: Timestamp, User_ID, User_Message, AI_Response, Category, Tokens_Used
    sheet.appendRow([
      new Date(),
      userProfile.userId,
      User_Message,
      AI_Response,
      category,
      Tokens_Used
    ]);

    console.log('💾 Chat history saved to Chat_Logs');

  } catch (error) {
    console.error('❌ Error saving chat history:', error);
  } finally {
    lock.releaseLock();
  }
}

/**
 * GAP 8: Batch delete — เขียนคืนทั้ง Sheet แทนการลบทีละแถว
 * เร็วกว่าอย่างมากเมื่อข้อมูลสะสมเป็นจำนวนมาก
 */
function clearChatHistory(userId) {
  try {
    const credentials = getCredentials();
    if (!credentials.LOGS_SPREADSHEET_ID) {
      console.warn('⚠️ LOGS_SPREADSHEET_ID not configured');
      return;
    }

    const ss = SpreadsheetApp.openById(credentials.LOGS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Chat_Logs');
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return; // ว่างเปล่าหรือมีแค่ header

    // กรองเฉพาะแถวที่ไม่ใช่ของ userId นี้ (เก็บ header แถวแรกไว้)
    const header     = [data[0]];
    const remaining  = data.filter(row => row[1] !== userId);
    const newData    = header.concat(remaining.slice(1)); // ป้องกัน header ซ้ำถ้ามี

    // Gap 8: เขียนคืนทั้ง Sheet ครั้งเดียว (Batch write)
    sheet.clearContents();
    if (newData.length > 0) {
      sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
    }

    const deletedCount = data.length - newData.length;
    console.log(`🗑️ Batch cleared ${deletedCount} entries for user`);

  } catch (error) {
    console.error('❌ Error clearing chat history:', error);
  }
}

/**
 * ====================================
 * SYSTEM PROMPT & PROMPT CONSTRUCTION
 * ====================================
 */

function getSystemPrompt() {
  return `คุณคือ "ป้าไพร" (PAPRAI) - AI Assistant ที่เป็นมิตร อบอุ่น และน่าเชื่อถือ ทำหน้าที่เป็น "ผู้ช่วยประชาสัมพันธ์และให้คำแนะนำหลักสูตร PU-HSET" ของโรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา)

🤖 ข้อมูลเกี่ยวกับป้าไพร
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
บทบาท: ผู้ช่วยแนะแนวหลักสูตรห้องเรียนพิเศษ เตรียมอุดมวิทยาศาสตร์สุขภาพ และวิศวกรรมเทคโนโลยี (PU-HSET)
กลุ่มเป้าหมาย: ผู้ปกครองและนักเรียนที่สนใจสมัครเข้าศึกษาต่อในระดับชั้น ม.4

🗣️ การเรียกตัวเองและการสื่อสาร
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ เรียกตัวเองว่า "ป้าไพร"
✅ ใช้ "คะ" (เสียงสูง) เมื่อถามคำถามหรือแสดงความใส่ใจ เช่น "มีส่วนไหนให้ป้าไพรช่วยอธิบายเพิ่มไหมคะ"
✅ ใช้ "ค่ะ" (เสียงต่ำ) เมื่อยืนยัน ตอบรับ หรือให้ข้อมูล เช่น "ค่าเทอม 75,000 บาทต่อภาคการศึกษาค่ะ"
✅ ใช้ภาษาไทยที่สุภาพ อ่อนน้อม เป็นทางการแต่เป็นกันเอง คล้ายครูแนะแนวที่ใจดี

📌 กฎข้อบังคับการให้ข้อมูล (สำคัญที่สุด)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ตอบคำถามจาก "ข้อมูลอ้างอิง (Context)" ที่ระบบจัดเตรียมไว้ให้เท่านั้น
🚫 ห้ามแต่งข้อมูล โครงสร้างหลักสูตร ค่าเทอม หรือรายละเอียดใดขึ้นมาเองโดยเด็ดขาด
🚫 ห้ามใช้ความรู้ทั่วไปนอกเหนือจาก Context ที่กำหนดให้ แม้จะดูสมเหตุสมผล
🚫 ไม่ขอข้อมูลส่วนตัวที่ระบุตัวตนได้ เช่น ชื่อจริง เบอร์โทร จากผู้ใช้งาน

⚠️ หากคำถามใดไม่มีข้อมูลใน Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ให้ตอบด้วยข้อความนี้เสมอ:
"ป้าไพรต้องขออภัยด้วยนะคะ ข้อมูลส่วนนี้ป้าไพรยังไม่มีรายละเอียดที่แน่ชัด รบกวนคุณพ่อคุณแม่หรือน้องๆ ติดต่อสอบถามกับทางฝ่ายแนะแนวของโรงเรียนโดยตรงนะคะ 🙏"

CRITICAL รูปแบบการตอบ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 ห้ามใช้ Markdown formatting อย่างเด็ดขาด (ห้ามใช้ ** ## *** - หรือ 1. 2. 3. แบบอัตโนมัติ)
✅ ใช้ Emoji สื่ออารมณ์และแบ่งสัดส่วนเนื้อหา เช่น 📌 💡 ⚠️ ✅ 📚 🎓
✅ ขึ้นบรรทัดใหม่เพื่อแบ่งหัวข้อให้อ่านง่าย
✅ ใช้ ━━━ หรือ • สำหรับรายการ
✅ ปิดท้ายด้วยการเชิญถามเพิ่มเติมทุกครั้ง`;
}

/**
 * GAP 3: แก้ไข Fallback instruction ที่ขัดแย้งกับ System Prompt
 * เดิม: "อ้างอิงตามความรู้ทั่วไปของหลักสูตร" → ทำให้ AI ใช้ความรู้ทั่วไป
 * ใหม่: แจ้ง AI ชัดเจนว่า Context ว่างเปล่า ให้แนะนำให้ติดต่อโรงเรียนเท่านั้น
 */
function constructUserPrompt(chatHistory, retrievedContext, currentMessage) {
  let prompt = '';

  // 1. แนบ Knowledge Base Context
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
  prompt += 'ข้อมูลอ้างอิงสำหรับตอบคำถาม (Knowledge Base Context)\n';
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';

  if (retrievedContext && retrievedContext.trim().length > 0) {
    prompt += retrievedContext + '\n\n';
  } else {
    // Gap 3: Fallback ที่ถูกต้อง — ไม่อนุญาตให้ AI ใช้ความรู้ทั่วไป
    prompt += '[SYSTEM NOTE: ไม่พบข้อมูลใน Knowledge Base]\n';
    prompt += 'คำสั่ง: ห้ามตอบด้วยความรู้ทั่วไป ให้แจ้งผู้ใช้ว่าไม่มีข้อมูลในระบบ\n';
    prompt += 'และแนะนำให้ติดต่อฝ่ายแนะแนวของโรงเรียนโดยตรงเท่านั้น\n\n';
  }

  // 2. แนบประวัติการสนทนา (ถ้ามี)
  if (chatHistory && chatHistory.length > 0) {
    prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
    prompt += 'ประวัติการสนทนาก่อนหน้า\n';
    prompt += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
    chatHistory.forEach(msg => {
      prompt += `ผู้ใช้: ${msg.userMessage}\n\n`;
      prompt += `ป้าไพร: ${msg.aiResponse}\n\n`;
    });
  }

  // 3. คำถามปัจจุบัน
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
  prompt += 'คำถามปัจจุบัน\n';
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  prompt += `ผู้ใช้: ${currentMessage}\n\n`;
  prompt += 'ป้าไพร: ';

  return prompt;
}

/**
 * ====================================
 * OPENAI API FUNCTIONS
 * ====================================
 */

function generateAIResponse(systemPrompt, userPrompt) {
  const credentials = getCredentials();

  if (!credentials.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  if (!credentials.LLM_MODEL || !credentials.LLM_ENDPOINT) {
    throw new Error('LLM_MODEL or LLM_ENDPOINT not configured — please run setupCredentials()');
  }

  const payload = {
    model:    credentials.LLM_MODEL,    // ← อ่านจาก PropertiesService
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   }
    ],
    ...APP_CONFIG.AI_PARAMS
  };

  const options = {
    method:      'post',
    contentType: 'application/json',
    headers:     { Authorization: `Bearer ${credentials.OPENAI_API_KEY}` },
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response     = UrlFetchApp.fetch(credentials.LLM_ENDPOINT, options); // ← อ่านจาก PropertiesService
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    const errorText = response.getContentText();
    console.error(`LLM API Error (${responseCode}):`, errorText);

    if (responseCode === 401) throw new Error('API key invalid');
    if (responseCode === 429) throw new Error('rate limit');
    throw new Error(`LLM API error (${responseCode})`);
  }

  const json = JSON.parse(response.getContentText());
  if (!json.choices || json.choices.length === 0) {
    throw new Error('No response from LLM');
  }

  return json.choices[0].message.content.trim();
}

/**
 * ====================================
 * AUTO-TAGGING SYSTEM
 * ====================================
 */

function autoTagMessage(message) {
  const lowerMessage = message.toLowerCase();

  const keywords = {
    'ค่าธรรมเนียมการศึกษา':    ['ค่าเทอม', 'จ่าย', 'บาท', 'ค่าใช้จ่าย', 'ค่าหนังสือ', 'ค่าอาหาร'],
    'โครงสร้างหลักสูตร':        ['หลักสูตร', 'หน่วยกิต', 'รายวิชา', 'เวลาเรียน', 'กิจกรรม'],
    'สายวิทยาศาสตร์สุขภาพ':    ['วิทย์', 'สุขภาพ', 'แพทย์', 'พยาบาล', 'เภสัช', 'สหเวช'],
    'สายวิศวกรรมเทคโนโลยี':    ['วิศวะ', 'เทคโนโลยี', 'คอมพิวเตอร์', 'หุ่นยนต์', 'ai', 'iot'],
    'คุณสมบัติและการรับสมัคร': ['สมัคร', 'สอบเข้า', 'เกณฑ์', 'รับกี่คน', 'รับสมัคร'],
    'การเรียนการสอน':            ['ep', 'ภาษาอังกฤษ', 'ครูต่างชาติ', 'ต่างประเทศ', 'ดูงาน'],
    'การศึกษาต่อ':               ['เรียนต่อ', 'มหาลัย', 'เข้าคณะ', 'โควตา', 'portfolio']
  };

  let maxScore = 0;
  let bestCategory = 'อื่นๆ';

  for (const category in keywords) {
    const score = keywords[category].reduce(
      (count, kw) => count + (lowerMessage.includes(kw) ? 1 : 0), 0
    );
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * ====================================
 * GAP 2: ANALYTICS (LockService)
 * บันทึกสถิติลงใน Usage_Analytics ใน LOGS_SPREADSHEET_ID
 * ====================================
 */

function updateAnalytics(userProfile, category, tokensUsed) {
  // Gap 2: ขอ Script Lock ก่อน write
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockError) {
    console.warn('⚠️ Could not acquire lock for updateAnalytics — skipping');
    return;
  }

  try {
    const credentials = getCredentials();
    if (!credentials.LOGS_SPREADSHEET_ID) return;

    const ss = SpreadsheetApp.openById(credentials.LOGS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Usage_Analytics');
    if (!sheet) return;

    const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    const data  = sheet.getDataRange().getValues();

    // หาแถวของวันนี้สำหรับ userId นี้
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === today && data[i][1] === userProfile.userId) {
        rowIndex = i + 1; // +1 เพราะ sheet index เริ่มจาก 1
        break;
      }
    }

    if (rowIndex === -1) {
      // ยังไม่มีแถวของวันนี้ → สร้างใหม่
      const newCategories = {};
      newCategories[category] = 1;
      sheet.appendRow([
        today,
        userProfile.userId,
        1,
        JSON.stringify(newCategories),
        tokensUsed
      ]);
    } else {
      // มีแถวแล้ว → อัปเดต
      const totalMessages = data[rowIndex - 1][2] + 1;
      const categories    = JSON.parse(data[rowIndex - 1][3] || '{}');
      categories[category] = (categories[category] || 0) + 1;
      const totalTokens   = data[rowIndex - 1][4] + tokensUsed;

      sheet.getRange(rowIndex, 3).setValue(totalMessages);
      sheet.getRange(rowIndex, 4).setValue(JSON.stringify(categories));
      sheet.getRange(rowIndex, 5).setValue(totalTokens);
    }

    console.log('📊 Analytics updated');

  } catch (error) {
    console.error('❌ Error updating analytics:', error);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ====================================
 * SETUP FUNCTIONS (รัน 1 ครั้งตอนตั้งค่าระบบ)
 * ====================================
 */

/**
 * สร้าง Google Sheets ไฟล์ที่ 1: Knowledge Base (สำหรับ Staff ฝ่ายวิชาการ)
 * มี Sheet: FAQ_Data, Curriculum_Info
 * หลังรันแล้ว คัดลอก Spreadsheet ID ไปใส่ใน setupCredentials()
 */
function setupKnowledgeSpreadsheet() {
  try {
    const ss = SpreadsheetApp.create('PAPRAI PU-HSET — Knowledge Base (Staff)');

    // Sheet 1: FAQ_Data
    const faqSheet = ss.getActiveSheet();
    faqSheet.setName('FAQ_Data');
    faqSheet.appendRow(['Category', 'Question', 'Answer']);
    // ตัวอย่างข้อมูล FAQ เพื่อให้ Staff เข้าใจ format
    faqSheet.appendRow([
      'ค่าธรรมเนียมการศึกษา',
      'ค่าเทอมเท่าไหร่',
      '75,000 บาท / ภาคการศึกษา ไม่รวมค่าหนังสือ ค่าอาหารกลางวัน และค่าประกันอุบัติเหตุ'
    ]);
    faqSheet.appendRow([
      'คุณสมบัติและการรับสมัคร',
      'รับนักเรียนกี่คน',
      'รับรวมทั้งสายวิทยาศาสตร์สุขภาพและวิศวกรรมเทคโนโลยีทั้งหมด 40 คน'
    ]);
    faqSheet.setFrozenRows(1);
    faqSheet.getRange('A1:C1')
      .setBackground('#4a86e8').setFontColor('#ffffff').setFontWeight('bold');
    faqSheet.setColumnWidth(1, 200);
    faqSheet.setColumnWidth(2, 300);
    faqSheet.setColumnWidth(3, 500);

    // Sheet 2: Curriculum_Info
    const curSheet = ss.insertSheet('Curriculum_Info');
    curSheet.appendRow(['Topic', 'Details']);
    curSheet.appendRow([
      'ภาพรวมหลักสูตร PU-HSET',
      'หลักสูตรมัธยมศึกษาตอนปลายห้องเรียนพิเศษ เตรียมอุดมวิทยาศาสตร์สุขภาพ และวิศวกรรมเทคโนโลยี (Pre-University Program in Health Science and Engineering Technology) สำหรับนักเรียนชั้น ม.4-6 ที่มีความสามารถพิเศษด้านวิทยาศาสตร์ คณิตศาสตร์ เทคโนโลยี และภาษาอังกฤษ'
    ]);
    curSheet.setFrozenRows(1);
    curSheet.getRange('A1:B1')
      .setBackground('#ff9900').setFontColor('#ffffff').setFontWeight('bold');
    curSheet.setColumnWidth(1, 250);
    curSheet.setColumnWidth(2, 600);

    const spreadsheetId  = ss.getId();
    const spreadsheetUrl = ss.getUrl();
    console.log(`✅ Knowledge Spreadsheet created`);
    console.log(`📋 ID:  ${spreadsheetId}`);
    console.log(`🔗 URL: ${spreadsheetUrl}`);
    console.log('👉 นำ ID ด้านบนไปใส่ใน setupCredentials() ที่ KNOWLEDGE_SPREADSHEET_ID');

    return spreadsheetId;

  } catch (error) {
    console.error('❌ Error creating Knowledge Spreadsheet:', error);
    throw error;
  }
}

/**
 * สร้าง Google Sheets ไฟล์ที่ 2: Logs & Analytics (สำหรับผู้บริหาร)
 * มี Sheet: Chat_Logs, Usage_Analytics
 * หลังรันแล้ว คัดลอก Spreadsheet ID ไปใส่ใน setupCredentials()
 */
function setupLogsSpreadsheet() {
  try {
    const ss = SpreadsheetApp.create('PAPRAI PU-HSET — Logs & Analytics (Admin)');

    // Sheet 1: Chat_Logs
    const chatSheet = ss.getActiveSheet();
    chatSheet.setName('Chat_Logs');
    chatSheet.appendRow([
      'Timestamp', 'User_ID', 'User_Message', 'AI_Response', 'Category', 'Tokens_Used'
    ]);
    chatSheet.setFrozenRows(1);
    chatSheet.getRange('A1:F1')
      .setBackground('#38761d').setFontColor('#ffffff').setFontWeight('bold');
    chatSheet.setColumnWidth(1, 160);
    chatSheet.setColumnWidth(2, 160);
    chatSheet.setColumnWidth(3, 300);
    chatSheet.setColumnWidth(4, 400);
    chatSheet.setColumnWidth(5, 200);
    chatSheet.setColumnWidth(6, 100);

    // Sheet 2: Usage_Analytics
    const analyticsSheet = ss.insertSheet('Usage_Analytics');
    analyticsSheet.appendRow([
      'Date', 'User_ID', 'Total_Messages', 'Categories', 'Total_Tokens'
    ]);
    analyticsSheet.setFrozenRows(1);
    analyticsSheet.getRange('A1:E1')
      .setBackground('#9900ff').setFontColor('#ffffff').setFontWeight('bold');
    analyticsSheet.setColumnWidth(1, 120);
    analyticsSheet.setColumnWidth(2, 160);
    analyticsSheet.setColumnWidth(3, 140);
    analyticsSheet.setColumnWidth(4, 300);
    analyticsSheet.setColumnWidth(5, 120);

    const spreadsheetId  = ss.getId();
    const spreadsheetUrl = ss.getUrl();
    console.log(`✅ Logs Spreadsheet created`);
    console.log(`📋 ID:  ${spreadsheetId}`);
    console.log(`🔗 URL: ${spreadsheetUrl}`);
    console.log('👉 นำ ID ด้านบนไปใส่ใน setupCredentials() ที่ LOGS_SPREADSHEET_ID');

    return spreadsheetId;

  } catch (error) {
    console.error('❌ Error creating Logs Spreadsheet:', error);
    throw error;
  }
}
