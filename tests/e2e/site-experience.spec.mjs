import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/desktop", "/android", "/downloads", "/security", "/status", "/privacy", "/terms"];
const responsiveRoutes = [...publicRoutes, "/maintenance", "/percorso-che-non-esiste"];

test("all public and operational pages render without horizontal overflow or oversized headings", async ({ page }) => {
  for (const route of responsiveRoutes) {
    const response = await page.goto(route, { waitUntil: "load" });
    expect(response, `${route} must return a document`).not.toBeNull();
    if (route === "/percorso-che-non-esiste") expect(response.status()).toBe(404);
    else expect(response.status(), `${route} must render`).toBeLessThan(400);

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      h1Sizes: [...document.querySelectorAll("h1")].map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      h2Sizes: [...document.querySelectorAll("h2")].map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
    }));

    expect(layout.scrollWidth, `${route} must not overflow horizontally`).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(Math.max(0, ...layout.h1Sizes), `${route} h1 must stay compact`).toBeLessThanOrEqual(80);
    expect(Math.max(0, ...layout.h2Sizes), `${route} h2 must stay compact`).toBeLessThanOrEqual(64);
    await page.waitForTimeout(75);
  }
});

test("core routes pass automated WCAG A/AA checks", async ({ page }) => {
  for (const route of publicRoutes) {
    await page.goto(route, { waitUntil: "load" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, `${route}: ${results.violations.map((violation) => violation.id).join(", ")}`).toEqual([]);
  }
});

test("the mobile navigation is icon-only, fullscreen and keyboard safe at every supported width", async ({ browser }) => {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const toggle = page.getByRole("button", { name: "Apri navigazione" });
    await expect(toggle).toBeVisible();
    expect((await toggle.textContent())?.trim()).toBe("");
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

    await toggle.click();
    const navigation = page.getByRole("navigation", { name: "Navigazione principale" });
    await expect(navigation).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: "Chiudi navigazione" })).toHaveAttribute("aria-expanded", "true");

    const state = await page.evaluate(() => {
      const nav = document.getElementById("main-navigation");
      const content = document.getElementById("site-content");
      const rect = nav?.getBoundingClientRect();
      return {
        bodyOverflow: getComputedStyle(document.body).overflow,
        inert: content?.hasAttribute("inert"),
        hidden: content?.getAttribute("aria-hidden"),
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        linkSizes: [...(nav?.querySelectorAll("a") ?? [])].map((link) => Number.parseFloat(getComputedStyle(link).fontSize)),
      };
    });

    expect(state.bodyOverflow).toBe("hidden");
    expect(state.inert).toBe(true);
    expect(state.hidden).toBe("true");
    expect(state.rect?.x).toBeCloseTo(0, 0);
    expect(state.rect?.y).toBeCloseTo(0, 0);
    expect(state.rect?.width).toBeCloseTo(viewport.width, 0);
    expect(state.rect?.height).toBeCloseTo(viewport.height, 0);
    expect(Math.max(...state.linkSizes)).toBeLessThanOrEqual(38);

    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(page.getByRole("button", { name: "Apri navigazione" })).toBeFocused();
    await context.close();
  }
});

test("every mobile navigation destination opens and marks the current page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const destination of [
    { label: "PC", href: "/desktop" },
    { label: "Android", href: "/android" },
    { label: "Sicurezza", href: "/security" },
    { label: "Stato", href: "/status" },
    { label: "Download", href: "/downloads" },
  ]) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Apri navigazione" }).click();
    await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("link", { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.href.replace("/", "\\/")}$`));
    await page.getByRole("button", { name: "Apri navigazione" }).click();
    await expect(page.getByRole("link", { name: destination.label, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("the mobile overlay closes at the desktop breakpoint and honors reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce", colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Apri navigazione" }).click();

  const transitionSeconds = await page.locator("#main-navigation").evaluate((nav) => getComputedStyle(nav).transitionDuration
    .split(",")
    .map((value) => value.trim().endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value)));
  expect(Math.max(...transitionSeconds)).toBeLessThanOrEqual(.02);

  await page.setViewportSize({ width: 1025, height: 768 });
  await expect(page.locator("#main-navigation")).not.toHaveClass(/is-open/);
  await expect(page.locator(".nxs-menu-toggle")).toHaveAttribute("aria-expanded", "false");
  await context.close();
});
