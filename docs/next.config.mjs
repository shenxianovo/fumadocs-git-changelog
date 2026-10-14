import { createMDX } from 'fumadocs-mdx/next';
import { createNextStory } from '@fumadocs/story/next';

const withMDX = createMDX();
const withStory = createNextStory();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  agentRules: false,
  async redirects() {
    return [{ source: '/', destination: '/docs', permanent: true }];
  },
};

export default withStory(withMDX(config));
