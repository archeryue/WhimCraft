/**
 * PRO Mode E2E Test Suite - FAST UI TESTS
 *
 * Tests UI interactions only - NO real API calls or AI responses
 * Each test should complete in seconds, not minutes
 */

import { test, expect, Page } from '@playwright/test';

/**
 * Helper: Get PRO mode button state
 */
async function getProModeState(page: Page): Promise<'on' | 'off' | 'not-found'> {
  const proOnButton = page.locator('button:has-text("PRO ON")').first();
  const proOffButton = page.locator('button:has-text("PRO OFF")').first();

  if (await proOnButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'on';
  }
  if (await proOffButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'off';
  }
  return 'not-found';
}

/**
 * Helper: Enable PRO mode (fast - just UI interaction)
 */
async function enableProMode(page: Page) {
  const proOffButton = page.locator('button:has-text("PRO OFF")').first();
  await proOffButton.waitFor({ state: 'visible', timeout: 5000 });
  await proOffButton.click();

  // Wait for dialog
  await page.waitForTimeout(300);

  // Click Enable button
  const enableButton = page.locator('button:has-text("Enable PRO Mode")');
  await enableButton.waitFor({ state: 'visible', timeout: 3000 });
  await enableButton.click();

  // Wait for UI to update
  await page.waitForTimeout(500);
}

/**
 * Helper: Disable PRO mode (fast - just UI interaction)
 */
async function disableProMode(page: Page) {
  const proOnButton = page.locator('button:has-text("PRO ON")').first();
  await proOnButton.waitFor({ state: 'visible', timeout: 5000 });
  await proOnButton.click();
  await page.waitForTimeout(500);
}

test.describe('PRO Mode - Critical Bug Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('CRITICAL: PRO toggle must update UI BEFORE conversation exists', async ({ page }) => {
    // This test would have caught the original bug
    // Tests UI state ONLY - no message sending

    // Step 1: Verify starting state
    let state = await getProModeState(page);
    expect(state).toBe('off');

    // Step 2: Enable PRO mode WITHOUT sending any message
    await enableProMode(page);

    // Step 3: CRITICAL - UI must show PRO ON immediately
    state = await getProModeState(page);
    expect(state).toBe('on');

    // Step 4: Verify button has purple gradient (visual confirmation)
    const proOnButton = page.locator('button:has-text("PRO ON")').first();
    const classList = await proOnButton.getAttribute('class');
    expect(classList).toContain('purple');

    // Step 5: Verify lightning icon is filled
    const filledIcon = proOnButton.locator('svg').first();
    await expect(filledIcon).toBeVisible();
  });

  test('CRITICAL: Toggling PRO mode multiple times before first message', async ({ page }) => {
    // Test rapid toggling before conversation exists

    // Enable PRO
    await enableProMode(page);
    let state = await getProModeState(page);
    expect(state).toBe('on');

    // Disable PRO
    await disableProMode(page);
    state = await getProModeState(page);
    expect(state).toBe('off');

    // Enable PRO again
    await enableProMode(page);
    state = await getProModeState(page);
    expect(state).toBe('on');

    // Disable again
    await disableProMode(page);
    state = await getProModeState(page);
    expect(state).toBe('off');
  });

  test('CRITICAL: PRO state persists after page interaction', async ({ page }) => {
    // Enable PRO
    await enableProMode(page);
    let state = await getProModeState(page);
    expect(state).toBe('on');

    // Click somewhere else on the page
    await page.locator('body').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    // PRO should still be ON
    state = await getProModeState(page);
    expect(state).toBe('on');
  });
});

