# Telegram AI News Bot

每天定时抓取 AI 产品和行业资讯，参考 Agentara Pulse 风格整理成中文分栏目简报，并推送到 Telegram 频道。

## 功能

- VPS 常驻版每天 `10:00 Asia/Shanghai` 自动推送；GitHub Actions 定时版默认 `10:07 Asia/Shanghai` 推送，以避开 GitHub 整点拥堵。
- 有 `TAVILY_API_KEY` 时使用 Tavily 搜索最近 24 小时的 AI 产品和行业动态；没有时自动降级为 RSS 源。
- 有 `LLM_API_KEY` 时使用 OpenAI-compatible Chat Completions API 生成中文频道文案；没有时自动降级为本地模板日报。
- 支持 OpenAI、Kimi/Moonshot，以及其他兼容 OpenAI Chat Completions 的服务。
- 三段式栏目：`AI重要新闻（9条）`、`Product Hunt Top 5`、`GitHub Trending Top 5`。
- 抓取对象参考 Agentara Pulse：Google News RSS、Product Hunt feed、GitHub Trending。
- Product Hunt / GitHub Trending 抓取失败时会自动省略对应栏目，不影响 AI News 推送。
- 支持私聊 `/preview` 立即生成预览，预览不会写入已发布记录。
- 支持管理员私聊 `/run` 立即正式发布到频道，并写入已发布记录。
- 支持 `/id` 查看用户/聊天 ID，支持管理员 `/test_channel` 测试频道发送权限。
- 启动时自动注册 Telegram 命令菜单，普通用户只显示公开指令，管理员私聊菜单会额外显示 `/run` 和 `/test_channel`。
- 定时发布失败时会自动私聊 `TELEGRAM_ADMIN_USER_IDS` 中配置的管理员。
- 使用本地 JSON state 记录最近 14 天已发布链接，减少重复推送。

## 准备

1. 在 BotFather 创建 Telegram bot，拿到 `TELEGRAM_BOT_TOKEN`。
2. 把 bot 加入目标 Telegram 频道，并设为管理员。
3. 复制环境变量文件：

```bash
cp .env.example .env
```

4. 编辑 `.env`，至少填写 Telegram 配置：

```bash
TELEGRAM_BOT_TOKEN=123456:replace-with-your-bot-token
TELEGRAM_CHANNEL_ID=@your_channel_username
TELEGRAM_ADMIN_USER_IDS=你的 Telegram 用户 ID
```

5. 可选：填写 Tavily 和大模型 key 来提升质量：

```bash
TAVILY_API_KEY=tvly-replace-with-your-key

LLM_API_KEY=sk-replace-with-your-key
LLM_BASE_URL=
LLM_MODEL=gpt-5-mini

TIMEZONE=Asia/Shanghai
DIGEST_CRON=0 10 * * *
DIGEST_ITEM_LIMIT=9
STATE_FILE=.data/state.json
RSS_FEED_URLS=https://news.google.com/rss/search?q=AI%20OR%20%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans,https://www.technologyreview.com/topic/artificial-intelligence/feed/,https://venturebeat.com/category/ai/feed/,https://www.artificialintelligence-news.com/feed/,https://rsshub.app/36kr/newsflashes,https://rsshub.app/jiqizhixin/articles
INCLUDE_TRENDS=true
TREND_ITEM_LIMIT=5
```

`TELEGRAM_CHANNEL_ID` 可以是 `@channel_username`，也可以是负数 channel id，例如 `-1001234567890`。不要填写 Telegram 私有邀请链接或其中的 `+xxxx` 部分；Bot API 不能把邀请链接当作 `chat_id` 发送消息。公开频道可直接用 `@username`，私有频道需要获取数字 channel id，并确保 bot 已加入频道且是管理员。

`TELEGRAM_ADMIN_USER_IDS` 用来限制谁能执行 `/run`。如果不知道自己的 Telegram 用户 ID，可以先不填，向机器人发送 `/run`，机器人会在拒绝消息里告诉你当前用户 ID；填入 `.env` 后重启机器人即可。

Kimi/Moonshot 配置示例：

```bash
LLM_API_KEY=你的 Kimi/Moonshot API Key
LLM_BASE_URL=https://api.moonshot.ai/v1
LLM_MODEL=kimi-k2.6
```

也可以用别名：

```bash
MOONSHOT_API_KEY=你的 Kimi/Moonshot API Key
```

使用 `MOONSHOT_API_KEY` 时，默认会自动使用 `https://api.moonshot.ai/v1` 和 `kimi-k2.6`。

降级行为：

