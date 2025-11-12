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