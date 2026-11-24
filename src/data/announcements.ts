/**
 * 首页公告配置。
 *
 * 维护方式：只改这个数组，页面和组件里不写死任何一条公告。
 * - 同一时间只显示一条：按数组顺序取第一条处于展示期内的。
 * - end 必填；没有特殊理由就用 defaultEnd(start)，默认展示 14 天。
 * - start / end 都是 YYYY-MM-DD；start 当天上线，end 当天结束后下线。
 */

export type AnnouncementType = 'series' | 'product' | 'notice';

export interface Announcement {
  type: AnnouncementType;
  title: string;
  href: string;
  /** 开始展示的日期，YYYY-MM-DD */
  start: string;
  /** 结束展示的日期，YYYY-MM-DD，必填 */
  end: string;
  /** 标题后面的一句话补充，可省略 */
  note?: string;
  /** 左侧小标文案；不填时按 type 取默认值 */
  label?: string;
}

export const DEFAULT_ANNOUNCEMENT_DAYS = 14;

export const ANNOUNCEMENT_LABELS: Record<AnnouncementType, string> = {
  series: '新连载',
  product: '新产品',
  notice: '公告',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 用本地时区把 Date 变成 YYYY-MM-DD，保证构建机与读者浏览器口径一致 */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 默认结束日期：从 start 起算 14 天 */
export function defaultEnd(start: string, days = DEFAULT_ANNOUNCEMENT_DAYS): string {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/**
 * 关闭记忆的 localStorage key。
 * 每条公告独立，换一条公告不会继承上一条的「已关闭」状态。
 */
export function announcementKey(a: Announcement): string {
  return `announce:dismissed:${a.start}:${a.type}:${a.href}`;
}

/**
 * 当前要展示的公告。
 * 构建时就过滤掉已过期 / 未开始的条目；多条同时有效时按配置顺序取第一条。
 */
export const announcements: Announcement[] = [
  {
    type: 'series',
    title: 'AgentScope 拆解',
    href: '/blog/series/agentscope/',
    start: '2026-11-23',
    end: defaultEnd('2026-11-23'),
    note: '第 1 篇《Spring Boot 是怎么把 Agent「装」起来的？》已发布',
  },
];

export function getActiveAnnouncement(today = toISODate(new Date())): Announcement | undefined {
  return announcements.find((a) => a.start <= today && today <= a.end);
}
