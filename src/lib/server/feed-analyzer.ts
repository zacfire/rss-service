/**
 * Feed Analyzer Service
 * 
 * 分析 RSS feeds 的发布者类型和权威度
 * 移植自原项目 scripts/analyze-feeds.ts
 */

import Parser from 'rss-parser';

// ==================== 类型定义 ====================

export interface FeedAnalysis {
    url: string;
    title: string;

    // Feed 级别元数据
    feedAuthor?: string;
    feedDescription?: string;
    feedLink?: string;

    // Item 级别统计
    totalItems: number;
    authorsFound: string[];
    consistentAuthor: boolean;

    // 推断结果
    type: 'personal' | 'media' | 'org' | 'unknown';
    confidence: number;
    reasoning: string;
}

export interface Publisher {
    name: string;
    type: 'individual' | 'organization' | 'media' | 'unknown';
    subtype?: string;
    authority: number;
}

export interface FeedClassification {
    url: string;
    title: string;
    publisher: Publisher;
    topics: {
        primary: string;
        secondary?: string[];
    };
    weight: number;
}

export interface UserProfile {
    keyPublishers: Array<{
        name: string;
        type: string;
        subtype?: string;
        authority: number;
        weight: number;
        topics: string[];
    }>;
    sourceWeights: Record<string, number>;
    topics: string[];
}

// ==================== RSS Parser ====================

const parser = new Parser({
    customFields: {
        feed: ['author', 'webMaster', 'managingEditor'],
        item: ['author', 'dc:creator', 'creator'],
    },
    timeout: 10000,
});

// ==================== 分析单个 Feed ====================

export async function analyzeFeed(url: string, timeout = 10000): Promise<FeedAnalysis> {
    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), timeout);
        });

        const fetchPromise = parser.parseURL(url);
        const feed = await Promise.race([fetchPromise, timeoutPromise]) as any;

        // 提取 feed 级别作者
        const feedAuthor = feed.author || feed.webMaster || feed.managingEditor;

        // 分析所有文章的作者
        const authorsSet = new Set<string>();
        feed.items?.forEach((item: any) => {
            const author = item.creator || item.author || item['dc:creator'];
            if (author && typeof author === 'string') {
                authorsSet.add(author);
            }
        });

        const authorsFound = Array.from(authorsSet);
        const consistentAuthor = authorsFound.length === 1;

        // 推断类型
        const { type, confidence, reasoning } = inferPublisherType(
            feed.title || '',
            feed.description || '',
            feed.link || '',
            feedAuthor,
            authorsFound,
            consistentAuthor
        );

        return {
            url,
            title: feed.title || '',
            feedAuthor: typeof feedAuthor === 'string' ? feedAuthor : undefined,
            feedDescription: feed.description,
            feedLink: feed.link,
            totalItems: feed.items?.length || 0,
            authorsFound,
            consistentAuthor,
            type,
            confidence,
            reasoning,
        };
    } catch (error: any) {
        const errorMsg = error.message?.slice(0, 100) || 'Unknown error';
        return {
            url,
            title: '',
            totalItems: 0,
            authorsFound: [],
            consistentAuthor: false,
            type: 'unknown',
            confidence: 0,
            reasoning: `Error: ${errorMsg}`,
        };
    }
}

// ==================== 推断发布者类型 ====================

