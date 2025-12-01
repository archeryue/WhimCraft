# WhimCraft Documentation

Comprehensive documentation for WhimCraft - a bilingual AI agent with intelligent memory, personalization, and agentic capabilities.

---

## Quick Start

| Goal | Document |
|------|----------|
| Understand the system | [DESIGN.md](./DESIGN.md) |
| Deploy to production | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Run tests | [TESTING.md](./TESTING.md) |
| Learn agentic mode | [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md) |
| Add AI providers | [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md) |

---

## Architecture

### [DESIGN.md](./DESIGN.md)
Complete system architecture including tech stack, features, database schema, API design, cost estimation (~$8-18/month), and security considerations.

### [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
**Default production system** using ReAct pattern (Reason → Act → Observe). Documents the agent core, tool system (web_search, web_fetch, memory_retrieve, memory_save, get_current_time), and 58+ unit tests.

### [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md)
Three-tier memory retention system (CORE/IMPORTANT/CONTEXT), memory categories, AI-powered extraction, 500-token budget, and user control via /profile page.

### [WEB_INTEGRATION.md](./WEB_INTEGRATION.md)
Web search (Google Custom Search API, 100 free/day) and content fetching (90-95% success rate with zero-cost fallback chain: Direct → Jina.ai → Archive.org).

### [CONTENT_ARCHITECTURE.md](./CONTENT_ARCHITECTURE.md)
Content formats, storage (Firestore), display systems (ReactMarkdown for Chat, TipTap for Whim), and the conversation → whim conversion pipeline.

---

## Operations

### [DEPLOYMENT.md](./DEPLOYMENT.md)
Complete Cloud Run deployment guide: Docker setup, gcloud CLI, environment variables, OAuth configuration, troubleshooting, and production checklist.

### [TESTING.md](./TESTING.md)
Testing infrastructure: 307 unit tests (Jest), 72 E2E tests (Playwright), mock authentication system, CI/CD integration, and debugging guide.

---

## Development

### [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)
Guide for implementing new AI providers using the `IAIProvider` interface. Currently supports Gemini; extensible to OpenAI, Anthropic, or self-hosted models.

### [PRODUCT_EVOLUTION.md](./PRODUCT_EVOLUTION.md)
27-day development journey from chatbot to AI agent platform (Oct 29 - Nov 24, 2025). Documents key architectural decisions, turning points, and lessons learned.

---

## Planning

### [FEATURE_PLAN_V2.md](./FEATURE_PLAN_V2.md)
**Status: Planning** - Three major features: Paper Reader (analyze arXiv papers), Repo Reader (analyze GitHub repos), Navigator Welcome Page (dashboard with task recommendations).

---

## Key Features

- **Agentic Mode**: ReAct pattern with autonomous tool use (default)
- **Memory System**: Automatic extraction, tiered retention
- **Web Integration**: Search + fetch with 90-95% success rate
- **Image Generation**: Native Gemini 2.5 Flash Image
- **Whim Editor**: Notion-like WYSIWYG with LaTeX, tables, code
- **Bilingual Support**: English and Chinese
- **Testing**: 307 unit + 72 E2E tests (100% pass rate)

## Tech Stack

- Next.js 14 (App Router, TypeScript)
- Firestore (NoSQL database)
- NextAuth.js (Google OAuth + whitelist)
- Google Gemini (3-tier model policy)
- Tailwind CSS + shadcn/ui
- Jest + Playwright (testing)
- Cloud Run (deployment)

---

**Last Updated**: December 1, 2025
**Test Summary**: 307 unit tests, 72 E2E tests (100% pass rate)
