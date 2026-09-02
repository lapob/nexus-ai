import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/desktop", "/android", "/pricing", "/downloads", "/security", "/status", "/privacy", "/terms"];
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

test("the homepage loads real product captures without CSP or runtime errors", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".app-card-visual").first().scrollIntoViewIfNeeded();
  await expect(page.locator(".app-card-visual img")).toHaveCount(2);
  const captures = await page.locator(".app-card-visual img").evaluateAll((images) =>
    images.map((image) => ({ width: image.naturalWidth, height: image.naturalHeight })),
  );
  expect(captures.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test("real product captures keep Android system bars visible and use precise hover targets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "load" });

  const showcase = page.locator(".one-nexus");
  await showcase.scrollIntoViewIfNeeded();
  const androidScreen = showcase.locator(".product-mockup--real.android .product-screen");
  const androidImage = androidScreen.locator("img");
  const androidGeometry = await androidScreen.evaluate((screen) => {
    const image = screen.querySelector("img");
    const screenRect = screen.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    return {
      ratio: screenRect.width / screenRect.height,
      imageRatio: imageRect ? imageRect.width / imageRect.height : 0,
      naturalRatio: image ? image.naturalWidth / image.naturalHeight : 0,
      objectFit: image ? getComputedStyle(image).objectFit : "",
    };
  });
  expect(androidGeometry.objectFit).toBe("contain");
  expect(androidGeometry.ratio).toBeCloseTo(9 / 16, 2);
  expect(androidGeometry.imageRatio).toBeCloseTo(androidGeometry.naturalRatio, 2);
  await expect(androidImage).toBeVisible();

  const desktopFrame = showcase.locator(".product-mockup--real.desktop .device-frame");
  const frameBox = await desktopFrame.boundingBox();
  expect(frameBox).not.toBeNull();

  await page.mouse.move(4, 4);
  await page.waitForTimeout(520);
  expect(await desktopFrame.evaluate((frame) => new DOMMatrix(getComputedStyle(frame).transform).m42)).toBeCloseTo(0, 1);

  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await page.waitForTimeout(520);
  expect(await desktopFrame.evaluate((frame) => new DOMMatrix(getComputedStyle(frame).transform).m42)).toBeLessThan(-3);

  const desktopCardScreen = page.locator(".app-card-visual.desktop .app-card-visual__screen");
  await desktopCardScreen.scrollIntoViewIfNeeded();
  const cardScreenBox = await desktopCardScreen.boundingBox();
  expect(cardScreenBox).not.toBeNull();
  await page.mouse.move(cardScreenBox.x - 8, cardScreenBox.y + cardScreenBox.height / 2);
  await page.waitForTimeout(460);
  expect(await desktopCardScreen.evaluate((screen) => new DOMMatrix(getComputedStyle(screen).transform).m42)).toBeCloseTo(0, 1);
  await page.mouse.move(cardScreenBox.x + cardScreenBox.width / 2, cardScreenBox.y + cardScreenBox.height / 2);
  await page.waitForTimeout(460);
  expect(await desktopCardScreen.evaluate((screen) => new DOMMatrix(getComputedStyle(screen).transform).m42)).toBeLessThan(-3);
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
    const linkLayout = await navigation.locator("a").first().evaluate((link) => ({
      columns: getComputedStyle(link).gridTemplateColumns.split(" ").filter(Boolean).length,
      number: getComputedStyle(link.querySelector(".nxs-nav__number")).display,
      icon: getComputedStyle(link.querySelector(".nxs-nav__icon")).display,
      wraps: link.scrollHeight > link.clientHeight + 1,
    }));
    expect(linkLayout.columns).toBe(3);
    expect(linkLayout.number).toBe("none");
    expect(linkLayout.icon).toBe("grid");
    expect(linkLayout.wraps).toBe(false);

    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(page.getByRole("button", { name: "Apri navigazione" })).toBeFocused();
    await context.close();
  }
});

test("desktop has no persistent header or navigation rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/desktop", { waitUntil: "load" });
  const navigation = page.getByRole("navigation", { name: "Navigazione principale" });
  const content = page.locator("#site-content");

  await expect(navigation).toBeHidden();
  await expect(page.locator(".nxs-header, .nxs-top-nav")).toHaveCount(0);
  await expect(page.locator(".nxs-floating-brand")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apri navigazione" })).toBeVisible();
  expect(Number.parseFloat(await content.evaluate((element) => getComputedStyle(element).paddingLeft))).toBeCloseTo(0, 0);

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
});

