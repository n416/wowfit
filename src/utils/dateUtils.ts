// ★★★ 修正: getMonthDays をエクスポートする ★★★
// (カレンダーの日付データを生成するヘルパー)
export const getMonthDays = (year: number, month: number) => {
  const date = new Date(year, month - 1, 1);
  const days = [];
  // (曜日の日本語配列)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  
  while (date.getMonth() === month - 1) {
    const day = date.getDate();
    const dayOfWeek = date.getDay();
    days.push({
      // (YYYY-MM-DD 形式)
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      weekday: weekdays[dayOfWeek],
      dayOfWeek: dayOfWeek,
    });
    date.setDate(day + 1);
  }
  return days;
};

// ★★★ 削除: ハードコードされた MONTH_DAYS を削除 ★★★
// (※削除) export const MONTH_DAYS = getMonthDays(2025, 11);

// ★★★ 修正: 引数として動的な monthDays を受け取るように変更 ★★★
export const getDefaultRequiredHolidays = (monthDays: { dayOfWeek: number }[]): number => {
  // (※注: 現状は祝日を考慮できず、土日の数だけをカウントしています)
  return monthDays.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6).length;
};

// ★★★ 変更なし (元から動的) ★★★
export const getPrevDateStr = (dateStr: string) => {
  const d = new Date(dateStr.replace(/-/g, '/')); // JSTで日付オブジェクトを作成
  d.setDate(d.getDate() - 1); // 1日引く
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};