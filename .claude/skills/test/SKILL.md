---
name: test
description: Run unit tests and E2E tests to verify WhimCraft works correctly. Use when you need to run tests, check for regressions, or verify existing functionality. Triggers on "run tests", "test", "jest", "playwright", "unit test", "e2e test", "check tests".
---

# Test Skill for WhimCraft

Use this skill to run the existing test suites (unit tests + E2E tests) and verify everything works correctly.

## Quick Reference

| Task | Command |
|------|---------|
| All unit tests | `npx jest --verbose` |
| All E2E tests (fast) | `npm run test:e2e:fast` |
| All E2E tests | `npm run test:e2e` |
| Both unit + E2E | `npx jest && npm run test:e2e:fast` |
| Specific Jest test | `npx jest src/__tests__/path/to/test.ts` |
| Specific E2E suite | `npx playwright test e2e/04-core-features.e2e.ts` |
| Single E2E test | `npx playwright test e2e/04-core-features.e2e.ts:37` |
| E2E with browser | `npx playwright test --headed` |
| E2E debug mode | `npx playwright test --debug` |

## Test Suite Overview

### Unit Tests (Jest) - 307+ tests

Located in `src/__tests__/`. Tests individual functions, modules, and components.

```bash
# Run all unit tests
npx jest --verbose

# Run with coverage
npx jest --coverage

# Run specific file
npx jest src/__tests__/lib/memory/storage.test.ts

# Run tests matching pattern
npx jest --testNamePattern="memory"
```

### E2E Tests (Playwright) - 72+ tests

Located in `e2e/`. Tests full user flows in a real browser.

| Suite | Tests | Description |
|-------|-------|-------------|
| 01-ui-and-ux | 14 | Login page, responsive design, SEO |
| 02-authenticated-chat | 5 | Basic chat flow |
| 03-visual-and-accessibility | 8 | ARIA, screen reader, focus |
| 04-core-features | 16 | Conversations, messages, profile |
| 05-whim-editor | 7 | Math, code blocks, formatting |
| 06-pro-mode | 19 | PRO button, model selection |
| 07-paper-reader | 16+ | Paper analysis workflow |
| 08-pdf-tools | varies | PDF processing |

```bash
# Run all E2E tests (fast mode - skips slow tests)
npm run test:e2e:fast

# Run all E2E tests
npm run test:e2e

# Run specific suite
npx playwright test e2e/04-core-features.e2e.ts

# Run with visible browser
npx playwright test --headed

# Debug mode (step through)
npx playwright test --debug
```

## Feature → Test Mapping

Use this to find tests for specific features:

| Feature | Unit Tests | E2E Tests |
|---------|------------|-----------|
| **Chat** | `chat/*.test.ts` | `02-authenticated-chat.e2e.ts`, `04-core-features.e2e.ts` |
| **Memory** | `memory/*.test.ts` | `04-core-features.e2e.ts` |
| **Agent/Tools** | `agent/*.test.ts` | - |
| **Web Search** | `web-search/*.test.ts` | - |
| **Whim Editor** | - | `05-whim-editor.e2e.ts` |
| **PRO Mode** | - | `06-pro-mode.e2e.ts` |
| **Paper Reader** | - | `07-paper-reader.e2e.ts` |
| **UI/UX** | - | `01-ui-and-ux.e2e.ts` |
| **Accessibility** | - | `03-visual-and-accessibility.e2e.ts` |

## Standard Test Workflow

### 1. Run Unit Tests First

```bash
npx jest --verbose
```

Unit tests are fast (~30 seconds) and catch logic errors quickly.

### 2. Run E2E Tests

```bash
npm run test:e2e:fast
```

E2E tests verify full user flows work correctly.

### 3. Interpret Results

- **All pass**: Code is working correctly
- **Unit fail**: Logic error in specific function/module
- **E2E fail**: User flow broken, check `test-results/` for screenshots

## Test Environment

### Unit Tests
- Run in Node.js with Jest
- Mock external APIs (Gemini, Firestore)
- Fast execution (~30 seconds for all)

### E2E Tests
- Playwright with Chromium
- Dev server on port 8080
- Test authentication enabled automatically

```bash
# Playwright auto-starts the dev server with:
ENABLE_TEST_AUTH=true npm run dev
```

**Test User**: Mock authentication provider that only works on localhost.

## Debugging Failed Tests

### Unit Test Failures

```bash
# Run single failing test with more output
npx jest src/__tests__/path/to/test.ts --verbose

# Run with debugger
node --inspect-brk node_modules/.bin/jest --runInBand src/__tests__/path/to/test.ts
```

### E2E Test Failures

```bash
# View screenshots from failed tests
ls test-results/

# Open Playwright report
npx playwright show-report

# Run with visible browser
npx playwright test e2e/04-core-features.e2e.ts --headed

# Debug specific test
npx playwright test e2e/04-core-features.e2e.ts:46 --debug
```

### Common Issues

1. **Auth failure**: Delete `tests/.auth/user.json` and re-run
2. **Port conflict**: Kill process on 8080 (`lsof -ti:8080 | xargs kill`)
3. **Selector changed**: UI element class/id was modified
4. **Timing issue**: Add proper waits

## Pre-Commit Checklist

Before committing, ensure:

```bash
# 1. Unit tests pass
npx jest

# 2. E2E tests pass
npm run test:e2e:fast

# 3. Build succeeds
npm run build

# 4. Lint passes
npm run lint
```

**Expected Results:**
- Unit tests: 307+ passing
- E2E tests: 72+ passing
- Build: No TypeScript errors
- Lint: No errors

## Test Counts Summary

| Category | Count |
|----------|-------|
| Unit Tests (Jest) | 307+ |
| E2E Tests (Playwright) | 72+ |
| **Total** | **379+** |

**Success Criteria: 100% pass rate**
