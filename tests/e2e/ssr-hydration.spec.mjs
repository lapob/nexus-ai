import { expect, test } from "@playwright/test";

test("SSR hydration retains every page, nonce and status label at narrow and wide widths", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydration|Minified React|content security policy/i.test(message.text())) errors.push(message.text()); });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/", "/desktop", "/android", "/downloads", "/status", "/maintenance", "/not-a-page"]) {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response.status()).toBe(route === "/not-a-page" ? 404 : 200);
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.locator("#main-navigation")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const data = await page.locator("#nexus-site-state").textContent();
      const snapshot = JSON.parse(data);
      expect(snapshot.pathname).toBe(route);
      if (route === "/status") await expect(page.locator(".status-banner time")).toHaveText(snapshot.status.checkedAtLabel);
      if (route === "/") await page.screenshot({ path: `qa-artifacts/site-oct10-ssr-home-${width}.png` });
    }
  }
  expect(errors).toEqual([]);
});
