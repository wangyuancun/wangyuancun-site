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
