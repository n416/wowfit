// src/utils/dateUtils.ts
import JapaneseHolidays from 'japanese-holidays';

// ★ 型定義を一元化してエクスポート（前回のスクリプトがこれを参照します）
export type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
  holidayName?: string; // ★ 追加: 祝日名 (例: "元日")
};

export const getMonthDays = (year: number, month: number): MonthDay[] => {
  const date = new Date(year, month - 1, 1);
  const days: MonthDay[] = [];
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  
  while (date.getMonth() === month - 1) {
    const day = date.getDate();
    const dayOfWeek = date.getDay();
    
    // ★ 祝日判定 (祝日なら名前が返る、そうでなければ undefined)
    const holidayName = JapaneseHolidays.isHoliday(date);

    days.push({
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      weekday: weekdays[dayOfWeek],
      dayOfWeek: dayOfWeek,
      holidayName: holidayName || undefined,
    });
    date.setDate(day + 1);
  }
  return days;
};

export const getDefaultRequiredHolidays = (monthDays: MonthDay[]): number => {
  // ★ 修正: 土日 または 祝日 の数をカウント
  return monthDays.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6 || d.holidayName).length;
};

export const getPrevDateStr = (dateStr: string) => {
  const d = new Date(dateStr.replace(/-/g, '/')); 
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};