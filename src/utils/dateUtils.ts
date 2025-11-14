// (カレンダーの日付データを生成するヘルパー)
const getMonthDays = (year: number, month: number) => {
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

// (※仮に2025年11月を対象とする)
export const MONTH_DAYS = getMonthDays(2025, 11);

// ★★★ v5.18 追加: 「今月の土日祝日の数」を計算 (祝日は未対応) ★★★
export const getDefaultRequiredHolidays = (): number => {
  // (※注: 現状は祝日を考慮できず、土日の数だけをカウントしています)
  return MONTH_DAYS.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6).length;
};

// ★★★ v5.18.1 追加: 前日の日付文字列 (YYYY-MM-DD) をローカルタイムで取得 ★★★
export const getPrevDateStr = (dateStr: string) => {
  const d = new Date(dateStr.replace(/-/g, '/')); // JSTで日付オブジェクトを作成
  d.setDate(d.getDate() - 1); // 1日引く
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};