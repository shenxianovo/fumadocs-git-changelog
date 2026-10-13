import type { TranslationExtension, TranslationPreset } from 'fumadocs-core/i18n';
import translationKeys from '../.translations/keys.json';
import type { Translations } from '../.translations';

export type { Translations };

const translations = {
  'Page history(git changelog)': '页面历史',
  'Last edited(git changelog)': '最后编辑于',
  'View full history(git changelog)': '查看完整历史',
  'No history yet.(git changelog)': '暂无变更历史。',
  'Oldest first(git changelog)': '最早提交优先',
  'Newest first(git changelog)': '最新提交优先',
  'Contributors(git changelog)': '贡献者',
  'Commit details(git changelog)': '提交详情',
  'No contributors yet.(git changelog)': '暂无贡献者。',
  'Commits(git changelog)': '次提交',
  'Commit(git changelog)': '次提交',
  'Collapse history(git changelog)': '收起历史',
} satisfies Translations;

export type GitChangelogTranslationKey = keyof Translations;
export function gitChangelogTranslations(): TranslationExtension<GitChangelogTranslationKey> {
  return { keys: translationKeys as GitChangelogTranslationKey[] };
}
export function zhCN(): TranslationPreset<GitChangelogTranslationKey> {
  return { name: 'zh-CN', value: translations };
}
