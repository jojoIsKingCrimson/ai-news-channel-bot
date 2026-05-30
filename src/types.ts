export interface AppConfig {
  telegramBotToken: string;
  telegramChannelId: string;
  tavilyApiKey?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel: string;
  timezone: string;
  digestCron: string;
  digestItemLimit: number;
  stateFile: string;
  telegramAdminUserIds: string[];
  rssFeedUrls: string[];
  includeTrends: boolean;
  trendItemLimit: number;
}

export interface ArticleCandidate {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
  query?: string;
}

export interface DigestItem {
  title: string;
  source: string;
  url: string;
  summary: string;
  impact: string;
}

export interface ProductHuntLaunch {
  name: string;
  url: string;
  tagline?: string;
  votes?: number;
}

export interface GithubTrendingRepo {
  repository: string;
  url: string;
  description?: string;
  language?: string;
  stars?: string;
  starsToday?: string;
}

export interface Digest {
  date: string;
  headline: string;
  items: DigestItem[];
  productHunt?: ProductHuntLaunch[];
  githubTrending?: GithubTrendingRepo[];
}

export interface PublishedRecord {
  url: string;
  title: string;
  publishedAt: string;
}

export interface PublishState {
  lastPublishedDate?: string;
  published: PublishedRecord[];
}
