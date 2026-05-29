import type { Digest } from "./types.js";

const maxNewsTitleLength = 120;
const maxNewsDetailsLength = 72;
const maxTrendDetailsLength = 48;

export interface TelegramSender {
  sendMessage(
    chatId: string,
    text: string,
    options: { parse_mode: "HTML"; disable_web_page_preview: true }
  ): Promise<unknown>;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDigestHtml(digest: Digest): string {
  const lines = [
    `📡 <b>${escapeHtml(digest.date)} AI Daily</b>`,
    "",
    escapeHtml(digest.headline),
    "",
    `📰 <b>AI重要新闻（${digest.items.length}条）</b>`,
    ""
  ];

  digest.items.forEach((item) => {
    const details = truncateText(
      compactText(item.summary || item.impact),
      maxNewsDetailsLength
    );
    const title = truncateText(compactText(item.title), maxNewsTitleLength);
    lines.push(
      `·<a href="${escapeAttribute(item.url)}">${escapeHtml(title)}</a>，${escapeHtml(details)}`
    );
  });

  if (digest.productHunt?.length) {
    lines.push("", "────────────", "", "🚀 <b>Product Hunt Top 5:</b>");
    const launches = digest.productHunt;
    launches.forEach((launch) => {
      const tagline = launch.tagline
        ? ` - ${truncateText(compactText(launch.tagline), maxTrendDetailsLength)}`
        : "";
      lines.push(
        `${linesForRank(launches, launch)}. <a href="${escapeAttribute(launch.url)}">${escapeHtml(launch.name)}</a>${escapeHtml(tagline)}`
      );
    });
  }

  if (digest.githubTrending?.length) {
    lines.push("", "────────────", "", "🔥 <b>GitHub Trending Top 5:</b>");
    const repos = digest.githubTrending;
    repos.forEach((repo) => {
      const description = repo.description
        ? ` - ${truncateText(compactText(repo.description), maxTrendDetailsLength)}`
        : "";
      const starsToday = repo.starsToday ? ` ⭐+${repo.starsToday}` : "";
      lines.push(
        `${linesForRank(repos, repo)}. <a href="${escapeAttribute(repo.url)}">${escapeHtml(repo.repository)}</a>${escapeHtml(description)}${escapeHtml(starsToday)}`
      );
    });
  }

  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();
}

export function splitTelegramMessages(message: string, maxLength = 4096): string[] {
  if (message.length <= maxLength) {
    return [message];
  }

  const parts: string[] = [];
  let current = "";

  for (const line of message.split("\n")) {
    if (line.length > maxLength) {
      if (current) {
        parts.push(current.trim());
        current = "";
      }
      for (const chunk of splitOversizedHtmlLine(line, maxLength)) {
        parts.push(chunk);
      }
      continue;
    }

    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      parts.push(current.trim());
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    parts.push(current.trim());
  }

  return parts;
}

export async function sendDigest(
  telegram: TelegramSender,
  channelId: string,
  digest: Digest,
  maxLength = 4096
): Promise<void> {
  const message = formatDigestHtml(digest);
  for (const part of splitTelegramMessages(message, maxLength)) {
    await telegram.sendMessage(channelId, part, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  }
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function splitOversizedHtmlLine(line: string, maxLength: number): string[] {
  const plainText = htmlToPlainText(line);
  const chunks: string[] = [];
  let current = "";

  for (const char of plainText) {
    const escaped = escapeHtml(char);
    if (current && current.length + escaped.length > maxLength) {
      chunks.push(current);
      current = escaped;
    } else {
      current += escaped;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
      .replace(/<\/?b>/gi, "")
      .replace(/<[^>]*>/g, "")
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function linesForRank<T>(items: T[], item: T): number {
  return items.indexOf(item) + 1;
}
