import { fileURLToPath } from 'node:url';
import type { MdastPluginDefinition } from 'satteri';
import { createFooter, type GitChangelogOptions } from './plugins/shared';
import type { ChangelogFrontmatter } from './index';

export type { GitChangelogOptions } from './plugins/shared';

/** Sätteri counterpart of remarkGitChangelog, with the same options. */
export function gitChangelog(options: GitChangelogOptions): MdastPluginDefinition {
  const footer = createFooter(options);
  return {
    name: 'git-changelog',
    async after(root, ctx) {
      const nodes = await footer(
        ctx.fileURL ? fileURLToPath(ctx.fileURL) : '',
        (ctx.data.frontmatter ?? {}) as ChangelogFrontmatter,
        root,
      );
      if (!nodes) return;
      ctx.prependChild(root, nodes[0]);
      for (const node of nodes.slice(1)) ctx.appendChild(root, node);
    },
  };
}
