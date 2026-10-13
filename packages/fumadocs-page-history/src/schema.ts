import { z } from 'zod';

/** Extend your page schema with these fields to retain per-page controls. */
export const gitChangelogSchema = z.object({
  authors: z.array(z.string()).optional(),
  gitChangelog: z
    .union([
      z.boolean(),
      z.object({
        disableChangelog: z.boolean().optional(),
        disableContributors: z.boolean().optional(),
      }),
    ])
    .optional(),
});
