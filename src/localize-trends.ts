import type { OpenAICompatibleChatClient } from "./summarize.js";
import { cleanSourceText, truncateText } from "./text-cleanup.js";
import type { PulseTrends } from "./trends.js";

interface LocalizeTrendOptions {
  client: OpenAICompatibleChatClient;
  model: string;
}

interface LocalizedTrendResponse {
  productHunt: Array<{ url: string; tagline: string }>;
  githubTrending: Array<{ url: string; description: string }>;
}

export async function localizePulseTrends(
  trends: PulseTrends,
  options: LocalizeTrendOptions
): Promise<PulseTrends> {
  if (trends.productHunt.length === 0 && trends.githubTrending.length === 0) {
    return trends;
  }

  try {
    const response = await options.client.chat.completions.create({
      model: options.model,
      messages: [
        {
          role: "system",
          content: [
            "你是一个中文 AI 资讯频道编辑。",
            "你必须只输出合法 JSON object，不要输出 Markdown、解释或额外文本。"
          ].join("\n")
        },
        {
          role: "user",
          content: buildTrendPrompt(trends)
        }
      ],
      response_format: { type: "json_object" },
      ...tokenLimitOptions(options.model)
    });
    const parsed = parseTrendResponse(extractOutputText(response));
    return mergeLocalizedTrends(trends, parsed);
  } catch (error) {
    console.warn("LLM trend localization failed; keeping original trends.", error);
    return trends;
  }
}

function buildTrendPrompt(trends: PulseTrends): string {
  const payload = {
    productHunt: trends.productHunt.map((launch) => ({
      name: launch.name,
      url: launch.url,
      tagline: truncateText(cleanSourceText(launch.tagline ?? ""), 140)
    })),
    githubTrending: trends.githubTrending.map((repo) => ({
      repository: repo.repository,
      url: repo.url,
      description: truncateText(cleanSourceText(repo.description ?? ""), 160)
    }))
  };

  return [
    "请把下面 Product Hunt 和 GitHub Trending 的英文说明改写为中文。",
    "每条只输出一句简短中文，控制在 18 个中文字符左右，不要句号，不要营销腔，不要新增事实。",
    "必须保留原来的 url，并按这个 JSON 结构输出：",
    '{"productHunt":[{"url":"...","tagline":"中文短句"}],"githubTrending":[{"url":"...","description":"中文短句"}]}',
    "",
    JSON.stringify(payload)
  ].join("\n");
}

function mergeLocalizedTrends(
  original: PulseTrends,
  localized: LocalizedTrendResponse
): PulseTrends {
  const launchesByUrl = new Map(
    localized.productHunt.map((launch) => [launch.url, cleanSourceText(launch.tagline)])
  );
  const reposByUrl = new Map(
    localized.githubTrending.map((repo) => [repo.url, cleanSourceText(repo.description)])
  );

  return {
    productHunt: original.productHunt.map((launch) => ({
      ...launch,
      tagline: launchesByUrl.get(launch.url) || launch.tagline
    })),
    githubTrending: original.githubTrending.map((repo) => ({
      ...repo,
      description: reposByUrl.get(repo.url) || repo.description
    }))
  };
}

function parseTrendResponse(text: string): LocalizedTrendResponse {
  const parsed = parseJsonObject(text);
  if (!isLocalizedTrendResponse(parsed)) {
    throw new Error("LLM response did not match trend localization schema");
  }
  return parsed;
}

function tokenLimitOptions(model: string): Record<string, unknown> {
  if (/kimi|moonshot/i.test(model)) {
    return { max_tokens: 1200, thinking: { type: "disabled" } };
  }

  return { max_completion_tokens: 1200 };
}

function parseJsonObject(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return undefined;
    }

    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function extractOutputText(response: unknown): string {
  if (isRecord(response) && Array.isArray(response.choices)) {
    const choice = response.choices[0];
    if (isRecord(choice) && isRecord(choice.message)) {
      const content = choice.message.content;
      if (typeof content === "string") {
        return content;
      }
    }
  }

  if (isRecord(response) && typeof response.output_text === "string") {
    return response.output_text;
  }

  throw new Error("LLM response did not contain output text");
}

function isLocalizedTrendResponse(value: unknown): value is LocalizedTrendResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.productHunt) &&
    Array.isArray(value.githubTrending) &&
    value.productHunt.every(
      (item) =>
        isRecord(item) &&
        typeof item.url === "string" &&
        typeof item.tagline === "string"
    ) &&
    value.githubTrending.every(
      (item) =>
        isRecord(item) &&
        typeof item.url === "string" &&
        typeof item.description === "string"
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
