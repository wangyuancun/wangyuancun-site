import { defineConfig, passthroughImageService } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://wangyuancun.com',
  integrations: [sitemap()],
  image: { service: passthroughImageService() },
  markdown: {
    shikiConfig: { theme: 'github-dark' },
  },
});
