---
name: verify
description: Comprehensive verification workflow - review code changes, add tests, run all tests, and simulate real user behavior in browser. Use when completing a feature, fixing a bug, or before committing. Triggers on "verify", "verify changes", "verify the feature", "check if it works", "validate", "review and test".
---

# Verify Skill for WhimCraft

Comprehensive verification workflow that reviews code, adds tests if needed, runs all tests, and performs real browser simulation to verify features work like a real user would experience.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     VERIFY SKILL WORKFLOW                        │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: CODE REVIEW                                           │
│  └─ Review git diff, understand what changed                    │
├─────────────────────────────────────────────────────────────────┤
│  Phase 2: TEST COVERAGE ANALYSIS                                │
│  └─ Check if existing tests cover the changes                   │
│  └─ Identify gaps in test coverage                              │
├─────────────────────────────────────────────────────────────────┤
│  Phase 3: ADD/UPDATE TESTS                                      │
│  └─ Write unit tests for new functions                          │
│  └─ Write E2E tests for new user-facing features                │
├─────────────────────────────────────────────────────────────────┤
│  Phase 4: RUN ALL TESTS                                         │
│  └─ npx jest (307+ unit tests)                                  │
│  └─ npm run test:e2e:fast (72+ E2E tests)                       │
├─────────────────────────────────────────────────────────────────┤
│  Phase 5: BROWSER SIMULATION                                    │
│  └─ Start dev server with test auth                             │
│  └─ Use Playwright to simulate real user behavior               │
│  └─ Manually verify the feature works as expected               │
├─────────────────────────────────────────────────────────────────┤
│  Phase 6: REPORT RESULTS                                        │
│  └─ Summary of verification                                     │
│  └─ READY TO COMMIT or NEEDS WORK                               │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Code Review

Review what changed to understand what needs to be verified.

```bash
# See what files changed
git diff origin/main...HEAD --stat

# Review the actual code changes
git diff origin/main...HEAD

# Or if on develop branch
git diff origin/develop...HEAD --stat
git diff origin/develop...HEAD
```

**What to look for:**
- New functions/modules that need unit tests
- New UI features that need E2E tests
- Modified behavior that might break existing tests
- Edge cases that should be tested

## Phase 2: Test Coverage Analysis

For each changed file, identify related tests:

```bash
# Find unit tests for a file
# e.g., src/lib/memory/storage.ts → src/__tests__/lib/memory/storage.test.ts

# Find E2E tests for a feature
# e.g., Chat changes → e2e/04-core-features.e2e.ts
# e.g., Whim changes → e2e/05-whim-editor.e2e.ts
```

**Test file mapping:**
| Source Path | Unit Test Path | E2E Test |
|-------------|----------------|----------|
| `src/lib/memory/*` | `src/__tests__/lib/memory/*.test.ts` | `04-core-features.e2e.ts` |
| `src/lib/agent/*` | `src/__tests__/lib/agent/*.test.ts` | - |
| `src/components/chat/*` | - | `02-authenticated-chat.e2e.ts`, `04-core-features.e2e.ts` |
| `src/components/whim/*` | - | `05-whim-editor.e2e.ts` |
| `src/lib/web-search/*` | `src/__tests__/lib/web-search/*.test.ts` | - |

## Phase 3: Add/Update Tests

### Adding Unit Tests

```typescript
// src/__tests__/lib/feature/newFunction.test.ts
import { newFunction } from '@/lib/feature/newFunction';

describe('newFunction', () => {
  it('should handle normal input', () => {
    expect(newFunction('input')).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(newFunction('')).toBe('default');
  });

  it('should throw on invalid input', () => {
    expect(() => newFunction(null)).toThrow();
  });
});
```

### Adding E2E Tests

```typescript
// e2e/0X-feature.e2e.ts
import { test, expect } from '@playwright/test';

test.describe('New Feature', () => {
  test('should work for user', async ({ page }) => {
    await page.goto('/chat');

    // Simulate user actions
    await page.locator('button:has-text("Feature")').click();

    // Verify expected result
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

## Phase 4: Run All Tests

```bash
# 1. Run unit tests
npx jest --verbose

# 2. Run E2E tests (fast mode)
npm run test:e2e:fast

# 3. Build check
npm run build

