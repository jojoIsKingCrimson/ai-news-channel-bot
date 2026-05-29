import { describe, expect, test, vi } from "vitest";
import {
  collectGithubTrending,
  collectProductHuntLaunches,
  collectPulseTrends
} from "../src/trends.js";

describe("collectProductHuntLaunches", () => {
  test("extracts launch names and taglines from the Product Hunt feed", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>Agent Desk</title>
              <link>https://www.producthunt.com/posts/agent-desk</link>
              <description>A workspace for AI agents</description>
            </item>
            <item>
              <title>Model Watch</title>
              <link>https://www.producthunt.com/posts/model-watch</link>
              <description>Track new model releases</description>
            </item>
          </channel>
        </rss>`
    })) as unknown as typeof fetch;

    const launches = await collectProductHuntLaunches({
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z"),
      itemLimit: 5
    });

    expect(launches).toEqual([
      {
        name: "Agent Desk",
        url: "https://www.producthunt.com/posts/agent-desk",
        tagline: "A workspace for AI agents"
      },
      {
        name: "Model Watch",
        url: "https://www.producthunt.com/posts/model-watch",
        tagline: "Track new model releases"
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.producthunt.com/feed",
      expect.any(Object)
    );
  });

  test("extracts launches from the live Product Hunt Atom feed shape", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <feed>
          <entry>
            <title>Bluedot 2.1</title>
            <link href="https://www.producthunt.com/posts/bluedot-2-1" />
            <summary>Apple Watch recordings synced and summarized by AI</summary>
          </entry>
        </feed>`
    })) as unknown as typeof fetch;

    const launches = await collectProductHuntLaunches({
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z"),
      itemLimit: 5
    });

    expect(launches).toEqual([
      {
        name: "Bluedot 2.1",
        url: "https://www.producthunt.com/posts/bluedot-2-1",
        tagline: "Apple Watch recordings synced and summarized by AI"
      }
    ]);
  });

  test("uses Atom content as a Product Hunt tagline when summary is absent", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <feed>
          <entry>
            <title>Sublern</title>
            <link rel="alternate" href="https://www.producthunt.com/products/sublern" />
            <content type="html">&lt;p&gt;Translate any word in video subtitles with one hover&lt;/p&gt;</content>
          </entry>
        </feed>`
    })) as unknown as typeof fetch;

    const launches = await collectProductHuntLaunches({
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z"),
      itemLimit: 5
    });

    expect(launches[0].tagline).toBe(
      "Translate any word in video subtitles with one hover"
    );
  });

  test("removes Product Hunt feed navigation noise from taglines", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <feed>
          <entry>
            <title>LaunchOS</title>
            <link href="https://www.producthunt.com/posts/launchos" />
            <summary>Bring Back the Classic Launchpad Experience on macOS 26+ Discussion | Link</summary>
          </entry>
        </feed>`
    })) as unknown as typeof fetch;

    const launches = await collectProductHuntLaunches({
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z"),
      itemLimit: 5
    });

    expect(launches[0].tagline).toBe(
      "Bring Back the Classic Launchpad Experience on macOS"
    );
  });
});

describe("collectGithubTrending", () => {
  test("extracts repositories from GitHub trending markup", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <article class="Box-row">
          <h2><a href="/owner/agent-kit">owner / agent-kit</a></h2>
          <p>Toolkit for building AI agents</p>
          <span itemprop="programmingLanguage">TypeScript</span>
          <a href="/owner/agent-kit/stargazers">12,345</a>
          <span>320 stars today</span>
        </article>
      `
    })) as unknown as typeof fetch;

    const repos = await collectGithubTrending({
      fetchImpl,
      itemLimit: 5
    });

    expect(repos).toEqual([
      {
        repository: "owner/agent-kit",
        url: "https://github.com/owner/agent-kit",
        description: "Toolkit for building AI agents",
        language: "TypeScript",
        stars: "12,345",
        starsToday: "320"
      }
    ]);
  });
});

describe("collectPulseTrends", () => {
  test("collects both Product Hunt and GitHub sections", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss>
            <channel>
              <item>
                <title>Agent Desk</title>
                <link>https://www.producthunt.com/posts/agent-desk</link>
              </item>
            </channel>
          </rss>`
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <article class="Box-row">
            <h2><a href="/owner/agent-kit">owner / agent-kit</a></h2>
            <p>Toolkit</p>
          </article>
        `
      }) as unknown as typeof fetch;

    const trends = await collectPulseTrends({
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z"),
      itemLimit: 5
    });

    expect(trends.productHunt).toHaveLength(1);
    expect(trends.githubTrending).toHaveLength(1);
  });
});
