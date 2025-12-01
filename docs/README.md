# WhimCraft Documentation

Comprehensive documentation for WhimCraft - a bilingual AI agent with advanced memory, personalization, and agentic capabilities.

---

## 📚 Core Documentation

### 📖 [PRODUCT_EVOLUTION.md](./PRODUCT_EVOLUTION.md)
**27-day journey from chatbot to AI agent platform**

- 11 major phases of evolution (Oct 29 - Nov 24, 2025)
- Key architectural transformations
- Product turning points
- Development model evolution
- Metrics: 5x codebase growth, 363 tests, 23 features
- Strategic decisions and lessons learned
- **Essential reading** for understanding WhimCraft's design philosophy

### 🎯 [DESIGN.md](./DESIGN.md)
**Complete system architecture and design**

- Technology stack and architecture
- All features (Memory, Image Generation, Agentic Mode, Bilingual Support)
- Provider abstraction layer
- Database schema (Firestore)
- API design
- Cost estimation (~$7.50-17.50/month)
- Security considerations

### 🤖 [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
**DEFAULT PRODUCTION SYSTEM - ReAct Pattern**

- Reason-Act-Observe autonomous behavior
- Tool system (web_search, web_fetch, memory, get_current_time)
- Agent core with configurable iterations (default 5)
- Source categories for reliable searches
- 58 comprehensive unit tests
- **Status**: ✅ Enabled by default in production

### 📝 [CONTENT_ARCHITECTURE.md](./CONTENT_ARCHITECTURE.md)
**Content formats, storage, and display**

- Markdown as source of truth
- Storage layer (Firestore structure)
- Display systems (ReactMarkdown for Chat, TipTap for Whim)
- Conversion pipeline (conversation → whim)
- AI-powered title generation
- Future improvement options

### 🧠 [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
**Intelligent memory system**

- Three-tier retention (CORE/IMPORTANT/CONTEXT)
- Memory categories (PROFILE/PREFERENCE/TECHNICAL/PROJECT)
- AI-powered extraction
- 500-token budget with automatic cleanup
- Cost impact (~$0.50-1/month)
- User control via /profile page

### 🔍 [WEB_SEARCH_DESIGN.md](./WEB_SEARCH_DESIGN.md)
**Web search integration**

- Provider: Google Custom Search API
- Rate limiting (20/hour, 100/day per user)
- Conservative trigger mode (time-sensitive queries only)
- Cost: FREE within 3,000 searches/month
- **Status**: ✅ Implemented

### 🌐 [WEB_FETCH_IMPROVEMENTS.md](./WEB_FETCH_IMPROVEMENTS.md)
**Web content fetching with zero-cost fallback chain**

- Multi-tier fallback: Cache → Direct → Jina.ai → Archive.org
- In-memory LRU cache (500 entries, 1h TTL)
- JavaScript rendering + bot bypass (Jina.ai Reader)
- Historical content fallback (Archive.org)
- Success rate: 90-95% (up from ~60%)
- Cost impact: **-$0.15/month** (saves money via caching!)
- 21 unit tests + 25 E2E tests
- **Status**: ✅ Implemented and deployed

### 📊 [PROGRESS_TRACKING.md](./PROGRESS_TRACKING.md)
**Real-time progress feedback**

- Single updating badge UI
- Server → client streaming protocol
- [PROGRESS] and [CONTENT] prefixes
- 7 progress steps tracked
- **Status**: ✅ Implemented

---

## 🚀 Operations

### 📦 [DEPLOYMENT.md](./DEPLOYMENT.md)
**Complete deployment guide for Google Cloud Run**

- Docker setup (WSL2)
- gcloud CLI configuration
- Environment variables
- AMD64 image building
- Cloud Run deployment
- OAuth configuration
- Troubleshooting
- Cost optimization
- Production checklist (14 items)

### 🧪 [TESTING.md](./TESTING.md)
**Complete testing guide**

- **Unit Tests**: 307 tests with Jest (100% pass rate)
- **E2E Tests**: 72 tests in 6 suites with Playwright
- Test structure and organization (numbered test suites)
- Running tests (unit + E2E, ~2 minutes)
- Mock authentication system (triple-guard security)
- CI/CD integration
- Debugging guide
- Speed optimizations (87% faster after refactoring)
- **Status**: ✅ Fully automated testing