function inferPublisherType(
    title: string,
    description: string,
    link: string,
    feedAuthor: string | undefined,
    authorsFound: string[],
    consistentAuthor: boolean
): { type: 'personal' | 'media' | 'org' | 'unknown'; confidence: number; reasoning: string } {
    const reasons: string[] = [];
    const score = { personal: 0, media: 0, org: 0 };

    // 规则 1: 域名判断
    const domain = extractDomain(link);
    if (isPersonalDomain(domain)) {
        score.personal += 30;
        reasons.push(`个人域名: ${domain}`);
    }

    if (isMediaDomain(domain)) {
        score.media += 30;
        reasons.push(`知名媒体域名: ${domain}`);
    }

    if (isOrgDomain(domain)) {
        score.org += 30;
        reasons.push(`机构域名: ${domain}`);
    }

    // 规则 2: 标题判断
    const titleLower = title.toLowerCase();

    if (titleLower.includes("'s blog") || titleLower.includes("'s website") ||
        titleLower.includes("'s newsletter") || titleLower.match(/^[\w\s]+ - blog$/i)) {
        score.personal += 25;
        reasons.push('标题包含个人博客标识');
    }

    if (titleLower.includes('news') || titleLower.includes('daily') ||
        titleLower.includes('times') || titleLower.includes('post')) {
        score.media += 20;
        reasons.push('标题包含媒体关键词');
    }

    // 规则 3: 作者一致性
    if (consistentAuthor && authorsFound.length === 1) {
        score.personal += 35;
        reasons.push(`所有文章同一作者: ${authorsFound[0]}`);
    } else if (authorsFound.length > 5) {
        score.media += 25;
        reasons.push(`多作者 (${authorsFound.length} 位)`);
    } else if (authorsFound.length >= 3) {
        score.media += 15;
        score.org += 10;
        reasons.push(`多作者团队 (${authorsFound.length} 位)`);
    }

    // 规则 4: Feed 作者字段
    if (feedAuthor && typeof feedAuthor === 'string') {
        const authorLower = feedAuthor.toLowerCase();
        if (authorLower.includes('@') || authorLower.includes('email')) {
            score.personal += 15;
            reasons.push(`Feed 作者字段存在: ${feedAuthor}`);
        }
    }

    // 规则 5: 描述判断
    const descLower = description.toLowerCase();
    if (descLower.includes('personal') || descLower.includes('my thoughts') ||
        descLower.includes('i write') || descLower.match(/\b(i|my|me)\b/)) {
        score.personal += 15;
        reasons.push('描述使用第一人称');
    }

    // 规则 6: 默认单一作者为个人博客
    const currentMax = Math.max(score.personal, score.media, score.org);
    if (currentMax === 0 && consistentAuthor && authorsFound.length === 1) {
        score.personal += 25;
        reasons.push('单一作者发布,默认为个人博客');
    }

    // 确定最终类型
    const maxScore = Math.max(score.personal, score.media, score.org);
    let type: 'personal' | 'media' | 'org' | 'unknown' = 'unknown';

    if (maxScore >= 20) {
        if (score.personal === maxScore) type = 'personal';
        else if (score.media === maxScore) type = 'media';
        else if (score.org === maxScore) type = 'org';
    }

    const confidence = maxScore / 100;
    const reasoning = reasons.join('; ');

    return { type, confidence, reasoning };
}

// ==================== 域名判断辅助函数 ====================

