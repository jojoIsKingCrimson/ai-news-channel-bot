import type { ArticleCandidate, Digest, DigestItem } from "./types.js";
import { cleanSourceText, truncateText } from "./text-cleanup.js";

export interface OpenAICompatibleChatClient {
  chat: {
    completions: {
    create(input: any): Promise<unknown>;
  };
  };
}

export interface SummarizeOptions {
  client: OpenAICompatibleChatClient;
  model: string;
  itemLimit: number;
  now?: Date;
}

export async function summarizeDigest(
  articles: ArticleCandidate[],
  options: SummarizeOptions
): Promise<Digest> {
  if (articles.length === 0) {
    throw new Error("Cannot summarize an empty article list");
  }

  const now = options.now ?? new Date();
  const response = await options.client.chat.completions.create({
    model: options.model,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(options.itemLimit)
      },
      {
        role: "user",
        content: buildUserPrompt(articles, options.itemLimit, now)
      }
    ],
    response_format: { type: "json_object" },
    ...tokenLimitOptions(options.model)
  });

  return parseDigestResponse(response, options.itemLimit);
}

function buildSystemPrompt(itemLimit: number): string {
  return [
    "你是一个面向 Telegram 频道的中文 AI 资讯编辑。",
    "你必须只输出一个合法 JSON object，不要输出 Markdown、解释、代码块或额外文本。",
    "JSON 字段必须严格使用：",
    "{",
    '  "date": "YYYY-MM-DD",',
    '  "headline": "一句中文总览",',
    '  "items": [',
    "    {",
    '      "title": "中文标题",',
    '      "source": "来源域名或媒体名",',
    '      "url": "原文链接",',
    '      "summary": "一句简短中文摘要",',
    '      "impact": "这条消息对产品、行业或用户的意义"',
    "    }",
    "  ]",
    "}",
    `items 最多 ${itemLimit} 条。`
  ].join("\n");
}

function buildUserPrompt(articles: ArticleCandidate[], itemLimit: number, now: Date): string {
  const candidateLimit = Math.min(articles.length, Math.max(itemLimit * 2, itemLimit + 3));
  const candidates = articles
    .slice(0, candidateLimit)
    .map((article, index) =>
      [
        `#${index + 1}`,
        `标题：${truncateText(cleanSourceText(article.title), 140)}`,
        `来源：${truncateText(cleanSourceText(article.source), 80)}`,
        `链接：${article.url}`,
        article.publishedAt ? `发布时间：${article.publishedAt}` : undefined,
        `摘要片段：${article.snippet ? truncateText(cleanSourceText(article.snippet), 260) : "无"}`
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return [
    `今天日期是 ${now.toISOString().slice(0, 10)}。`,
    `请从候选资讯中选出最多 ${itemLimit} 条最值得发布的 AI 产品和行业动态。`,
    `如果候选数量足够，必须输出 ${itemLimit} 条；不要只输出 1-2 条。`,
    "要求：中文输出；标题要翻译或改写成中文；summary 必须只写一句简短中文，控制在 24 个中文字符左右，不要句号；impact 控制在 24 个中文字符以内；不要编造链接；不要选择纯融资、股价或泛科技内容，除非和 AI 产品/行业有直接关系。",
    "",
    candidates
  ].join("\n");
}

function tokenLimitOptions(model: string): Record<string, unknown> {
  if (/kimi|moonshot/i.test(model)) {
    return { max_tokens: 4096, thinking: { type: "disabled" } };
  }

  return { max_completion_tokens: 2400 };
}

function parseDigestResponse(response: unknown, itemLimit: number): Digest {
  const outputText = extractOutputText(response);
  const parsed = parseJsonObject(outputText);
  if (parsed === undefined) {
    throw new Error("LLM response was not valid digest JSON");
  }

  if (!isDigest(parsed)) {
    throw new Error("LLM response did not match digest schema");
  }

  return {
    ...parsed,
    items: parsed.items.slice(0, itemLimit)
  };
}

function parseJsonObject(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    const objectText = extractFirstJsonObject(value);
    if (!objectText) {
      return undefined;
    }

    try {
      return JSON.parse(objectText);
    } catch {
      return undefined;
    }
  }
}

function extractFirstJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function extractOutputText(response: unknown): string {
  if (isRecord(response) && typeof response.output_text === "string") {
    return response.output_text;
  }

  if (isRecord(response) && Array.isArray(response.choices)) {
    const firstChoice = response.choices[0];
    if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
      const content = firstChoice.message.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .flatMap((part) =>
            isRecord(part) && typeof part.text === "string" ? [part.text] : []
          )
          .join("");
      }
    }
  }

  if (isRecord(response) && Array.isArray(response.output)) {
    const texts = response.output.flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) {
        return [];
      }
      return item.content.flatMap((content) => {
        if (!isRecord(content)) {
          return [];
        }
        if (typeof content.text === "string") {
          return [content.text];
        }
        if (typeof content.output_text === "string") {
          return [content.output_text];
        }
        return [];
      });
    });

    if (texts.length > 0) {
      return texts.join("");
    }
  }

  throw new Error("LLM response did not contain output text");
}

function isDigest(value: unknown): value is Digest {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    typeof value.headline === "string" &&
    Array.isArray(value.items) &&
    value.items.every(isDigestItem)
  );
}

function isDigestItem(value: unknown): value is DigestItem {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.source === "string" &&
    typeof value.url === "string" &&
    typeof value.summary === "string" &&
    typeof value.impact === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
