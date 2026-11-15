import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 唯一的文章集合：/blog 列表与 /blog/<slug> 文章页都读这里
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    // 公众号原文链接，没有就写空字符串
    wechatUrl: z.string().url().or(z.literal('')).default(''),
  }),
});

export const collections = { blog };
