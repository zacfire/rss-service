/**
 * V7-Rethink: Creator Trust配置
 *
 * 定义VIP创作者和常读源的信任度
 */

export interface CreatorConfig {
  name: string;
  trust: number;  // 1.0 = followed, 0.8 = frequent, 0.3 = others
  topics: string[];
}

/**
 * VIP创作者（用户主动关注的创作者）
 * trust = 1.0
 */
export const FOLLOWED_CREATORS: CreatorConfig[] = [
  {
    name: '阮一峰的网络日志',
    trust: 1.0,
    topics: ['个人博客', '技术'],
  },
  {
    name: 'Ben Thompson',
    trust: 1.0,
    topics: ['投资', '科技战略', '商业分析'],
  },
  {
    name: 'Paul Graham',
    trust: 1.0,
    topics: ['创业', '技术', '个人博客'],
  },
  {
    name: 'Brad Feld',
    trust: 1.0,
    topics: ['投资', '创业'],
  },
  {
    name: 'MBI Deep Dives',
    trust: 1.0,
    topics: ['投资', '商业分析'],
  },
];

/**
 * 常读源（基于历史阅读数据识别的高频源）
 * trust = 0.8
 */
export const FREQUENT_SOURCES: string[] = [
  'The Verge',
  'LessWrong',
  '极客公园',
  '9to5Mac',
  'V2EX - 创意',
  'The Official Google Blog',
];

/**
 * 获取创作者信任度
 */
export function getCreatorTrust(publisher: string): number {
  // 1. 检查是否是VIP创作者
  const followed = FOLLOWED_CREATORS.find(c => c.name === publisher);
  if (followed) return followed.trust;

  // 2. 检查是否是常读源
  if (FREQUENT_SOURCES.includes(publisher)) return 0.8;

  // 3. 默认信任度
  return 0.3;
}

/**
 * 检查是否是个人创作者
 */
export function isIndividualCreator(publisherType: string): boolean {
  return publisherType === 'individual';
}

/**
 * 获取创作者配置
 */
export function getCreatorConfig(publisher: string): CreatorConfig | null {
  return FOLLOWED_CREATORS.find(c => c.name === publisher) || null;
}
