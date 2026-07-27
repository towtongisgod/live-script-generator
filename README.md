# SKINOXY Auto Script MVP

Auto Script Generator สำหรับ TikTok Live Commerce — วางโปรโมชั่นดิบ (หรืออัปโหลดรูป) แล้วได้สคริปต์ TikTok Live 3 Session ต่อโปรโมชั่นทันที ทำงานเป็น static site ล้วนๆ ไม่มี backend ของตัวเอง

## แท็บที่มี

ทุกแบรนด์มี 2 แท็บ — **TikTok** (วางโปรแบบเลขลำดับ `1. ... 2. ...` หนาแน่นบรรทัดเดียว) กับ **Shopee** (วางแคปชั่นสไตล์ Shopee ตรงๆ ได้เลย มีอีโมจิ, ลิงก์ `>> 🛒`, ราคาแบบ "จากปกติ X (เพียง Y)", ราคาหลายระดับแบบ "ซื้อ 1 กล่อง.../ซื้อ 2 กล่อง..."):

- **SKINOXY TikTok** / **SKINOXY Shopee**
- **KMB TikTok** / **KMB Shopee** — น้ำหอม/Lifestyle (KISS MY BODY)
- **DGMR TikTok** / **DGMR Shopee** — แฮร์แคร์ (Daeng Gi Meo Ri)

ทุกแท็บใช้ parser และ script generator ชุดเดียวกันใน `app.js` ต่างกันแค่ knowledge file (`data/*-products.json`) และ sample/placeholder — แท็บ TikTok กับ Shopee ของแบรนด์เดียวกันใช้ knowledge file เดียวกัน (เช่น `skinoxy-shopee` ใช้ `skinoxy-products.json` เหมือน `skinoxy`) ต่างกันแค่รูปแบบข้อความตัวอย่างที่วางเข้าไป

## ความสามารถหลัก

- แยกโปรโมชั่นหลายรายการจากข้อความก้อนเดียว (เลขลำดับ 1./2. หรือบรรทัดว่างคั่น — จะไม่แยกมั่วถ้าเจอ "ราคาปกติ/จากปกติ" แค่ครั้งเดียวในก้อนนั้น เพราะแปลว่าเป็นโปรเดียวที่มีบรรทัดว่างคั่นภายในเอง)
- อ่านราคาปกติ/ราคาพิเศษได้หลายรูปแบบ: `ราคาปกติ X`, `จากปกติ X`, `ราคาพิเศษเพียง X`, `พิเศษ X` (มีกันชนไม่ให้ชนกับหน่วยขนาดสินค้าเช่น "700ml")
- รองรับราคาแบบหลายระดับ (tiered pricing) เช่น "ซื้อ 1 กล่อง เพียง 251.- (จากปกติ 499.-) / ซื้อ 2 กล่อง เพียง 412.- (จากปกติ 998.-)" — พูดเปรียบเทียบทั้งสองระดับในสคริปต์เดียว
- จับคู่สินค้า/สูตร/สี จาก Product Knowledge ในไฟล์ `data/*.json` อัตโนมัติ
- คำนวณส่วนลด, %ส่วนลด, ราคาเฉลี่ยต่อชิ้น, จำนวนของแถม ฯลฯ
- สร้างสคริปต์ TikTok Live 3 Session (แต่ละ Session ~2-3 นาที) เป็นบทพูดต่อเนื่องธรรมชาติ ไม่ใช่ label/guide (ดูหัวข้อ "หลักการเขียนสคริปต์" ด้านล่าง)
- **ถอดข้อความจากรูป (OCR)** — ปุ่ม "📷 ถอดข้อความจากรูป" ใช้ Tesseract.js (รันในเบราว์เซอร์ล้วน ไม่มี backend/API key) รองรับภาษาไทย+อังกฤษ พร้อม**เครื่องมือครอปภาพ**ให้เลือกเฉพาะส่วนที่เป็นตัวหนังสือก่อนอ่าน (ช่วยได้มากถ้ารูปมีกราฟิก/รูปสินค้าปนกับตัวอักษร) และแสดง % ความมั่นใจ (confidence) เตือนถ้าต่ำกว่า 60%
- Generate Again (สุ่มมุมพูด/hook ใหม่), Copy Script รายโปร, Copy All

## หลักการเขียนสคริปต์ (สำคัญ — อย่าทำให้กลับไปเป็นแบบเดิม)