test("floating controls stay stable at effective 100, 125, 150 and 200 percent desktop scales", async ({ browser }) => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "load" });

    const before = await page.evaluate(() => {
      const brand = document.querySelector(".nxs-floating-brand")?.getBoundingClientRect();
      const control = document.querySelector(".nxs-menu-toggle")?.getBoundingClientRect();
      return {
        brand: brand && { top: brand.top, left: brand.left, width: brand.width, height: brand.height },
        control: control && { top: control.top, right: control.right, width: control.width, height: control.height },
        brandPosition: getComputedStyle(document.querySelector(".nxs-floating-brand")).position,
        controlPosition: getComputedStyle(document.querySelector(".nxs-menu-toggle")).position,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(before.brandPosition).toBe("fixed");
    expect(before.controlPosition).toBe("fixed");
    expect(before.brand?.width).toBeGreaterThanOrEqual(44);
    expect(before.brand?.height).toBeGreaterThanOrEqual(44);
    expect(before.control?.width).toBeGreaterThanOrEqual(44);
    expect(before.control?.height).toBeGreaterThanOrEqual(44);
    expect(before.brand?.left).toBeGreaterThanOrEqual(12);
    expect(before.control?.right).toBeLessThanOrEqual(viewport.width - 12);
    expect(before.scrollWidth).toBeLessThanOrEqual(before.clientWidth + 1);
    await expect(page.getByRole("button", { name: "Apri navigazione" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigazione principale" })).toBeHidden();

    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const brand = document.querySelector(".nxs-floating-brand")?.getBoundingClientRect();
      const control = document.querySelector(".nxs-menu-toggle")?.getBoundingClientRect();
      return {
        brand: brand && { top: brand.top, left: brand.left, width: brand.width, height: brand.height },
        control: control && { top: control.top, right: control.right, width: control.width, height: control.height },
      };
    });
    expect(after.brand).toEqual(before.brand);
    expect(after.control).toEqual(before.control);
    await context.close();
  }
});

test("product pages use real accessible app captures without hydration flashes", async ({ page }) => {
  for (const product of [
    { route: "/desktop", image: "desktop-core.png", alt: /interfaccia reale.*PC/i },
    { route: "/android", image: "android-home.png", alt: /interfaccia reale.*Android/i },
  ]) {
    await page.goto(product.route, { waitUntil: "domcontentloaded" });
    const hero = page.locator(".product-hero");
    const image = page.locator(`img[src*="${product.image}"]`).first();
    await expect(hero).toBeVisible();
    await expect(image).toHaveAttribute("alt", product.alt);
    await page.waitForTimeout(120);
    expect(Number.parseFloat(await hero.evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
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

test("the fullscreen overlay remains coherent across breakpoints and honors reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce", colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Apri navigazione" }).click();

  const transitionSeconds = await page.locator("#main-navigation").evaluate((nav) => getComputedStyle(nav).transitionDuration
    .split(",")
    .map((value) => value.trim().endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value)));
  expect(Math.max(...transitionSeconds)).toBeLessThanOrEqual(.02);

  const ambientMotionSeconds = await page.locator(".app-orb span, .presence-grid article > i").evaluateAll((elements) => elements.flatMap((element) => getComputedStyle(element).animationDuration
    .split(",")
    .map((value) => value.trim().endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value))));
  expect(Math.max(0, ...ambientMotionSeconds)).toBeLessThanOrEqual(.02);

  await page.setViewportSize({ width: 1025, height: 768 });
  await expect(page.locator("#main-navigation")).toHaveClass(/is-open/);
  await expect(page.locator(".nxs-menu-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#main-navigation")).toBeVisible();
  await context.close();
});

test("motion quality adapts without exposing hardware details in the interface", async ({ browser }) => {
  for (const profile of [
    { expected: "lite", cores: 2, memory: 2, saveData: true, effectiveType: "2g" },
    { expected: "balanced", cores: 8, memory: 8, saveData: false, effectiveType: "4g" },
    { expected: "ultra", cores: 16, memory: 16, saveData: false, effectiveType: "4g" },
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
    await context.addInitScript((capability) => {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => capability.cores });
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => capability.memory });
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        get: () => ({ saveData: capability.saveData, effectiveType: capability.effectiveType }),
      });
    }, profile);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("html")).toHaveClass(new RegExp(`nxs-motion-${profile.expected}`));
    await expect(page.locator("html")).toHaveAttribute("data-motion-tier", profile.expected);
    await expect(page.locator("body")).not.toContainText(/hardwareConcurrency|deviceMemory|motion tier/i);
    await context.close();
  }
});

test("homepage sections reveal on scroll through the shared motion runtime", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: "dark", reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      get: () => ({ saveData: false, effectiveType: "4g" }),
    });
  });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "load" });

  const target = page.locator(".presence-system");
  await expect(target).toHaveClass(/nxs-motion-candidate/);
  const initialReveal = await target.evaluate((element) => ({
    className: element.className,
    opacity: Number.parseFloat(getComputedStyle(element).opacity),
    transform: getComputedStyle(element).transform,
    translateY: new DOMMatrix(getComputedStyle(element).transform).m42,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    matchesMotionRule: element.matches(".nxs-motion-ready .nxs-motion-candidate"),
    rootClassName: document.documentElement.className,
    top: element.getBoundingClientRect().top,
  }));
  expect(initialReveal.className).not.toContain("nxs-in-view");
  expect(initialReveal.reducedMotion).toBe(false);
  expect(initialReveal.matchesMotionRule, initialReveal.rootClassName).toBe(true);
  expect(initialReveal.top).toBeGreaterThan(720);
  expect(initialReveal.opacity).toBe(0);
  expect(initialReveal.transform).not.toBe("none");
  expect(initialReveal.translateY).toBeGreaterThan(0);

  await target.scrollIntoViewIfNeeded();
  await expect(target).toHaveClass(/nxs-in-view/);
  await expect.poll(() => target.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await expect.poll(() => target.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))).toBe(1);

  const progress = Number.parseFloat(await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--nxs-scroll")));
  expect(progress).toBeGreaterThan(0);
  await context.close();
});

