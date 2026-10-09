# Preset Formatting — SillyTavern extension

ให้ **Chat Completion preset พกรูปแบบการตอบของตัวเองไปด้วย** เลือก preset ไหน ค่าเหล่านี้จะถูกตั้งให้อัตโนมัติ

- **Reasoning Template** (+ Auto-Parse)
- **Start Reply With**
- **Stop Strings** (Custom Stopping Strings)
- **Regex Preset** (ชุดเปิด/ปิด regex script ที่บันทึกไว้ในหน้า Regex)

ค่าพวกนี้เก็บอยู่ในไฟล์ preset เอง (`extensions.presetFormatting`) เลยติดไปด้วยเวลา rename, Save as หรือ export preset ไปแชร์ ถ้าคนที่ได้รับไปติดตั้ง extension นี้ไว้ ก็จะได้รูปแบบเดียวกัน

พอรูปแบบย้ายไปอยู่ใน preset แล้ว connection profile ก็เหลือทำหน้าที่แค่เป็น "ท่อ" (API · endpoint · key · model · post-processing) และจับคู่กับ preset ไหนก็ได้ ถ้าใช้ [Chat Top Info Bar](https://github.com/SillyTavern/Extension-TopInfoBar) อยู่ extension นี้จะเพิ่มช่องเลือก preset ไว้ข้างช่องเลือก connection บนแถบนั้นให้

```
[≡ Kyoto RP        ▾]  [⛁ Pipe B        ▾]
   preset (รูปแบบ)        connection (ท่อ)
```

## ติดตั้ง

Extensions → Install extension → วาง URL ของ repo นี้

## ตั้งค่าครั้งแรก

1. **เลิกผูก preset กับ connection** ไปที่ตั้งค่า Extensions → Preset Formatting → **เลิกผูก** (ทำแบบเดียวกับกดปุ่มโซ่ 🔗 ข้างหัวข้อ Chat Completion Presets) ต่อจากนี้เปลี่ยน preset แล้ว source / endpoint / model จะไม่เปลี่ยนตาม
2. **ใส่รูปแบบให้แต่ละ preset** ไปที่ AI Response Configuration แล้วเลือก preset จะเห็นกล่อง **รูปแบบประจำ preset** อยู่ใต้ dropdown
   - ติ๊กค่าที่ preset นั้นต้องใช้แล้วเลือกหรือพิมพ์ค่าลงไป ค่าที่ไม่ติ๊กจะไม่ถูกแตะเลยตอนสลับมา preset นี้
   - หรือตั้งค่าใน Advanced Formatting ให้เรียบร้อยก่อน แล้วกด **ดึงค่าที่ใช้อยู่** ทีเดียว
   - บันทึกลงไฟล์ preset ทันที ไม่ต้องกด Update preset
3. **ล้างค่าที่ทับกันใน connection profile** ไปที่ตั้งค่า Preset Formatting → ติ๊ก Reasoning Template / Start Reply With / Regex Preset → **เอาออกจากทุก profile** ไม่อย่างนั้นตอนสลับ profile ค่าใน profile จะทับค่าที่ preset ตั้งไว้ ถ้าเปลี่ยนใจกด **ย้อนกลับครั้งล่าสุด** ได้
   - ติ๊ก **Settings Preset** ด้วย ถ้าอยากให้การสลับ connection ไม่ลาก preset ติดมา (แนะนำถ้าจะใช้ dropdown สองช่อง)
4. บน Chat Top Info Bar กดไอคอนปลั๊ก 🔌 เพื่อเปิดแถว connection แล้วช่อง preset จะอยู่ทางซ้าย

## ล็อก preset กับแชท

ล็อก **เฉพาะ preset** ไว้กับแชท (ไม่ผูก connection) เปิดแชทนั้นเมื่อไหร่ก็จะสลับไป preset ที่ล็อกไว้ให้ ส่วน connection ใช้ตัวที่เลือกอยู่ต่อไป

- กดหมุด 📌 ข้างช่อง preset บน Chat Top Info Bar
  - หมุดจาง = แชทนี้ยังไม่ล็อก แตะเพื่อล็อก preset ที่ใช้อยู่
  - หมุดเขียว = ล็อกไว้กับ preset ที่ใช้อยู่ แตะเพื่อปลดล็อก
  - หมุดส้ม = ล็อกไว้กับ preset อื่น (เพิ่งเปลี่ยนเอง) แตะเพื่อล็อกเป็น preset ที่ใช้อยู่ ถ้าไม่แตะ เปิดแชทครั้งหน้าจะกลับไป preset ที่ล็อกไว้
- หรือตั้งจากหน้าตั้งค่า Preset Formatting → **ล็อก preset กับแชท**
- หรือพิมพ์ `/preset-lock` (ล็อก preset ที่ใช้อยู่) · `/preset-lock ชื่อ preset` · `/preset-lock off` (ปลดล็อก) · `/preset-lock ?` (บอกชื่อที่ล็อกไว้)

ล็อกเก็บอยู่ในไฟล์แชท (`chat_metadata.presetFormatting.lockedPreset`) branch ที่แตกออกมาจะได้ล็อกเดิมติดไปด้วย ถ้าแตก branch ด้วย [Alternate Universe](https://github.com/inathael-58/SillyTavern-Alternate-Universe) แล้วเลือก preset ใหม่ ล็อกของ branch จะถูกเปลี่ยนเป็น preset ใหม่ให้

**ใช้คู่กับ Character Locks (STCL)** STCL ล็อก preset + connection เป็นคู่ และจำไว้ในไฟล์แชทเหมือนกัน ถ้าเปิด *Remember per chat* ของ STCL ไว้ด้วย สองตัวจะสลับ preset แย่งกันและแชทจะรีโหลดซ้ำหลายรอบ ให้ปิด *Remember per chat* ของ STCL (หน้าตั้งค่าจะเตือนถ้ายังเปิดอยู่) จะเก็บ *Remember per character* ของ STCL ไว้ก็ได้ แต่ถ้าการ์ดนั้นมีล็อกของ STCL ด้วย ทั้งสองก็ยังแย่งกันได้

## ตัวเลือก

| ตัวเลือก | ทำอะไร |
|---|---|
| ตั้งรูปแบบตาม preset อัตโนมัติ | ปิดแล้วจะไม่ตั้งค่าให้ตอนสลับ preset (ค่าที่เก็บไว้ยังอยู่ในไฟล์) |
| แจ้งเตือนเมื่อตั้งรูปแบบ | toast บอกว่าสลับไป preset ไหนและตั้งอะไรให้บ้าง |
| ช่องเลือก preset บน Chat Top Info Bar | เปิด/ปิดช่อง preset บนแถบ |
| ซ่อนข้อความ API – model บนจอแคบ | จอกว้างไม่ถึง 600px (มือถือ) จะซ่อนข้อความด้านขวาของแถว ให้สองช่องมีที่ยาวขึ้น |
| เปิด Scoped scripts เสมอ (ค่าเริ่มต้น: เปิด) | regex ในการ์ดตัวละครที่ถูกปิดจะถูกเปิดกลับทันที |
| เปิด Preset scripts เสมอ (ค่าเริ่มต้น: ปิด) | เหมือนกัน แต่ใช้กับ regex ที่ฝังอยู่ในไฟล์ preset |
| เปิดแชทที่ล็อกไว้แล้วสลับไป preset นั้นให้ (ค่าเริ่มต้น: เปิด) | ปิดแล้วล็อกที่ตั้งไว้ยังอยู่ในแชท แต่จะไม่สลับ preset ให้ |

### ทำไม regex ของการ์ดถึงปิดเอง

Regex Preset จำไว้แค่ว่าตอนบันทึกมี script ตัวไหนเปิดอยู่ และจะปิด **ทุกตัวที่ไม่อยู่ในรายการนั้น** ซึ่งรวมถึง regex ของการ์ดตัวละครอื่นและ preset อื่นที่ตอนบันทึกยังไม่ได้เปิดใช้ แล้วค่าที่ปิดนี้ถูกเขียนลงการ์ดด้วย เลยปิดค้างไว้แบบนั้น เรื่องนี้เกิดทุกครั้งที่ Regex Preset ถูกตั้ง ไม่ว่าจะตั้งจาก extension นี้ จาก connection profile หรือจากหน้า Regex เอง ตัวเลือกด้านบนจะเปิด script กลับให้ทุกครั้งที่แชทโหลดใหม่ ซึ่งการตั้ง Regex Preset ทำให้เกิดทุกครั้งอยู่แล้ว ข้อเสียคือถ้าอยากปิด regex ของการ์ดทีละตัวเอง ต้องปิดตัวเลือกนี้ก่อน

## หมายเหตุ

- preset ที่ไม่ได้กำหนดรูปแบบไว้จะไม่แตะค่าอะไรเลย ค่าเดิมที่ใช้อยู่จะค้างไว้แบบนั้น ถ้าอยากให้ทุก preset มีรูปแบบชัดเจน ให้กำหนดไว้ทุกตัว
- ถ้าเลือก Reasoning Template ที่ภายหลังถูกลบหรือเปลี่ยนชื่อ จะมีคำเตือน และในกล่องจะขึ้นว่า “(หาไม่พบ)”
- **Regex Preset** เก็บทั้ง id และชื่อไว้ ถ้าแชร์ preset ไปให้คนอื่น id จะไม่ตรงกัน แต่ถ้าเขามี Regex Preset ชื่อเดียวกันก็จะใช้ตัวนั้นแทน
- Regex Preset จะถูกตั้งใหม่ทุกครั้งที่สลับมา preset นั้น (แบบเดียวกับตอนสลับ connection profile) เพราะมันเป็นตัวกำหนดด้วยว่า regex script ที่ฝังอยู่ในตัว preset เอง (หัวข้อ Preset Scripts ในหน้า Regex) ตัวไหนเปิดหรือปิด การตั้งใหม่ทำให้แชทที่เปิดอยู่โหลดใหม่หนึ่งครั้ง
- ถ้า regex ใช้กับ preset เดียวเท่านั้น จะใส่ไว้ใน **Preset Scripts** ของหน้า Regex เลยก็ได้ script พวกนั้นอยู่ในไฟล์ preset และติดไปกับ preset อยู่แล้ว โดยไม่ต้องใช้ Regex Preset
- Stop Strings ต้องเป็น JSON array เช่น `["\n{{user}}:"]`
- ใช้กับ Chat Completion เท่านั้น ส่วน Text Completion ใช้ Advanced Formatting ตามปกติ
- ถ้า connection profile ยังเก็บ Reasoning Template / Start Reply With / Regex Preset ไว้ ค่าจาก profile จะชนะ เพราะ profile ตั้งค่าหลังจากเลือก preset