function extractDomain(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function isPersonalDomain(domain: string): boolean {
    const personal = [
        'paulgraham.com', 'nav.al', 'stratechery.com', 'eugenewei.com',
        'tomtunguz.com', 'steveblank.com', 'tim.blog', 'avc.com',
        'feld.com', 'ben-evans.com',
    ];

    return personal.some(d => domain.includes(d)) ||
        domain.match(/^[\w-]+\.(me|name|io)$/i) !== null;
}

function isMediaDomain(domain: string): boolean {
    const media = [
        'theverge.com', 'techcrunch.com', 'arstechnica.com', 'wired.com',
        'nytimes.com', 'theguardian.com', 'bbc.co.uk', 'cnn.com',
        'geekpark.net', 'ifanr.com', 'sspai.com', '36kr.com',
    ];

    return media.some(d => domain.includes(d));
}

function isOrgDomain(domain: string): boolean {
    const orgs = [
        'anthropic.com', 'openai.com', 'google.com', 'apple.com',
        'tesla.com', 'ycombinator.com', 'sequoiacap.com', 'a16z.com',
    ];

    return orgs.some(d => domain.includes(d));
}

// ==================== 生成用户画像 ====================

export function generateUserProfile(
    analyses: FeedAnalysis[],
    feeds: Array<{ url: string; title: string; publisher: string }>
): UserProfile {
    // 构建分类结果
    const classifications: FeedClassification[] = analyses.map((analysis, i) => {
        const feed = feeds[i];

        // 识别发布者名称
        let publisherName = feed?.publisher || '';
        if (!publisherName && analysis.consistentAuthor && analysis.authorsFound.length === 1) {
            publisherName = analysis.authorsFound[0];
        }
        if (!publisherName) {
            publisherName = analysis.title || 'Unknown';
        }

        // 计算权重
        let weight = 0.7; // 默认权重
        if (analysis.type === 'personal' && analysis.consistentAuthor) {
            weight = 0.8 + analysis.confidence * 0.15; // 0.8 - 0.95
        } else if (analysis.type === 'org') {
            weight = 0.85 + analysis.confidence * 0.1; // 0.85 - 0.95
        } else if (analysis.type === 'media') {
            weight = 0.7 + analysis.confidence * 0.1; // 0.7 - 0.8
        }

        // 确定发布者类型
        let publisherType: 'individual' | 'organization' | 'media' | 'unknown' = 'unknown';
        if (analysis.type === 'personal') publisherType = 'individual';
        else if (analysis.type === 'org') publisherType = 'organization';
        else if (analysis.type === 'media') publisherType = 'media';

        return {
            url: analysis.url,
            title: analysis.title || feed?.title || '',
            publisher: {
                name: publisherName,
                type: publisherType,
                authority: analysis.confidence,
            },
            topics: {
                primary: 'General', // 可以通过 category 参数传入
            },
            weight: Number(weight.toFixed(2)),
        };
    });

    // 提取关键发布者 (authority >= 0.5)
    const keyPublishers = classifications
        .filter(c => c.publisher.authority >= 0.5)
        .map(c => ({
            name: c.publisher.name,
            type: c.publisher.type,
            authority: c.publisher.authority,
            weight: c.weight,
            topics: [c.topics.primary, ...(c.topics.secondary || [])].filter(Boolean),
        }))
        .sort((a, b) => b.authority - a.authority)
        .slice(0, 40); // 最多 40 个

    // 构建 sourceWeights
    const sourceWeights: Record<string, number> = {};
    classifications.forEach(c => {
        sourceWeights[c.url] = c.weight;
    });

    // 提取主题
    const topics = Array.from(new Set(classifications.map(c => c.topics.primary)));

    return {
        keyPublishers,
        sourceWeights,
        topics,
    };
}

// ==================== 生成用户兴趣描述 ====================

export function generateInterestsDescription(
    analyses: FeedAnalysis[],
    profile: UserProfile
): string {
    const lines: string[] = [];

    // 统计源类型
    const typeCount = {
        personal: analyses.filter(a => a.type === 'personal').length,
        media: analyses.filter(a => a.type === 'media').length,
        org: analyses.filter(a => a.type === 'org').length,
    };

    // 总结订阅偏好
    const totalFeeds = analyses.length;
    const preferences: string[] = [];

    if (typeCount.personal > totalFeeds * 0.3) {
        preferences.push('独立创作者/博客');
    }
    if (typeCount.media > totalFeeds * 0.2) {
        preferences.push('科技/商业媒体');
    }
    if (typeCount.org > totalFeeds * 0.1) {
        preferences.push('机构/公司官方');
    }

    if (preferences.length > 0) {
        lines.push(`• 偏好内容来源：${preferences.join('、')}`);
    }

    // 列出关键创作者（最多 5 个）
    const topPublishers = profile.keyPublishers
        .filter(p => p.type === 'individual')
        .slice(0, 5)
        .map(p => p.name);

    if (topPublishers.length > 0) {
        lines.push(`• 关注的创作者：${topPublishers.join('、')}`);
    }

    // 列出关注的机构（最多 3 个）
    const topOrgs = profile.keyPublishers
        .filter(p => p.type === 'organization')
        .slice(0, 3)
        .map(p => p.name);

    if (topOrgs.length > 0) {
        lines.push(`• 关注的机构：${topOrgs.join('、')}`);
    }

    // 如果没有足够信息，使用通用描述
    if (lines.length === 0) {
        return '• 一位关注科技、创业和投资领域的读者';
    }

    return lines.join('\n');
}

// ==================== 批量分析 Feeds ====================

export async function analyzeFeeds(
    feeds: Array<{ url: string; title: string; publisher: string }>,
    concurrency = 5
): Promise<{ analyses: FeedAnalysis[]; profile: UserProfile; generatedInterests: string }> {
    console.log(`🔍 分析 ${feeds.length} 个 feeds...`);

    const analyses: FeedAnalysis[] = [];

    // 分批处理，避免请求过多
    for (let i = 0; i < feeds.length; i += concurrency) {
        const batch = feeds.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(f => analyzeFeed(f.url))
        );
        analyses.push(...batchResults);

        // 简单延迟避免被限流
        if (i + concurrency < feeds.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const successCount = analyses.filter(a => a.type !== 'unknown').length;
    console.log(`✅ 分析完成: 成功 ${successCount}, 失败 ${analyses.length - successCount}`);

    // 生成用户画像
    const profile = generateUserProfile(analyses, feeds);
    console.log(`📊 生成用户画像: ${profile.keyPublishers.length} 个关键发布者`);

    // 生成兴趣描述
    const generatedInterests = generateInterestsDescription(analyses, profile);
    console.log(`📝 生成兴趣描述`);

    return { analyses, profile, generatedInterests };
}
