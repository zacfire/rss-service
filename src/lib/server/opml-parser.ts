/**
 * OPML 文件解析器
 */

interface ParsedFeed {
  url: string;
  title: string;
  publisher: string;
}

interface OPMLOutline {
  type?: string;
  text?: string;
  title?: string;
  xmlUrl?: string;
  htmlUrl?: string;
  children?: OPMLOutline[];
}

/**
 * 解析OPML文件内容，提取RSS订阅源
 */
export function parseOPML(content: string): ParsedFeed[] {
  const feeds: ParsedFeed[] = [];

  // 简单的XML解析（使用正则，避免引入额外依赖）
  // 匹配 <outline> 标签
  const outlineRegex = /<outline[^>]*>/gi;
  const matches = content.matchAll(outlineRegex);

  for (const match of matches) {
    const tag = match[0];

    // 提取属性
    const xmlUrl = extractAttribute(tag, 'xmlUrl') || extractAttribute(tag, 'xmlurl');
    const title = extractAttribute(tag, 'title') || extractAttribute(tag, 'text');
    const text = extractAttribute(tag, 'text');

    // 只处理有xmlUrl的项（实际的RSS订阅）
    if (xmlUrl) {
      feeds.push({
        url: xmlUrl,
        title: title || text || '',
        publisher: text || title || ''
      });
    }
  }

  return feeds;
}

/**
 * 从XML标签中提取属性值
 */
function extractAttribute(tag: string, attrName: string): string | null {
  // 匹配 attrName="value" 或 attrName='value'
  const regex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
  const match = tag.match(regex);
  return match ? decodeHTMLEntities(match[1]) : null;
}

/**
 * 解码HTML实体
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * 验证是否为有效的OPML内容
 */
export function isValidOPML(content: string): boolean {
  // 检查是否包含OPML标签
  return /<opml[^>]*>/i.test(content) || /<outline[^>]*xmlUrl/i.test(content);
}
