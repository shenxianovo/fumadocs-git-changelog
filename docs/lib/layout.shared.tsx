import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'Git Changelog' },
    links: [
      { text: 'Documentation', url: '/docs', active: 'nested-url' },
      { text: 'Demo', url: '/docs/demo' },
    ],
  };
}