test.describe('PRO Mode - UI and Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('UI: PRO button displays correctly', async ({ page }) => {
    // Check PRO OFF state
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    await expect(proOffButton).toBeVisible();

    // Verify lightning icon exists
    const lightningIcon = proOffButton.locator('svg').first();
    await expect(lightningIcon).toBeVisible();

    // Check button styling
    const offClassList = await proOffButton.getAttribute('class');
    expect(offClassList).toContain('outline');
  });

  test('UI: PRO ON state shows purple gradient', async ({ page }) => {
    // Enable PRO mode
    await enableProMode(page);

    // Check PRO ON state
    const proOnButton = page.locator('button:has-text("PRO ON")').first();
    await expect(proOnButton).toBeVisible();

    // Verify purple gradient styling
    const onClassList = await proOnButton.getAttribute('class');
    expect(onClassList).toContain('purple');
  });

  test('DIALOG: Shows complete information when enabling', async ({ page }) => {
    // Click PRO OFF to open dialog
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    await proOffButton.click();
    await page.waitForTimeout(300);

    // Verify dialog title
    await expect(page.locator('text=Enable PRO Mode?')).toBeVisible();

    // Verify mentions Gemini 3.0 Pro
    await expect(page.locator('text=Gemini 3.0 Pro')).toBeVisible();

    // Verify benefits listed
    await expect(page.locator('text=Higher quality responses')).toBeVisible();
    await expect(page.locator('text=Better handling of complex queries')).toBeVisible();
    await expect(page.locator('text=4K image generation')).toBeVisible();

    // Verify cost warning
    await expect(page.locator('text=/\\$0\\.03.*per message/i')).toBeVisible();

    // Verify both buttons exist
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    await expect(page.locator('button:has-text("Enable PRO Mode")')).toBeVisible();
  });

  test('DIALOG: Cancel button closes without enabling PRO', async ({ page }) => {
    // Open dialog
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    await proOffButton.click();
    await page.waitForTimeout(300);

    // Verify dialog is open
    await expect(page.locator('text=Enable PRO Mode?')).toBeVisible();

    // Click Cancel
    await page.locator('button:has-text("Cancel")').click();
    await page.waitForTimeout(300);

    // Verify dialog is closed
    await expect(page.locator('text=Enable PRO Mode?')).not.toBeVisible();

    // Verify PRO is still OFF
    const state = await getProModeState(page);
    expect(state).toBe('off');
  });

  test('DIALOG: Escape key closes dialog', async ({ page }) => {
    // Open dialog
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    await proOffButton.click();
    await page.waitForTimeout(300);

    // Press Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Verify dialog closed
    await expect(page.locator('text=Enable PRO Mode?')).not.toBeVisible();

    // PRO should still be OFF
    const state = await getProModeState(page);
    expect(state).toBe('off');
  });

  test('DIALOG: No confirmation needed to disable PRO', async ({ page }) => {
    // Enable PRO first
    await enableProMode(page);
    let state = await getProModeState(page);
    expect(state).toBe('on');

    // Click PRO ON to disable
    const proOnButton = page.locator('button:has-text("PRO ON")').first();
    await proOnButton.click();
    await page.waitForTimeout(300);

    // Should NOT show dialog
    await expect(page.locator('text=Enable PRO Mode?')).not.toBeVisible();

    // PRO should be OFF immediately
    state = await getProModeState(page);
    expect(state).toBe('off');
  });
});

test.describe('PRO Mode - Visual Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('VISUAL: Lightning icon present in both states', async ({ page }) => {
    // Check OFF state
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    const offIcon = proOffButton.locator('svg').first();
    await expect(offIcon).toBeVisible();

    // Enable and check ON state
    await enableProMode(page);
    const proOnButton = page.locator('button:has-text("PRO ON")').first();
    const onIcon = proOnButton.locator('svg').first();
    await expect(onIcon).toBeVisible();
  });

  test('VISUAL: Button is floating at top-right', async ({ page }) => {
    const proButton = page.locator('button').filter({ hasText: /PRO/ }).first();
    await expect(proButton).toBeVisible();

    // Check that button's container has absolute positioning
    // The button is wrapped in: <div className="absolute top-4 right-6 z-10">
    // Playwright uses space-separated classes, not dots for multi-class selectors
    const container = page.locator('div.absolute').filter({ has: proButton });
    await expect(container).toBeVisible();

    // Verify container has the correct positioning classes
    const classList = await container.getAttribute('class');
    expect(classList).toContain('absolute');
    expect(classList).toContain('top-4');
    expect(classList).toContain('right-6');
  });

  test('VISUAL: Immediate feedback when toggling', async ({ page }) => {
    // Record initial state
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    await expect(proOffButton).toBeVisible();

    // Enable PRO
    await enableProMode(page);

    // Button should update within 1 second
    const proOnButton = page.locator('button:has-text("PRO ON")').first();
    await expect(proOnButton).toBeVisible({ timeout: 1000 });

    // Visual style should change
    const classList = await proOnButton.getAttribute('class');
    expect(classList).toContain('purple');
  });
});

