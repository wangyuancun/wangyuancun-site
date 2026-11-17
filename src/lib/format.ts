/** 日期与阅读时长的统一格式化：固定按 Asia/Shanghai，避免 CI（UTC）算错一天 */

const ZH = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const EN = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 2026 年 11 月 17 日 */
export const fmtDateZh = (d: Date) => ZH.format(d).replace(/\s/g, '');

/** Nov 17, 2026 */
export const fmtDateEn = (d: Date) => EN.format(d);

/** 2026-11-17（用于 <time datetime> 与 RSS） */
export const fmtISODate = (d: Date) => ISO.format(d);

/** 中文按 400 字/分钟、英文按 200 词/分钟估算，最少 1 分钟 */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const cn = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (body.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
  return Math.max(1, Math.round(cn / 400 + en / 200));
}
