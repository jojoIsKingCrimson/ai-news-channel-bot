import { describe, expect, test } from "vitest";
import {
  canonicalizeUrl,
  filterFreshArticles,
  markPublished,
  pruneState
} from "../src/dedupe.js";
import type { ArticleCandidate, PublishState } from "../src/types.js";

describe("canonicalizeUrl", () => {
  test("removes tracking parameters, hashes, and trailing slashes", () => {
    expect(
      canonicalizeUrl(
        "https://Example.com/path/?utm_source=newsletter&foo=bar#section"
      )
    ).toBe("https://example.com/path?foo=bar");
  });
});

describe("filterFreshArticles", () => {
  const state: PublishState = {
    published: [
      {
        url: "https://openai.com/news/product",
        title: "OpenAI launches new AI product for teams",
        publishedAt: "2026-05-27T02:00:00.000Z"
      }
    ]
  };

  test("filters already-published URLs and similar titles", () => {
    const articles: ArticleCandidate[] = [
      {
        title: "OpenAI launches new AI product for teams",
        url: "https://openai.com/news/product?utm_campaign=x",
        source: "openai.com",
        snippet: "Duplicate URL"
      },
      {
        title: "OpenAI launches new AI product for team",
        url: "https://mirror.example.com/openai-product",
        source: "mirror.example.com",
        snippet: "Similar title"
      },
      {
        title: "Anthropic announces new Claude feature",
        url: "https://anthropic.com/news/claude-feature",
        source: "anthropic.com",
        snippet: "Fresh item"
      }
    ];

    expect(filterFreshArticles(articles, state, 5)).toEqual([
      articles[2]
    ]);
  });
});

describe("state helpers", () => {
  test("marks newly published articles and prunes records older than 14 days", () => {
    const now = new Date("2026-05-28T02:00:00.000Z");
    const oldDate = "2026-05-01T02:00:00.000Z";
    const state: PublishState = {
      published: [
        {
          url: "https://old.example.com",
          title: "Old story",
          publishedAt: oldDate
        }
      ]
    };

    const updated = markPublished(
      state,
      [
        {
          title: "New AI product story",
          url: "https://new.example.com",
          source: "new.example.com",
          snippet: "Fresh"
        }
      ],
      now
    );

    expect(updated.published).toHaveLength(2);
    expect(pruneState(updated, now).published).toEqual([
      {
        url: "https://new.example.com",
        title: "New AI product story",
        publishedAt: "2026-05-28T02:00:00.000Z"
      }
    ]);
  });
});
