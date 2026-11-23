import type { CollectionEntry } from 'astro:content';
import { getPublishedPosts } from './blog';

type BlogPost = CollectionEntry<'blog'>;

export interface SeriesMeta {
  /** 系列中文名 */
  name: string;
  /** 系列介绍，一句话 */
  intro: string;
}

/**
 * 系列标识 → 中文名与介绍。
 * 表里没有的系列用原始标识兜底，不写进表也能正常出页。
 */
export const SERIES: Record<string, SeriesMeta> = {
  agentscope: {
    name: 'AgentScope 拆解',
    intro:
      '一次 Agent 回复背后，框架到底做了什么。顺着源码往下读，把抽象的名字对回具体的代码。',
  },
};

export function seriesMeta(id: string): SeriesMeta {
  return SERIES[id] ?? { name: id, intro: '' };
}

/** 系列内排序：seriesOrder 升序；缺序号的排在后面，按日期倒序 */
export function sortSeriesPosts(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => {
    const ao = a.data.seriesOrder;
    const bo = b.data.seriesOrder;
    if (ao === undefined && bo === undefined) return b.data.date.valueOf() - a.data.date.valueOf();
    if (ao === undefined) return 1;
    if (bo === undefined) return -1;
    if (ao !== bo) return ao - bo;
    return b.data.date.valueOf() - a.data.date.valueOf();
  });
}

/** 某系列的已发布文章，已按系列内顺序排好；与列表页共用同一套发布时间过滤 */
export async function getSeriesPosts(series: string): Promise<BlogPost[]> {
  const posts = await getPublishedPosts();
  return sortSeriesPosts(posts.filter((post) => post.data.series === series));
}
