(function(root){
  const PLATFORM_PERSONAS = {
    tiktok: {
      label: 'TikTok',
      audience_behavior: [
        'ผู้ชมอาจไม่ได้ตั้งใจซื้อก่อนเข้ามา',
        'ต้องหยุดการเลื่อนและสร้างความรู้สึกเกี่ยวข้องก่อน',
        'ภาษาต้องเป็นธรรมชาติและมีจังหวะสนทนา'
      ],
      flow: ['Stop-scroll', 'Relevance', 'Curiosity', 'Product', 'Desire', 'Deal', 'CTA'],
      rules: {
        hook: 'เปิดเร็วด้วยคำถามหรือสถานการณ์',
        price_timing: 'ราคาเข้าหลังจากทำให้สนใจสินค้าแล้ว ยกเว้น Pattern C',
        cta: 'กดดูในตะกร้า',
        avoid: 'ไม่ใส่รายละเอียดเทคนิคติดกันยาวเกินไป'
      }
    },
    shopee: {
      label: 'Shopee',
      audience_behavior: [
        'ผู้ชมมี Purchase Intent มากกว่า',
        'ต้องการรู้สินค้า ราคา ตัวเลือก และคูปองเร็ว',
        'เปรียบเทียบความคุ้มค่าก่อนตัดสินใจ'
      ],
      flow: ['Product/Deal', 'Fit', 'Choice', 'Price', 'Coupon', 'Objection', 'CTA'],
      rules: {
        hook: 'เข้าโปรและสินค้าเร็วกว่า TikTok',
        price_timing: 'บอกราคา คูปอง และความคุ้มค่าชัดเจน',
        cta: 'เข้าไปดูเซ็ตในตะกร้า',
        avoid: 'ห้ามสร้างคูปองหรือราคาสุดท้ายขึ้นเอง'
      }
    }
  };

  const BRAND_PERSONAS = {
    skinoxy: {
      label: 'SKINOXY',
      role: 'เพื่อนที่เข้าใจปัญหาผิวและช่วยเลือกอย่างเป็นระบบ',
      tone: ['ชัดเจน', 'เข้าใจง่าย', 'ไม่เป็นภาษาคลินิก', 'เน้น Routine และการเลือกตามปัญหาผิว'],
      topics: ['ผิวแห้ง', 'ผิวไม่เรียบ', 'ความหมอง', 'การเติมความชุ่มชื้น', 'การเลือกสูตร', 'การใช้สินค้าเป็น Routine'],
      guardrails: ['ไม่ขายด้วยการทำให้ลูกค้ารู้สึกแย่กับรูปร่างหรือผิว', 'ไม่ใช้คำว่ารักษาหรือรับรองผลลัพธ์']
    },
    kiss: {
      label: 'KISS MY BODY',
      role: 'เพื่อนที่ช่วยเลือกกลิ่นให้เข้ากับอารมณ์ บุคลิก และโอกาส',
      tone: ['สนุก', 'เป็นกันเอง', 'มีภาพสถานการณ์', 'ขายผ่าน Lifestyle'],
      topics: ['เลือกกลิ่นตามโอกาส', 'กลิ่นประจำวัน', 'กลิ่นไปทำงาน', 'กลิ่นออกเดตหรือออกงาน', 'Layering เมื่อมีข้อมูลรองรับ', 'เซ็ตคู่และความคุ้มค่า'],
      guardrails: ['ไม่แต่งโน้ตกลิ่นหรือคุณสมบัติที่ไม่มีในฐานข้อมูล', 'ไม่ระบุเพศผู้ซื้อ']
    },
    dgmr: {
      label: 'DAENG GI MEO RI',
      role: 'ที่ปรึกษาปัญหาเส้นผมและหนังศีรษะที่ช่วยจัด Routine',
      tone: ['มั่นใจ', 'เข้าใจง่าย', 'ไม่พูดเหมือนแพทย์', 'เน้นความต่อเนื่องในการดูแล'],
      topics: ['หนังศีรษะ', 'เส้นผม', 'ขั้นตอนการใช้', 'Shampoo / Conditioner / Tonic', 'การเลือก Bundle', 'Hero Product ตาม Knowledge Base'],
      guardrails: ['ไม่กล่าวอ้างรักษาโรค', 'ไม่ใช้คำว่าหายขาดหรือเห็นผล 100%']
    }
  };

  const AUDIENCE_PROFILES = {
    morning: {
      label: 'Morning / Daytime',
      pace: 'กระชับ',
      communication: ['Routine ชัด', 'ข้อมูลเข้าใจง่าย', 'CTA ไม่กดดันเกินไป']
    },
    daytime: {
      label: 'Morning / Daytime',
      pace: 'กระชับ',
      communication: ['Routine ชัด', 'ข้อมูลเข้าใจง่าย', 'CTA ไม่กดดันเกินไป']
    },
    afternoon: {
      label: 'Afternoon',
      pace: 'อธิบายได้มากขึ้น',
      communication: ['Comparison', 'Q&A', 'ช่วยเลือกสินค้า']
    },
    evening: {
      label: 'Evening',
      pace: 'เล่าเป็นภาพ',
      communication: ['Lifestyle', 'Demo', 'Engagement', 'เล่าภาพสถานการณ์']
    },
    prime: {
      label: 'Prime / Late Night',
      pace: 'ชัดและปิดมากขึ้น',
      communication: ['Recap', 'Deal', 'Objection Handling', 'Closing ชัดขึ้น']
    },
    pretest: {
      label: 'PRE-TEST',
      pace: 'ทดลองก่อนเริ่มเก็บผล',
      communication: ['ใช้ซ้อม Workflow', 'ไม่รวมผลทดลอง', 'เลือก Manual ได้']
    },
    check: {
      label: 'Check slot',
      pace: 'ต้องตรวจ Slot ก่อน',
      communication: ['ไม่เดา Pattern', 'เปิด Manual Override', 'เลี่ยงกำหนด Pattern ผิด']
    }
  };

  root.PLATFORM_PERSONAS = PLATFORM_PERSONAS;
  root.BRAND_PERSONAS = BRAND_PERSONAS;
  root.AUDIENCE_PROFILES = AUDIENCE_PROFILES;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PLATFORM_PERSONAS, BRAND_PERSONAS, AUDIENCE_PROFILES };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
