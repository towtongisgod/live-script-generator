(function(root){
  const SELLING_PATTERNS = {
    A: {
      key: 'A',
      label: 'A — Diagnose & Educate',
      short_name: 'Diagnose & Educate',
      style: 'วิเคราะห์ปัญหา → ให้ข้อมูล → แนะนำ',
      objective: 'ช่วยลูกค้าระบุปัญหา ให้ข้อมูลเพื่อเลือกสินค้า และสร้างความน่าเชื่อถือก่อนชวนกดดูสินค้า',
      copy_hint: 'วิเคราะห์ปัญหา ให้ข้อมูล และแนะนำสินค้าให้ตรงกับสิ่งที่ลูกค้ากำลังเจอ',
      tone: 'ชัด อธิบายง่าย เป็นที่ปรึกษา',
      sequence: ['problem', 'self_check', 'simple_education', 'product_bridge', 'choice_or_usage', 'value', 'cta'],
      marker_order: ['diagnosis', 'education', 'value']
    },
    B: {
      key: 'B',
      label: 'B — Lifestyle & Engagement',
      short_name: 'Lifestyle & Engagement',
      style: 'สถานการณ์ → ความรู้สึก → ชวนคุย → เชื่อมสินค้า',
      objective: 'ทำให้คนดูรู้สึกเกี่ยวข้อง เพิ่ม Watch Time และเชื่อมสินค้าเข้ากับชีวิตประจำวัน',
      copy_hint: 'เริ่มจากสถานการณ์ที่คนดูเข้าใจ ชวนคอมเมนต์ แล้วค่อยเชื่อมสินค้าและโปร',
      tone: 'เป็นกันเอง มีภาพชีวิตประจำวัน ชวนคุย',
      sequence: ['scenario', 'feeling', 'engagement', 'product_bridge', 'experience', 'promotion', 'friendly_cta'],
      marker_order: ['scenario', 'engagement', 'promotion']
    },
    C: {
      key: 'C',
      label: 'C — Value & Closing',
      short_name: 'Value & Closing',
      style: 'โปร → ความคุ้มค่า → แก้ข้อกังวล → ปิดการขาย',
      objective: 'ปิดการขาย ลดความลังเล และทำให้เห็นความคุ้มค่าโดยไม่สร้างข้อมูลเท็จ',
      copy_hint: 'เข้าโปรก่อน แจกแจงของที่ได้ เทียบความคุ้มค่า ตอบข้อกังวล และปิดแบบชัดเจน',
      tone: 'กระชับ ชัดเรื่องดีล ไม่กดดันเกินไป',
      sequence: ['deal', 'bundle_value', 'price_logic', 'fit', 'objection', 'reason_now', 'closing_cta'],
      marker_order: ['promotion', 'value', 'objection']
    }
  };

  root.SELLING_PATTERNS = SELLING_PATTERNS;
  if (typeof module !== 'undefined' && module.exports) module.exports = SELLING_PATTERNS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
