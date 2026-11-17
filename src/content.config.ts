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
    // 列表卡片与分享卡片用的封面（1200×630），没有则用字形占位
    cover: z.string().default(''),
    // 英文摘要：英文门厅与 RSS 使用；留空则回落到 summary
    summaryEn: z.string().default(''),
    // 英文标题：英文门厅使用；留空则回落到 title
    titleEn: z.string().default(''),
    // 是否进首页精选
    featured: z.boolean().default(false),
  }),
});

// 产品/作品集合：/products 列表与 /products/<slug> 详情页都读这里
const products = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/products' }),
  schema: z.object({
    name: z.string(),
    summary: z.string(),
    // 形态、版本等一行信息
    meta: z.string().default(''),
    // 状态标记，如「审核中」「已发布」；空字符串则不显示
    status: z.string().default(''),
    order: z.number().default(0),
    storeLabel: z.string().default(''),
    // 商店链接，没有就写空字符串，页面不会渲染空链接
    storeUrl: z.string().url().or(z.literal('')).default(''),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    shots: z.array(z.object({ src: z.string(), alt: z.string() })).default([]),
    // 英文门厅里的一句话简介；留空则只用中文名
    nameEn: z.string().default(''),
    summaryEn: z.string().default(''),
    // 没有截图时的封面素材：终端输出（每行一条，✓ 开头的行高亮）
    terminalTitle: z.string().default(''),
    terminal: z.array(z.string()).default([]),
    // 没有截图时的封面素材：目录树（每行一条）
    tree: z.array(z.string()).default([]),
  }),
});

export const collections = { blog, products };