# 4. Lint check
npm run lint
```

**All must pass before proceeding to browser simulation.**

## Phase 5: Browser Simulation (Real User Verification)

This is the key differentiator - simulate what a real user would do.

### Start Dev Server

```bash
# Start with test authentication
ENABLE_TEST_AUTH=true PORT=8080 npm run dev
```

### Simulate User Behavior with Playwright

Create a temporary script to simulate the specific user flow:

```typescript
// Use Playwright to act like a real user
import { chromium } from 'playwright';

async function simulateUser() {
  const browser = await chromium.launch({ headless: false }); // Visible browser
  const page = await browser.newPage();

  // 1. Login as test user
  await page.goto('http://localhost:8080/login');
  await page.click('button:has-text("Test User")');
  await page.waitForURL('**/chat');

  // 2. Perform the specific feature being tested
  // Example: Test chat functionality
  const input = page.locator('textarea[placeholder*="Message"]');
  await input.fill('Hello, this is a test message');
  await input.press('Enter');

  // 3. Wait for and verify the response
  await page.waitForSelector('.prose', { timeout: 30000 });
  console.log('✓ Received AI response');

  // 4. Check for any errors in console
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Browser error:', msg.text());
    }
  });

  // 5. Take screenshot for verification
  await page.screenshot({ path: 'verification-screenshot.png' });

  await browser.close();
}
```

### Common User Flows to Verify

| Feature | Simulation Steps |
|---------|------------------|
| **Chat** | Login → Send message → Wait for response → Check formatting |
| **Conversation** | Login → Create new → Send messages → Check sidebar → Reload page → Verify persistence |
| **Whim Editor** | Login → Open/create whim → Edit content → Save → Reload → Verify saved |
| **Memory** | Login → Chat with memory-worthy info → Check profile → Verify memory saved |
| **PRO Mode** | Login → Toggle PRO → Send message → Verify model used |
| **Paper Reader** | Login → Go to /paper → Enter URL → Wait for analysis → Verify output |

### Quick Browser Simulation Command

```bash
# Run a quick headed test to see the feature in action
SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test e2e/04-core-features.e2e.ts --headed

# Or run specific test with debugging
SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test e2e/04-core-features.e2e.ts:50 --debug
```

### Interactive Verification

For complex features, use Playwright's interactive mode:

```bash
# Open Playwright inspector to manually step through
npx playwright test --debug

# Or use the UI mode
npx playwright test --ui
```

## Phase 6: Report Results

After completing all phases, report:

### Success Report Template

```
## Verification Complete ✓

### Code Review
- Reviewed X files changed
- Key changes: [summary]

### Test Coverage
- Unit tests: Adequate / Added X new tests
- E2E tests: Adequate / Added X new tests

### Test Results
- Unit tests: 307/307 passed ✓
- E2E tests: 72/72 passed ✓
- Build: Success ✓
- Lint: No errors ✓

### Browser Simulation
- Tested: [specific user flow]
- Result: Working as expected ✓
- Screenshot: [attached if relevant]

### Recommendation
**READY TO COMMIT** ✓
```

### Failure Report Template

```
## Verification Failed ✗

### Issues Found
1. [Issue description]
   - File: [path]
   - Problem: [details]
   - Fix needed: [suggestion]

### Test Failures
- [test name]: [error message]

### Recommendation
**NEEDS WORK** - [specific actions needed]
```

## Quick Commands Reference

```bash
# Full verification sequence
git diff origin/main...HEAD --stat           # Review changes
npx jest --verbose                            # Unit tests
npm run test:e2e:fast                         # E2E tests
npm run build                                 # Build check
npm run lint                                  # Lint check
ENABLE_TEST_AUTH=true PORT=8080 npm run dev   # Start for manual testing

# Headed browser simulation
SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test --headed

# Debug specific test
SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test e2e/FILE.e2e.ts:LINE --debug
```

## Success Criteria

The code is **READY TO COMMIT** when:
1. ✓ Code review completed - changes understood
2. ✓ Test coverage adequate - new code has tests
3. ✓ All unit tests pass (307+)
4. ✓ All E2E tests pass (72+)
5. ✓ Build succeeds
6. ✓ Lint passes
7. ✓ Browser simulation confirms feature works as expected