- 不填 `TAVILY_API_KEY`: 使用 `RSS_FEED_URLS` 抓取公开 RSS。
- 不填 `LLM_API_KEY`: 使用本地模板生成日报，不调用大模型。
- 两个都不填: 机器人仍可运行，只依赖 RSS 和模板日报。
- `INCLUDE_TRENDS=false`: 关闭 Product Hunt 和 GitHub Trending 栏目，只发 AI News。

## 本地开发

```bash
npm install
npm run dev
```

启动后：

- 向 bot 私聊发送 `/preview` 可以生成日报预览，不会发频道。
- 配置 `TELEGRAM_ADMIN_USER_IDS` 后，发送 `/run` 可以立即正式发布到频道。
- 发送 `/id` 可以查看当前 Telegram 用户 ID 和聊天 ID。
- 管理员发送 `/test_channel` 可以向配置频道发送一条测试消息，验证频道 ID 和管理员权限是否正确。
- 机器人启动后会自动同步命令菜单；在 Telegram 输入 `/` 可以看到可选指令。非管理员默认只看到 `/preview`、`/id`、`/help`，管理员会额外看到 `/run` 和 `/test_channel`。

程序启动时只注册定时任务，不会立刻向频道推送。

## GitHub Actions 定时版

这个部署方式不需要 VPS 常驻进程。GitHub Actions 会每天运行一次脚本，生成日报、发送到频道，然后退出。

适合场景：

- 只需要每天自动发频道日报。
- 不需要机器人 24 小时在线响应 `/preview`、`/run`。
- 可以接受 GitHub Actions 定时任务偶尔有几分钟延迟。

已内置 workflow：

- 文件：`.github/workflows/daily-digest.yml`
- 定时：每天 `02:07 UTC`，对应中国时间 `10:07 Asia/Shanghai`
- 说明：GitHub Actions 的 `schedule` 在整点附近负载较高时可能延迟或被丢弃，所以 workflow 避开 `00` 分钟运行
- 手动触发：GitHub 仓库 `Actions` → `Daily AI Digest` → `Run workflow`
- 状态保存：用 GitHub Actions cache 保存 `.data/state.json`，减少重复发布最近 14 天发过的链接

需要在 GitHub 仓库配置这些 Secrets：

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHANNEL_ID
```

推荐一起配置：

```text
TELEGRAM_ADMIN_USER_IDS
TAVILY_API_KEY
LLM_API_KEY
MOONSHOT_API_KEY
KIMI_API_KEY
```

可选配置放在仓库 Variables：

```text
LLM_BASE_URL
LLM_MODEL
DIGEST_ITEM_LIMIT
RSS_FEED_URLS
INCLUDE_TRENDS
TREND_ITEM_LIMIT
```

Kimi/Moonshot 示例：

```text
LLM_API_KEY=你的 Kimi/Moonshot API Key
LLM_BASE_URL=https://api.moonshot.ai/v1
LLM_MODEL=kimi-k2.6
```

本地模拟 GitHub Actions 单次发布：

```bash
npm install
npm run build
npm run publish:once
```

注意：workflow 文件必须提交并推送到默认分支 `main` 后，GitHub 才会真正开始定时运行。

## VPS 常驻运行

第一版设计为 VPS/服务器常驻进程：Node 进程一直运行，Telegraf 长轮询接收 `/preview`，node-cron 在进程内每天 `10:00 Asia/Shanghai` 触发推送。

推荐用 pm2：

```bash
npm install
npm run build
npm install -g pm2
pm2 start dist/index.js --name telegram-ai-news-bot
pm2 save
pm2 startup
```

查看日志：

```bash
pm2 logs telegram-ai-news-bot
```

重启：

```bash
pm2 restart telegram-ai-news-bot
```

服务器关机、进程退出或网络中断期间不会自动补发错过的日报。

## 脚本

```bash
npm test
npm run build
npm start
npm run publish:once
```

## 项目结构

- `src/config.ts`: 环境变量读取和校验。
- `src/collect.ts`: Tavily 搜索和资讯候选标准化。
- `src/rss.ts`: 无 Tavily key 时的 RSS 资讯采集。
- `src/dedupe.ts`: URL/title 去重和本地 state。
- `src/summarize.ts`: OpenAI-compatible Chat Completions 结构化摘要。
- `src/template-summary.ts`: 无 LLM key 时的本地模板日报。
- `src/trends.ts`: Product Hunt feed 和 GitHub Trending 趋势栏目采集。
- `src/publish.ts`: Telegram HTML 格式化和频道发送。
- `src/scheduler.ts`: 每日 cron 注册。
- `src/run-once.ts`: GitHub Actions 单次发布 runner。
- `src/github-action.ts`: GitHub Actions CLI 入口。
- `src/digest.ts`: 预览和定时发布流水线。
- `src/bot.ts`: Telegram 命令处理。
- `src/index.ts`: VPS 常驻进程入口。