### 🔐 [SECURITY_ANALYSIS_TEST_AUTH.md](./SECURITY_ANALYSIS_TEST_AUTH.md)
**Security analysis for test authentication**

- Triple-guard protection system
- Localhost-only validation
- Runtime security checks
- Risk assessment
- **Verdict**: ✅ SAFE for automated testing

---

## 🔧 Development

### 🔌 [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)
**Guide for adding AI providers**

- Implement IAIProvider interface
- Add OpenAI, Anthropic, or custom providers
- Handle streaming responses
- Implement image generation
- Testing procedures
- **Current**: GeminiProvider fully implemented

### 🚀 [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)
**Planned enhancements**

- High priority features
- Medium priority features
- Low priority nice-to-haves
- Implementation approaches
- Effort estimates

### 🔄 [STREAM_RESILIENCE_DESIGN.md](./STREAM_RESILIENCE_DESIGN.md)
**Stream buffering with auto-resume**

- Server-side buffer manager
- Client-side auto-reconnect
- Resume from last position
- Maximum 3 retry attempts
- 95% reduction in incomplete responses
- **Status**: ✅ Implemented

---

## 🎯 Quick Start

1. **New to WhimCraft?** → [../README.md](../README.md) for local setup
2. **Understanding the journey?** → [PRODUCT_EVOLUTION.md](./PRODUCT_EVOLUTION.md) - Start here!
3. **Understanding architecture?** → [DESIGN.md](./DESIGN.md)
4. **How does agentic mode work?** → [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
5. **Ready to deploy?** → [DEPLOYMENT.md](./DEPLOYMENT.md)
6. **Need to test?** → [TESTING.md](./TESTING.md)
7. **Understanding memory?** → [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
8. **Adding AI providers?** → [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)

---

## ✅ Key Features

### Production Features (All Implemented)
- **Agentic Mode**: ReAct pattern with autonomous tool use (DEFAULT)
- **Memory System**: Automatic extraction, tiered retention
- **Image Generation**: Native Gemini 2.5 Flash Image + image-to-image
- **Web Search & Fetch**: 90-95% success with zero-cost fallback chain
- **PRO Mode**: Gemini 2.0 Flash Pro + Thinking models
- **Whim Editor**: Notion-like WYSIWYG with LaTeX, tables, code
- **File Attachments**: Images and PDFs with multimodal processing
- **Bilingual Support**: English and Chinese (equal quality)
- **Progress Tracking**: Real-time visual feedback with streaming
- **Stream Resilience**: Auto-resume on disconnect
- **Testing**: 307 unit tests, 72 E2E tests in 6 suites (100% pass rate)

### Tech Stack
- Next.js 14 (App Router, TypeScript)
- Firestore (NoSQL database)
- NextAuth.js (Google OAuth + whitelist)
- Google Gemini (3-tier model policy)
- Tailwind CSS + shadcn/ui
- Jest + Playwright (testing)
- Cloud Run (deployment)

---

## 💡 Common Tasks

**Cost concerns?** → See [DESIGN.md](./DESIGN.md) cost breakdown

**Deployment issues?** → Check [DEPLOYMENT.md](./DEPLOYMENT.md) troubleshooting

**Test failures?** → See [TESTING.md](./TESTING.md) debugging guide

**Memory questions?** → Full details in [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)

**Planning features?** → Track in [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)

---

## 🔗 External Resources

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Google Gemini API](https://ai.google.dev/)
- [Firebase/Firestore Docs](https://firebase.google.com/docs/firestore)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google Cloud Run](https://cloud.google.com/run/docs)

---

**Last Updated**: December 1, 2025
**Test Summary**: 307 unit tests, 72 E2E tests in 6 suites (100% pass rate)
**Documentation Status**: ✅ Current and maintained
**Recent Additions**:
- History trimming utility (fix for deep conversation bug)
- Product Evolution document (27-day journey)
- WebFetch resilience implementation (90-95% success rate)
- PRO Mode, Whim editor, Stream resilience