test("ambient motion only runs while its surface is near the viewport", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: "dark", reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
  });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "load" });

  const hero = page.locator(".hero");
  await expect(hero).toHaveClass(/nxs-ambient-active/);
  const initialHeroTransform = await hero.evaluate((element) => getComputedStyle(element.querySelector(".aurora"), "::before").transform);
  await page.waitForTimeout(260);
  const movingHeroTransform = await hero.evaluate((element) => getComputedStyle(element.querySelector(".aurora"), "::before").transform);
  expect(movingHeroTransform).not.toBe(initialHeroTransform);

  const surface = page.locator(".presence-system");
  const indicator = surface.locator(".presence-grid article > i").first();
  await expect(surface).not.toHaveClass(/nxs-ambient-active/);
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");

  await surface.scrollIntoViewIfNeeded();
  await expect(hero).not.toHaveClass(/nxs-ambient-active/);
  await expect(surface).toHaveClass(/nxs-ambient-active/);
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  await context.close();
});

test("the homepage routes to the single live AI and local performance metrics never transmit", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/", { waitUntil: "load" });

  const aiLinks = page.getByRole("link", { name: /NexusNXS AI/i });
  await expect(aiLinks.first()).toHaveAttribute("href", "https://ai.nexusnxs.com");
  await expect(page.locator(".core-demo")).toHaveCount(0);
  await expect(page.getByText(/demo resta locale nel browser/i)).toHaveCount(0);

  await page.goto("/status", { waitUntil: "load" });
  const metrics = page.locator(".client-performance");
  await expect(metrics).toBeVisible();
  await expect(metrics).toContainText("Privacy intatta");
  expect(requests.some((url) => /vitals|analytics|telemetry/iu.test(url))).toBe(false);
});

test("reduced motion keeps every reveal target immediately readable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "load" });

  const targets = page.locator(".reveal");
  await expect(targets.first()).toHaveClass(/nxs-in-view/);
  const states = await targets.evaluateAll((elements) => elements.map((element) => ({
    opacity: Number.parseFloat(getComputedStyle(element).opacity),
    transform: getComputedStyle(element).transform,
  })));
  expect(states.every(({ opacity, transform }) => opacity === 1 && transform === "none")).toBe(true);
  await context.close();
});

test("mobile status and security surfaces stay bounded around the floating controls", async ({ browser }) => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 592, height: 960 },
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "no-preference" });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        get: () => ({ saveData: false, effectiveType: "4g" }),
      });
    });
    const page = await context.newPage();

    for (const route of ["/security", "/status"]) {
      await page.goto(route, { waitUntil: "load" });
      const geometry = await page.evaluate(() => {
        const brand = document.querySelector(".nxs-floating-brand")?.getBoundingClientRect();
        const menu = document.querySelector(".nxs-menu-toggle")?.getBoundingClientRect();
        const firstSection = document.querySelector(".inner-page > section:first-child")?.getBoundingClientRect();
        const bounded = [...document.querySelectorAll(".trust-seal, .trust-seal span, .service-list > div")]
          .map((element) => element.getBoundingClientRect())
          .every((rect) => rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1);
        return {
          floatingControls: [brand, menu].every((rect) => rect && rect.top >= 0 && rect.bottom <= innerHeight),
          firstSectionTop: firstSection?.top ?? -1,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bounded,
        };
      });

      expect(geometry.firstSectionTop, `${route} must begin at the viewport top`).toBeGreaterThanOrEqual(0);
      expect(geometry.floatingControls, `${route} floating controls must remain in the viewport`).toBe(true);
      expect(geometry.scrollWidth, `${route} must not overflow`).toBeLessThanOrEqual(geometry.clientWidth + 1);
      expect(geometry.bounded, `${route} mobile content must remain bounded`).toBe(true);
    }

    await page.goto("/security", { waitUntil: "load" });
    await expect(page.locator("html")).toHaveClass(/nxs-motion-balanced/);
    const seal = page.locator(".trust-seal");
    await expect(seal).toBeVisible();
    await seal.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(seal).toHaveClass(/nxs-ambient-active/);
    const sealMotion = await seal.evaluate((element) => getComputedStyle(element).animationName);
    expect(sealMotion).toContain("nxs-trust-breathe");
    await context.close();
  }
});
