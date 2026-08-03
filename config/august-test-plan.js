(function(root){
  const AUGUST_TEST_PLAN = {
    year: 2026,
    month: 8,
    pretest_days: [1, 2, 3],
    start_day: 4,
    accounts: {
      skinoxy: {
        blocks: [
          { id: 'daytime', label: 'Daytime', start: '03:00', end: '17:59', sequence: ['A', 'B', 'C', 'B', 'C', 'A'] },
          { id: 'prime', label: 'Prime', start: '18:00', end: '02:59', sequence: ['B', 'C', 'A', 'A', 'B', 'C'] }
        ]
      },
      'skinoxy-shopee': {
        blocks: [
          { id: 'daytime', label: 'Daytime', start: '06:00', end: '17:59', sequence: ['A', 'B', 'C', 'B', 'C', 'A'] },
          { id: 'prime', label: 'Prime Sales', start: '18:00', end: '02:59', sequence: ['B', 'C', 'A', 'A', 'B', 'C'] }
        ]
      },
      kmb: {
        daily: { id: 'daily', label: 'Daily Rotation', sequence: ['A', 'B', 'C', 'C', 'A', 'B', 'B', 'C', 'A'] }
      },
      'kmb-shopee': {
        daily: { id: 'daily', label: 'Daily Rotation', sequence: ['A', 'B', 'C', 'B', 'C', 'A', 'C', 'A', 'B'] }
      },
      dgmr: {
        exact_slots: {
          '10:00': { id: 'morning', label: '10:00 Morning', sequence: ['A', 'B', 'C'] },
          '14:00': { id: 'afternoon', label: '14:00 Afternoon', sequence: ['B', 'C', 'A'] },
          '19:00': { id: 'evening', label: '19:00 Evening', sequence: ['C', 'A', 'B'] },
          '21:00': { id: 'prime', label: '21:00 Prime Time', sequence: ['A', 'B', 'C'] }
        }
      }
    }
  };

  function parseLiveDate(liveDate){
    const value = String(liveDate || '').trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    return { year, month, day };
  }

  function parseTimeToMinutes(startTime){
    const value = String(startTime || '').trim();
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function timeInRange(minutes, start, end){
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (minutes === null || startMinutes === null || endMinutes === null) return false;
    if (startMinutes <= endMinutes) return minutes >= startMinutes && minutes <= endMinutes;
    return minutes >= startMinutes || minutes <= endMinutes;
  }

  function dayIndexFor(dateInfo, sequenceLength){
    if (!dateInfo || !sequenceLength) return null;
    return ((dateInfo.day - AUGUST_TEST_PLAN.start_day) % sequenceLength + sequenceLength) % sequenceLength;
  }

  function isAugustPretest(dateInfo){
    return Boolean(dateInfo
      && dateInfo.year === AUGUST_TEST_PLAN.year
      && dateInfo.month === AUGUST_TEST_PLAN.month
      && AUGUST_TEST_PLAN.pretest_days.includes(dateInfo.day));
  }

  function isBeforeTestStart(dateInfo){
    return Boolean(dateInfo
      && dateInfo.year === AUGUST_TEST_PLAN.year
      && dateInfo.month === AUGUST_TEST_PLAN.month
      && dateInfo.day < AUGUST_TEST_PLAN.start_day);
  }

  function normalizePatternKey(pattern){
    const value = String(pattern || '').toUpperCase();
    return ['A', 'B', 'C'].includes(value) ? value : null;
  }

  function resolveAutoPattern(accountId, liveDate, startTime){
    const dateInfo = parseLiveDate(liveDate);
    const minutes = parseTimeToMinutes(startTime);
    const accountPlan = AUGUST_TEST_PLAN.accounts[accountId];
    const base = {
      account: accountId,
      live_date: liveDate,
      start_time: startTime,
      assigned_pattern: null,
      pattern_source: 'AUTO',
      pattern_style: null,
      test_block: 'Check slot',
      block_id: 'check',
      is_pretest: false,
      include_in_experiment: false,
      needs_manual: true,
      warning: 'Check slot: ไม่พบ Pattern อัตโนมัติสำหรับวันที่หรือเวลานี้'
    };

    if (!dateInfo || minutes === null || !accountPlan) {
      return base;
    }

    if (isAugustPretest(dateInfo) || isBeforeTestStart(dateInfo)) {
      return {
        ...base,
        test_block: 'PRE-TEST',
        block_id: 'pretest',
        is_pretest: true,
        warning: 'PRE-TEST: วันที่ 1-3 August 2026 ไม่รวมผลทดลองและไม่บังคับ Pattern'
      };
    }

    if (dateInfo.year !== AUGUST_TEST_PLAN.year || dateInfo.month !== AUGUST_TEST_PLAN.month || dateInfo.day < AUGUST_TEST_PLAN.start_day) {
      return base;
    }

    if (accountPlan.daily) {
      const sequence = accountPlan.daily.sequence;
      const idx = dayIndexFor(dateInfo, sequence.length);
      return {
        ...base,
        assigned_pattern: sequence[idx],
        test_block: accountPlan.daily.label,
        block_id: accountPlan.daily.id,
        include_in_experiment: true,
        needs_manual: false,
        warning: null
      };
    }

    if (accountPlan.exact_slots) {
      const exact = String(startTime).padStart(5, '0');
      const slot = accountPlan.exact_slots[exact];
      if (!slot) return base;
      const idx = dayIndexFor(dateInfo, slot.sequence.length);
      return {
        ...base,
        assigned_pattern: slot.sequence[idx],
        test_block: slot.label,
        block_id: slot.id,
        include_in_experiment: true,
        needs_manual: false,
        warning: null
      };
    }

    const block = (accountPlan.blocks || []).find(item => timeInRange(minutes, item.start, item.end));
    if (!block) return base;
    const idx = dayIndexFor(dateInfo, block.sequence.length);
    return {
      ...base,
      assigned_pattern: block.sequence[idx],
      test_block: block.label,
      block_id: block.id,
      include_in_experiment: true,
      needs_manual: false,
      warning: null
    };
  }

  function resolveAssignedPattern({ account, platform, liveDate, startTime, startHour, manualPattern, autoPattern = true } = {}){
    const accountId = typeof account === 'string' ? account : account?.id;
    const normalizedTime = startTime || (Number.isFinite(startHour) ? `${String(startHour).padStart(2, '0')}:00` : '');
    const auto = resolveAutoPattern(accountId, liveDate, normalizedTime);
    const manual = normalizePatternKey(manualPattern);

    if (!autoPattern && manual) {
      return {
        ...auto,
        platform,
        assigned_pattern: manual,
        pattern_source: 'MANUAL',
        needs_manual: false,
        warning: auto.is_pretest ? auto.warning : null
      };
    }

    if (autoPattern && auto.assigned_pattern) {
      return { ...auto, platform };
    }

    if (manual) {
      return {
        ...auto,
        platform,
        assigned_pattern: manual,
        pattern_source: 'MANUAL',
        needs_manual: false
      };
    }

    return { ...auto, platform };
  }

  root.AUGUST_TEST_PLAN = AUGUST_TEST_PLAN;
  root.resolveAugustAssignedPattern = resolveAssignedPattern;
  root.parseLiveDate = parseLiveDate;
  root.parseTimeToMinutes = parseTimeToMinutes;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      AUGUST_TEST_PLAN,
      resolveAssignedPattern,
      parseLiveDate,
      parseTimeToMinutes
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