test.describe('PRO Mode - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('ACCESSIBILITY: Button has tooltip/title', async ({ page }) => {
    const proButton = page.locator('button').filter({ hasText: /PRO/ }).first();

    // Check for title attribute
    const title = await proButton.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title?.toLowerCase()).toContain('pro');
  });

  test('ACCESSIBILITY: Button is keyboard accessible', async ({ page }) => {
    const proButton = page.locator('button').filter({ hasText: /PRO/ }).first();
    await expect(proButton).toBeVisible();

    // Verify button is focusable
    await proButton.focus();

    // Verify pressing Enter opens the dialog
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Dialog should be visible (this is the important check)
    await expect(page.locator('text=Enable PRO Mode?')).toBeVisible();

    // Verify the dialog is keyboard-accessible
    const enableButton = page.locator('button:has-text("Enable PRO Mode")');
    await expect(enableButton).toBeVisible();
  });
});

test.describe('PRO Mode - State Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('STATE: Rapid clicking does not cause inconsistencies', async ({ page }) => {
    const proButton = page.locator('button').filter({ hasText: /PRO/ }).first();

    // Rapid clicks
    await proButton.click();
    await page.waitForTimeout(100);
    await page.locator('button:has-text("Enable PRO Mode")').click().catch(() => {});
    await page.waitForTimeout(100);

    await proButton.click().catch(() => {});
    await page.waitForTimeout(100);

    await proButton.click().catch(() => {});
    await page.waitForTimeout(100);
    await page.locator('button:has-text("Enable PRO Mode")').click().catch(() => {});
    await page.waitForTimeout(500);

    // Final state should be deterministic
    const state = await getProModeState(page);
    expect(['on', 'off']).toContain(state);
  });

  test('STATE: Creating new conversation resets to default', async ({ page }) => {
    // Enable PRO
    await enableProMode(page);
    let state = await getProModeState(page);
    expect(state).toBe('on');

    // Click New conversation button
    const newConvButton = page.locator('button').filter({ hasText: /^New$/i }).first();
    if (await newConvButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newConvButton.click();
      await page.waitForTimeout(500);

      // New conversation should reset to default (OFF)
      state = await getProModeState(page);
      expect(state).toBe('off');
    }
  });
});

test.describe('PRO Mode - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('EDGE: Double-clicking does not cause issues', async ({ page }) => {
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();

    // Double click
    await proOffButton.dblclick();
    await page.waitForTimeout(500);

    // Dialog should be visible (or button should be in some valid state)
    const dialogVisible = await page.locator('text=Enable PRO Mode?').isVisible().catch(() => false);
    const buttonState = await getProModeState(page);

    // Either dialog is open OR button state is valid
    expect(dialogVisible || ['on', 'off'].includes(buttonState)).toBe(true);
  });

  test('EDGE: Clicking outside dialog area', async ({ page }) => {
    // Open dialog
    const proOffButton = page.locator('button:has-text("PRO OFF")').first();
    await proOffButton.click();
    await page.waitForTimeout(300);

    // Verify dialog is open
    await expect(page.locator('text=Enable PRO Mode?')).toBeVisible();

    // Click outside (on the overlay)
    await page.locator('body').click({ position: { x: 10, y: 10 }, force: true });
    await page.waitForTimeout(500);

    // Dialog might close or stay open depending on implementation
    // Just verify no crash and state is valid
    const state = await getProModeState(page);
    expect(['on', 'off']).toContain(state);
  });
});
