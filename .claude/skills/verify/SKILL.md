# Verify Skill

Comprehensive verification workflow for code changes before committing.

## Trigger Keywords
- "verify", "verify changes", "verify the feature"
- "run tests", "test everything", "run all tests"
- "check if it works", "is it ready to commit"
- "review and test", "validate changes"

## Workflow

### Phase 1: Review Changes
1. Get the base branch (origin/main or origin/develop)
2. Run `git diff <base>...HEAD --stat` to see changed files
3. Run `git diff <base>...HEAD` to review actual code changes
4. Identify what was added, modified, or refactored

### Phase 2: Analyze Test Coverage
1. For each changed file, find related test files:
   - Unit tests: `src/__tests__/**/*.test.ts`
   - E2E tests: `e2e/*.e2e.ts`
2. Check if existing tests cover the changes
3. Identify gaps in test coverage

### Phase 3: Plan Verification Strategy
1. Determine what needs to be tested:
   - New features → need new tests
   - Bug fixes → need regression tests
   - Refactors → existing tests should pass
2. List specific test scenarios needed
3. Prioritize: critical paths first

### Phase 4: Update Tests (if needed)
1. Add new unit tests for new functions/modules
2. Add new E2E tests for new user-facing features
3. Update existing tests if behavior changed
4. Follow existing test patterns in the codebase

### Phase 5: Run All Tests
1. **Unit Tests**: `npx jest --verbose`
   - Must pass 100%
   - Check coverage for changed files
2. **E2E Tests**: `SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test --reporter=line`
   - Must pass 100% (excluding intentionally skipped tests)
3. **Build Check**: `npm run build`
   - Must compile without errors
4. **Lint Check**: `npm run lint`
   - Must pass

### Phase 6: Verify Feature Quality
1. Start local server if needed for manual verification
2. Test critical user flows
3. Check for edge cases
4. Verify error handling works correctly

### Phase 7: Report Results
Report the following:
- Summary of changes reviewed
- Test coverage status
- All test results (pass/fail counts)
- Any issues found
- Recommendation: READY TO COMMIT or NEEDS WORK

## Commands Reference

```bash
# Review changes
git diff origin/main...HEAD --stat
git diff origin/main...HEAD

# Run unit tests
npx jest --verbose

# Run E2E tests (fast mode)
SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test --reporter=line

# Run specific E2E test
SKIP_SLOW_TESTS=true ENABLE_TEST_AUTH=true npx playwright test e2e/<file>.e2e.ts

# Build check
npm run build

# Lint check
npm run lint

# Start dev server for manual testing
PORT=8080 npm run dev
```

## Success Criteria

The changes are READY TO COMMIT when:
1. All unit tests pass (307+ tests)
2. All E2E tests pass (72+ tests, excluding slow tests)
3. Build succeeds with no TypeScript errors
4. Lint passes with no errors
5. New features have appropriate test coverage
6. No regressions in existing functionality

## Notes

- For new features, always add at least one E2E test
- For bug fixes, add a regression test if possible
- Don't skip tests to make CI pass - fix the issues
- If tests are flaky, fix them rather than retrying
