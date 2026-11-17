import rss from '@astrojs/rss';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { getPublishedPosts } from '../lib/blog';

export async function GET(context) {
  const posts = (await getPublishedPosts()).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    customData: '<language>zh-cn</language>',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      // 有英文摘要时前置一行英文，方便外文订阅者判断要不要点进来
      description: post.data.summaryEn
        ? `${post.data.summaryEn}\n\n${post.data.summary}`
        : post.data.summary,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
  });
}