Session 1-3 ต้อง**เป็นบทพูดที่ MC อ่านตามได้เลย** ห้ามมี:
- Label/jargon ภายในที่หลุดเข้ามาในบทพูด เช่น "Pain Point ที่เปิดได้คือ...", "จุดที่พูดได้จาก Product Knowledge คือ...", "Character ของแบรนด์คือ..."
- ประโยค narrator ที่อธิบายว่ากำลังจะทำอะไร เช่น "วันนี้ขอเล่าตามข้อมูล...", "ช่วงนี้ขอลงรายละเอียด...", "ให้ย้ำตามข้อมูลนี้เท่านั้น" (นี่คือ guardrail ที่หลุดมาเป็นบทพูด ไม่ใช่สิ่งที่ MC ควรพูดออกเสียง)
- พูดเรื่องเดียวกันซ้ำสองรอบด้วยคำต่างกันในพารากราฟติดกัน (เช่น pain point + benefit ของ variant เดียวกันถูกพูดสองครั้งจากสอง helper function คนละตัว)

ส่วน `# สรุปโปรโมชั่น` (header) และ `# Key Message` / `# Producer Push Line` ที่ท้ายสคริปต์ **เป็นข้อมูลอ้างอิง ไม่ใช่บทพูด** ใส่ label ได้ตามปกติ

## วิธีเปิด (local)

```bash
node dev-server.js
```

เปิด http://127.0.0.1:8000

## วิธี build สำหรับ deploy (เช่นผ่าน ChatGPT/Codex hosting — ดู `.openai/hosting.json`)

```bash
node build-site.js
```

จะได้ `dist/server/index.js` เป็น Cloudflare Workers-style module (`export default { async fetch(request) {...} }`) ที่ฝังไฟล์ static ทั้งหมดไว้ในตัว

**ถ้าเพิ่มไฟล์ static ใหม่ (เช่น sample file ของแบรนด์ใหม่) ต้องเพิ่มเข้าไปใน array `sources` ที่ต้นไฟล์ `build-site.js` ด้วยมือ** ไม่ได้ scan โฟลเดอร์อัตโนมัติ — ถ้าลืมจะได้ 404 ตอน production แม้ `node dev-server.js` จะทำงานปกติ (เพราะ dev-server เสิร์ฟไฟล์ตรงจากดิสก์ ไม่ผ่าน manifest นี้)

## โครงสร้างไฟล์

```
skinoxy-auto-script-mvp/
├─ index.html            # โครง UI + crop modal + Tesseract.js CDN script tag
├─ app.js                # parser + script generator + OCR/crop logic ทั้งหมด (~1400 บรรทัด)
├─ styles.css
├─ dev-server.js          # plain node http server สำหรับรัน local
├─ build-site.js          # bundle เป็น Cloudflare Workers-style module สำหรับ deploy
├─ data/
│  ├─ brands.json         # รายชื่อแท็บ + knowledge_file + sample_file + placeholder ต่อแท็บ
│  ├─ brand-styles.json   # สีธีมต่อแท็บ
│  ├─ skinoxy-products.json
│  ├─ kmb-products.json
│  └─ dgmr-products.json
├─ sample-promotions.txt
├─ sample-skinoxy-shopee-promotions.txt
├─ sample-kmb-promotions.txt
├─ sample-kmb-shopee-promotions.txt
├─ sample-dgmr-promotions.txt
└─ sample-dgmr-shopee-promotions.txt
```

## ข้อจำกัดที่รู้อยู่แล้ว

- **OCR อ่านภาพ infographic/กราฟิกดีไซน์ไม่ได้ดี** — Tesseract.js เหมาะกับตัวหนังสือพิมพ์บนพื้นเรียบ ถ้าเป็นโปสเตอร์ที่มีรูปสินค้า/ไอคอน/พื้นหลังลายทับตัวอักษร ต้องใช้เครื่องมือครอปเลือกเฉพาะส่วนตัวหนังสือก่อน ถ้ายังไม่พอ ต้องพิมพ์ข้อมูลโปรเองแทน (อย่าปล่อยให้ generate จากข้อความ OCR ที่มั่ว เพราะราคา/ของแถมจะผิดจากของจริง)
- Tesseract.js โหลดจาก CDN (jsdelivr) ตอนเปิดหน้าเว็บครั้งแรก จึงต้องมีอินเทอร์เน็ต (ไม่ได้ผูก backend/API key ของเราเอง)
- Deploy อยู่ที่ https://towtongisgod.github.io/live-script-generator/ (GitHub Pages, repo: https://github.com/towtongisgod/live-script-generator) — หลังแก้โค้ดต้อง `git add && git commit && git push` เพื่ออัปเดตเว็บออนไลน์ (ดู `HANDOFF.md` ที่ root โปรเจคสำหรับรายละเอียด)
- ยังไม่ทำ AI Auditor, Dashboard, MC Coach, Login, Database ภายนอก หรือระบบชำระเงิน (นอกสโคปของ MVP นี้)
