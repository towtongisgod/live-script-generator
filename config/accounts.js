(function(root){
  const ACCOUNTS = [
    {
      id: 'skinoxy',
      account_code: 'SKN-TT',
      label: 'SKINOXY TikTok',
      brand_key: 'skinoxy',
      knowledge_brand_id: 'skinoxy',
      platform: 'tiktok',
      primary: true,
      title: 'SKINOXY Live Script Generator',
      description: 'สร้างสคริปต์ไลฟ์สำหรับ SKINOXY TikTok ตาม Pattern ทดลอง August 2026',
      knowledge_file: 'skinoxy-products.json',
      sample_file: 'sample-promotions.txt',
      placeholder: '1. Toner Pad 1 กระปุก ราคาปกติ 399 พิเศษ 239 + คูปองลดเพิ่ม 18% เหลือเพียง 196.- (จำนวนจำกัด)'
    },
    {
      id: 'skinoxy-shopee',
      account_code: 'SKN-SP',
      label: 'SKINOXY Shopee',
      brand_key: 'skinoxy',
      knowledge_brand_id: 'skinoxy',
      platform: 'shopee',
      primary: true,
      title: 'SKINOXY Shopee Live Script Generator',
      description: 'สร้างสคริปต์ไลฟ์ Shopee ที่เข้าโปรเร็ว ช่วยเลือกสูตร และคุม Product Truth',
      knowledge_file: 'skinoxy-products.json',
      sample_file: 'sample-skinoxy-shopee-promotions.txt',
      placeholder: 'โปรซื้อยกกล่องคุ้มกว่าเดิม!\n>> https://s.shopee.co.th/xxxxxxxxxx\n\nรายละเอียดสินค้าและสูตรที่เลือกได้...\n\nราคาพิเศษ:\nซื้อ 1 กล่อง เพียง 251.- (จากปกติ 499.-)\nซื้อ 2 กล่อง เพียง 412.- (จากปกติ 998.-)'
    },
    {
      id: 'kmb',
      account_code: 'KISS-TT',
      label: 'KISS TikTok',
      brand_key: 'kiss',
      knowledge_brand_id: 'kmb',
      platform: 'tiktok',
      primary: true,
      title: 'KISS Live Script Generator',
      description: 'สร้างสคริปต์ TikTok Live สำหรับ KISS MY BODY ตามกลิ่น Mood และโอกาสใช้งาน',
      knowledge_file: 'kmb-products.json',
      sample_file: 'sample-kmb-promotions.txt',
      placeholder: '1. เซตคู่ความมั่นใจหอมตลอดวัน\nEDT Revamp กลิ่น Sweet Poison\n+ Underarm Dry Serum สูตร Blink Bright สีชมพู\nราคาปกติ 478 บาท\nราคาพิเศษ 329 บาท'
    },
    {
      id: 'kmb-shopee',
      account_code: 'KISS-SP',
      label: 'KISS Shopee',
      brand_key: 'kiss',
      knowledge_brand_id: 'kmb',
      platform: 'shopee',
      primary: true,
      title: 'KISS Shopee Live Script Generator',
      description: 'สร้างสคริปต์ Shopee Live สำหรับ KISS MY BODY ที่เน้นสินค้า ราคา ตัวเลือก และความคุ้มค่า',
      knowledge_file: 'kmb-products.json',
      sample_file: 'sample-kmb-shopee-promotions.txt',
      placeholder: 'เซตกลิ่นหอมมั่นใจ จับคู่ EDT + Underarm ครบในเซตเดียว\n>> https://s.shopee.co.th/xxxxxxxxxx\n\nEDT Revamp กลิ่น Sweet Poison + Underarm Dry Serum สูตร Blink Bright สีชมพู\n\nเซตคู่ เพียง 329.- (จากปกติ 478.-)'
    },
    {
      id: 'dgmr',
      account_code: 'DGMR-TT',
      label: 'DGMR TikTok',
      brand_key: 'dgmr',
      knowledge_brand_id: 'dgmr',
      platform: 'tiktok',
      primary: true,
      title: 'DGMR Live Script Generator',
      description: 'สร้างสคริปต์ TikTok Live สำหรับ DAENG GI MEO RI ตาม Slot ทดลอง August 2026',
      knowledge_file: 'dgmr-products.json',
      sample_file: 'sample-dgmr-promotions.txt',
      placeholder: '1. แชมพู 2 ขวด + ครีมนวด 1 ขวด\nรับฟรี ผ้าโพกผมซับน้ำ 1 ชิ้น มูลค่า 399 บาท\nราคาปกติ 4,269 บาท\nราคาพิเศษ 2,350 บาท'
    },
    {
      id: 'dgmr-shopee',
      account_code: 'DGMR-SP',
      label: 'DGMR Shopee',
      brand_key: 'dgmr',
      knowledge_brand_id: 'dgmr',
      platform: 'shopee',
      primary: false,
      future_ready: true,
      title: 'DGMR Shopee Live Script Generator',
      description: 'ซ่อนจาก Account Selector รอบ August แต่เก็บไว้รองรับอนาคต',
      knowledge_file: 'dgmr-products.json',
      sample_file: 'sample-dgmr-shopee-promotions.txt',
      placeholder: 'Hair Fall Complete Set แชมพู + ครีมนวด + Hair Tonic ดูแลผมร่วงครบ Routine'
    }
  ];

  root.LSG_ACCOUNTS = ACCOUNTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = ACCOUNTS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
