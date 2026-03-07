## 📊 โครงสร้าง Google Sheets (6 Sheets)

---

### Sheet 1: `Teachers_Master`

> คัดลอก Row หัวตารางนี้ไปวางใน Row 1 ของ Sheet
```
Teacher_ID | LINE_User_ID | Teacher_Name | Department | Phone | Email | Status | Role
```

**ตัวอย่างข้อมูล (Row 2 เป็นต้นไป):**
```
T001 | (รอใส่ภายหลัง) | อ.สมชาย ใจดี  | คณิตศาสตร์ | 081-234-5678 | somchai@school.ac.th  | Active | Teacher
T002 | (รอใส่ภายหลัง) | อ.สมหญิง ดีใจ | ภาษาไทย    | 081-234-5679 | somying@school.ac.th  | Active | Teacher
```

> 💡 **หา LINE_User_ID ได้อย่างไร?**
> ให้ครูแต่ละคน Add Bot เป็นเพื่อน แล้วส่งข้อความใดก็ได้ → ดู Log ใน GAS Execution Log → จะเห็น User ID ขึ้นต้นด้วย `U`

---

### Sheet 2: `ClassMonitors_Master`
```
Monitor_ID | LINE_User_ID | Student_Name | Classroom | Grade | Status
```

**ตัวอย่าง:**
```
M001 | (รอใส่ภายหลัง) | ด.ช.สมศักดิ์ รักเรียน | ห้อง 1/1 | ม.1 | Active
M002 | (รอใส่ภายหลัง) | ด.ญ.สมใจ ขยันดี        | ห้อง 1/2 | ม.1 | Active
```

---

### Sheet 3: `Subjects_Schedule`
```
Subject_Code | Subject_Name | Teacher_ID | Classroom | Day | Period_Number | Period_Name | Time_Start | Time_End | Students_Total | Level | Semester
```

**ตัวอย่าง:**
```
MATH101 | คณิตศาสตร์ ม.1/1 | T001 | ห้อง 1/1 | จันทร์ | 1 | คาบที่ 1 | 08:15 | 09:05 | 40 | ม.ต้น | 2/2567
THAI101 | ภาษาไทย ม.1/1    | T002 | ห้อง 1/1 | จันทร์ | 2 | คาบที่ 2 | 09:05 | 09:55 | 40 | ม.ต้น | 2/2567
```

> ⚠️ **สำคัญ:** คอลัมน์ `Day` ต้องใช้ชื่อวันภาษาไทย: `จันทร์ อังคาร พุธ พฤหัสบดี ศุกร์` เท่านั้น

---

### Sheet 4: `QR_Sessions` *(Sheet ใหม่)*
```
Token | Subject_Code | Teacher_ID | Teacher_Name | Classroom | Period_Number | Period_Name | Created_By_LineID | Created_By_Name | Created_At | Expires_At | Status | Used_By_LineID | Used_At
```

> 🤖 **Sheet นี้ระบบจะเขียนให้อัตโนมัติ** ไม่ต้องกรอกข้อมูลเอง แค่สร้าง Sheet เปล่าและใส่ Row หัวตารางเท่านั้น

---

### Sheet 5: `Teacher_CheckIn_Log`
```
Timestamp | Teacher_ID | Teacher_Name | Subject_Code | Subject_Name | Classroom | Period_Number | Period_Name | Time_Start | Time_End | Day | Teaching_Topic | Assignment | QR_Token | Status | Semester
```

> 🤖 **Sheet นี้ระบบจะเขียนให้อัตโนมัติ** เช่นเดียวกัน

---

### Sheet 6: `Admin_Settings`
```
Setting_Key | Setting_Value | Description
```

**กรอกข้อมูลเหล่านี้:**
```
SCHOOL_NAME       | โรงเรียนสาธิตมหาวิทยาลัยศิลปากร (มัธยม) | ชื่อโรงเรียน
SEMESTER_CURRENT  | 2/2567                                    | ภาคเรียนปัจจุบัน
SYSTEM_VERSION    | 1.0.0                                     | เวอร์ชันระบบ
MAINTENANCE_MODE  | false                                     | true=ปิดระบบชั่วคราว
```
