import { getCollection, type CollectionEntry } from 'astro:content';

type BlogPost = CollectionEntry<'blog'>;

/**
 * 构建时才判定：只有 date 不晚于构建时刻的文章才算已发布。
 * 未到时间的文章不出现在列表、RSS，也不会生成详情页（直接 404）。
 * 到点后由下一次触发部署的 push（push main 会自动构建）把它渲染出来。
 */
export function isPublished(post: BlogPost, now: Date = new Date()): boolean {
  return post.data.date.getTime() <= now.getTime();
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const now = new Date();
  const posts = await getCollection('blog');
  return posts.filter((post) => isPublished(post, now));
}

/** 按时间倒序的已发布文章 */
export async function getSortedPosts(): Promise<BlogPost[]> {
  const posts = await getPublishedPosts();
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/**
 * 首页精选：优先取 frontmatter 里 featured: true 的文章（按时间倒序），
 * 不足 limit 篇时用最新文章补齐。
 */
export async function getFeaturedPosts(limit = 3): Promise<BlogPost[]> {
  const posts = await getSortedPosts();
  const picked = posts.filter((p) => p.data.featured);
  if (picked.length >= limit) return picked.slice(0, limit);
  const rest = posts.filter((p) => !p.data.featured);
  return [...picked, ...rest].slice(0, limit);
}
