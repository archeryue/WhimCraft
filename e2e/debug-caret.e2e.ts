import { test, expect } from '@playwright/test';

test('debug caret issue', async ({ page }) => {
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');

  // Click + button to add task
  await page.click('button[title="Add task"]');

  // Fill and submit
  const input = page.locator('input[placeholder="What do you want to focus on?"]');
  await input.fill('Test Todo');
  await input.press('Enter');

  // Wait for todo to appear
  await expect(page.locator('text=Test Todo')).toBeVisible({ timeout: 5000 });

  // Wait a moment for any focus changes
  await page.waitForTimeout(500);

  // Take screenshot after adding todo
  await page.screenshot({ path: '/tmp/after-add-todo.png', fullPage: true });

  // Log what has focus
  const focusInfo = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tagName: el?.tagName,
      className: el?.className,
      id: el?.id,
      textContent: el?.textContent?.substring(0, 50)
    };
  });
  console.log('Focus info after add:', JSON.stringify(focusInfo, null, 2));

  // Now click on the chat input to see where caret appears
  const chatInput = page.locator('textarea[placeholder="Message WhimCraft..."]');
  await chatInput.click();
  await page.waitForTimeout(200);

  // Take screenshot with caret in chat input
  await page.screenshot({ path: '/tmp/caret-in-input.png', fullPage: true });

  const focusInfo2 = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tagName: el?.tagName,
      className: el?.className,
    };
  });
  console.log('Focus info in chat input:', JSON.stringify(focusInfo2, null, 2));
});
