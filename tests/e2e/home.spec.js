const { test, expect } = require('@playwright/test');

test.describe('JFK Archives RAG App', () => {
  test('should load the home page correctly', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Verify page title
    await expect(page).toHaveTitle(/JFK Archives RAG/);

    // Verify main heading
    const heading = page.locator('h1');
    await expect(heading).toContainText('JFK Archives Search');

    // Verify search form exists
    await expect(page.locator('form input[type="text"]')).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
  });

  test('should handle empty query submission', async ({ page }) => {
    await page.goto('/');

    // Try to submit with empty query (should do nothing)
    await page.locator('form button[type="submit"]').click();

    // Verify no loading state or results shown
    await expect(page.locator('button:has-text("Searching...")')).toBeHidden();
    await expect(page.locator('h2:has-text("Answer")')).toBeHidden();
  });

  test('should perform search and display results', async ({ page }) => {
    await page.goto('/');

    // Type a query
    await page.locator('input[type="text"]').fill('Who was John F. Kennedy?');

    // Submit the query
    await page.locator('form button[type="submit"]').click();

    // Verify loading state
    await expect(page.locator('button:has-text("Searching...")')).toBeVisible();

    // Wait for response (this might take a while due to API calls)
    await expect(page.locator('h2:has-text("Answer")')).toBeVisible({ timeout: 30000 });

    // Verify answer section is visible
    const answerSection = page.locator('.prose p');
    await expect(answerSection).toBeVisible();
    
    // Verify answer is not empty
    const answerText = await answerSection.textContent();
    expect(answerText.length).toBeGreaterThan(10);

    // Verify sources section (may or may not be visible depending on the response)
    const sourcesSection = page.locator('h2:has-text("Sources")');
    if (await sourcesSection.isVisible()) {
      // If sources are visible, verify at least one source item
      await expect(page.locator('ul.divide-y li')).toHaveCount({ min: 1 });
    }
  });

  test('should handle network errors gracefully', async ({ page, context }) => {
    // Mock the API to return an error
    await context.route('/api/query', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Simulated server error' })
      });
    });

    await page.goto('/');

    // Type a query
    await page.locator('input[type="text"]').fill('Test query with error');

    // Submit the query
    await page.locator('form button[type="submit"]').click();

    // Verify error message appears
    await expect(page.locator('div[role="alert"]')).toBeVisible();
    await expect(page.locator('div[role="alert"]')).toContainText('error');
  });
}); 