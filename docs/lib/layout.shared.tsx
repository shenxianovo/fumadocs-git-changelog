import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'Page History' },
    links: [
      { text: 'Documentation', url: '/docs', active: 'nested-url' },
      { text: 'Demo', url: '/docs/demo' },
    ],
  };
}
