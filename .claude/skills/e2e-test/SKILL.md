---
name: e2e-test
description: Run Playwright E2E tests to verify WhimCraft features. Use when implementing new features, fixing bugs, or verifying changes work correctly. Triggers on "verify", "test the feature", "e2e", "end-to-end", "playwright", "check if it works", "run tests", "validate changes".
---

# E2E Testing Skill for WhimCraft

Use this skill to verify features work correctly after implementation or bug fixes.

## Quick Reference

| Task | Command |
|------|---------|
| All tests (fast) | `npm run test:e2e:fast` |
| All tests | `npm run test:e2e` |
| Specific suite | `npx playwright test e2e/04-core-features.e2e.ts` |
| Single test | `npx playwright test e2e/04-core-features.e2e.ts:37` |
| With browser | `npx playwright test --headed` |
| Debug mode | `npx playwright test --debug` |
| Interactive UI | `npx playwright test --ui` |

## Feature → Test Mapping

Use this table to identify which tests verify specific features:

| Feature | Test File | Key Tests |
|---------|-----------|-----------|
| **Chat** | `02-authenticated-chat.e2e.ts`, `04-core-features.e2e.ts` | Send message, receive response, multiple messages |
| **Conversation** | `04-core-features.e2e.ts` | Create, list, persist, delete conversations |
| **UI/UX** | `01-ui-and-ux.e2e.ts` | Login page, responsive design, SEO, keyboard nav |
| **Accessibility** | `03-visual-and-accessibility.e2e.ts` | ARIA labels, screen reader, focus management |
| **Whim Editor** | `05-whim-editor.e2e.ts` | Math (KaTeX), code blocks, formatting, images |
| **PRO Mode** | `06-pro-mode.e2e.ts` | PRO button, model selection, state management |
| **Paper Reader** | `07-paper-reader.e2e.ts` | URL validation, analysis flow, save as Whim |
| **PDF Tools** | `08-pdf-tools.e2e.ts` | PDF processing features |
| **Memory/Profile** | `04-core-features.e2e.ts` | Profile page, memory display |
| **Error Handling** | `04-core-features.e2e.ts` | Network errors, rate limiting, empty input |

## Autonomous Feature Verification

When you implement a new feature or fix a bug, follow these steps:

### Step 1: Identify Related Tests

Based on the feature you modified, identify which test file(s) to run:

```bash
# Example: Modified chat functionality
npx playwright test e2e/04-core-features.e2e.ts

# Example: Modified Whim editor
npx playwright test e2e/05-whim-editor.e2e.ts

# Example: Modified authentication
npx playwright test e2e/02-authenticated-chat.e2e.ts
```

### Step 2: Run Tests

```bash
# Run the relevant test suite
npx playwright test e2e/<suite-name>.e2e.ts

# If tests fail, run with visible browser to see what's happening
npx playwright test e2e/<suite-name>.e2e.ts --headed

# For debugging specific failures
npx playwright test e2e/<suite-name>.e2e.ts:<line-number> --debug
```

### Step 3: Interpret Results

- **All tests pass**: Feature verified, safe to report success
- **Tests fail**: Analyze error message, check `test-results/` for screenshots
- **Timeout errors**: Feature may be slow or selector may have changed

## Test Environment

The dev server runs on port 8080 with test authentication:

```bash
# Dev server with test auth (automatically started by Playwright)
npm run dev:e2e
# Equivalent to: ENABLE_TEST_AUTH=true npm run dev
```

**Authentication**: Tests use a mock "Test User" provider that:
- Only works on localhost
- Requires `ENABLE_TEST_AUTH=true`
- Auto-authenticates via `tests/auth.setup.ts`
- Saves session to `tests/.auth/user.json`

## Common Test Patterns

### Selectors Used in Tests

```typescript
// Chat input
page.locator('textarea[placeholder*="Message"]')

// Chat responses
page.locator('.prose')

// Generic buttons
page.locator('button:has-text("Button Text")')

// Editor content
page.locator('.ProseMirror')

// Data test IDs
page.locator('[data-testid="paper-analysis"]')
```

### Helper Functions (from tests)

```typescript
// Wait for AI response
async function waitForChatResponse(page: Page, timeout = 30000) {
  await page.waitForSelector('.prose', { timeout });
  await page.waitForTimeout(1000);
}

// Send a chat message
async function sendChatMessage(page: Page, message: string) {
  const input = page.locator('textarea[placeholder*="Message"]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(message);
  await input.press('Enter');
}
```

### Test Page Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/login` | Login page | No |
| `/chat` | Main chat interface | Yes |
| `/chat/[id]` | Specific conversation | Yes |
| `/profile` | User profile/memory | Yes |
| `/paper` | Paper Reader | Yes |
| `/whim-test` | Whim editor test page | No |

## Debugging Failed Tests

### View Screenshots

Failed tests save screenshots to `test-results/`:

```bash
# List failed test artifacts
ls test-results/

# View in browser
npx playwright show-report
```

### Common Failure Causes

1. **Selector changed**: UI element class/id/text was modified
2. **Timing issue**: Add `await page.waitForTimeout()` or better waits
3. **Auth failure**: Check `tests/.auth/user.json` exists, delete and re-run
4. **Dev server not running**: Playwright should auto-start, check port 8080

### Fix and Re-run Pattern

```bash
# Run failing test in debug mode
npx playwright test e2e/04-core-features.e2e.ts:46 --debug

# After fixing, verify the specific test passes
npx playwright test e2e/04-core-features.e2e.ts:46

# Then run full suite to ensure no regressions
npx playwright test e2e/04-core-features.e2e.ts
```

## Writing New Tests

When adding tests for new features:

### 1. Choose the Right File

- **New feature category**: Create `e2e/0X-feature-name.e2e.ts`
- **Extension of existing feature**: Add to relevant existing file

### 2. Follow Naming Convention

```typescript
test.describe('Feature Name - Subcategory', () => {
  test('should do specific thing', async ({ page }) => {
    // Test implementation
  });
});
```

### 3. Use Test IDs

Add `data-testid` attributes to new UI elements:

```tsx
<div data-testid="new-feature-container">
```

Then use in tests:

```typescript
await expect(page.locator('[data-testid="new-feature-container"]')).toBeVisible();
```

## Pre-Commit Verification

Before committing changes, run the full test suite:

```bash
# Build check
npm run build

# Unit tests
npx jest

# E2E tests (fast mode)
npm run test:e2e:fast
```

All tests must pass before committing.

## Test Counts

| Suite | Tests |
|-------|-------|
| 01-ui-and-ux | 14 |
| 02-authenticated-chat | 5 |
| 03-visual-and-accessibility | 8 |
| 04-core-features | 16 |
| 05-whim-editor | 7 |
| 06-pro-mode | 19 |
| 07-paper-reader | 16+ |
| 08-pdf-tools | varies |
| **Total** | **72+** |

Expected result: **100% pass rate**
