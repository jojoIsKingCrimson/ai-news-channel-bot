export function cleanSourceText(value: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\[\s*\.\.\.\s*\]/g, " ")
      .replace(/\bHome\s+Article\b/gi, " ")
      .replace(/#\s+/g, " ")
      .replace(/^[^.。]{0,180}\bdelivers global business and markets news\b[^.。]*[.。]\s*/i, " ")
      .replace(/©\s*\d{4}[\s\S]*?All rights reserved\.?/gi, " ")
      .replace(/\b\d+\+?\s+Discussion\s*\|\s*Link\b/gi, " ")
      .replace(/\bDiscussion\s*\|\s*Link\b/gi, " ")
      .replace(/\|\s*Link\b/gi, " ")
  );
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function firstUsefulSentence(value: string, maxLength: number): string {
  const cleaned = cleanSourceText(value);
  const sentence = cleaned.match(/[^。！？!?；;]{12,}[。！？!?；;]?/)?.[0] ?? cleaned;
  return truncateText(sentence, maxLength);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}
