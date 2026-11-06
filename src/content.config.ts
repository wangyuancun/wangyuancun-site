import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    column: z.enum(['坑', '库', '习惯', '开源', '生活']).default('坑'),
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
