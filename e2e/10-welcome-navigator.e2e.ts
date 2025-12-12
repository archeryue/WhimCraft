import { test, expect } from '@playwright/test';

test.describe('Welcome Navigator', () => {
  test.beforeEach(async ({ page }) => {
    // Enable test auth
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('should show welcome navigator when no messages', async ({ page }) => {
    // Check greeting is visible
    await expect(page.locator('text=/Good (morning|afternoon|evening)/')).toBeVisible();

    // Check Today's Focus section
    await expect(page.locator('text=Today\'s Focus')).toBeVisible();

    // Check feature cards
    await expect(page.locator('text=Paper Reader')).toBeVisible();
    await expect(page.locator('text=Repo Reader')).toBeVisible();
  });

  test('should add todo items without weird focus issues', async ({ page }) => {
    // Click the + button to add a todo (has title="Add task")
    const addButton = page.locator('button[title="Add task"]');
    await addButton.click();

    // Input should appear and be focused
    const input = page.locator('input[placeholder="What do you want to focus on?"]');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    // Add a todo by pressing Enter
    await input.fill('E2E Test Todo');
    await input.press('Enter');

    // Wait for todo to appear in the list (use .first() in case of duplicates from previous runs)
    await expect(page.locator('text=E2E Test Todo').first()).toBeVisible({ timeout: 5000 });

    // Input should be hidden after adding
    await expect(input).not.toBeVisible();

    // Chat input should NOT be focused after adding todo
    const chatInput = page.locator('textarea[placeholder="Message WhimCraft..."]');
    await expect(chatInput).not.toBeFocused();

    // Verify focus is NOT on textarea (which would show weird caret)
    const focusedElement = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? {
        tagName: active.tagName,
        className: active.className,
        id: active.id
      } : null;
    });

    // Focus should be on body or html only - no visible caret anywhere
    if (focusedElement) {
      expect(['BODY', 'HTML']).toContain(focusedElement.tagName);
    }
  });

  test('should cancel adding todo by clicking elsewhere', async ({ page }) => {
    // Click + button to show input
    await page.click('button[title="Add task"]');

    // Input should be visible
    const input = page.locator('input[placeholder="What do you want to focus on?"]');
    await expect(input).toBeVisible();

    // Click elsewhere to cancel (blur the input)
    await page.click('h1'); // Click on the greeting header

    // Input should be hidden
    await expect(input).not.toBeVisible();

    // The chat input textarea should NOT be focused
    const chatInput = page.locator('textarea[placeholder="Message WhimCraft..."]');
    await expect(chatInput).not.toBeFocused();
  });

  test('should cancel adding todo with Escape key without weird focus', async ({ page }) => {
    // Click + button to show input
    await page.click('button[title="Add task"]');

    // Input should be visible and focused
    const input = page.locator('input[placeholder="What do you want to focus on?"]');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    // Press Escape
    await page.keyboard.press('Escape');

    // Input should be hidden
    await expect(input).not.toBeVisible();

    // Chat input should NOT be focused
    const chatInput = page.locator('textarea[placeholder="Message WhimCraft..."]');
    await expect(chatInput).not.toBeFocused();
  });

  test('should navigate to Paper Reader', async ({ page }) => {
    await page.click('button:has-text("Paper Reader")');
    await expect(page).toHaveURL(/\/paper/);
  });
});
