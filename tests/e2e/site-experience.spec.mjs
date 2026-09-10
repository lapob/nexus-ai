import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test('opening artwork remains pinned during reversible 3D scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const scene = page.locator('.astral-hero__scene');
  await expect(scene).toHaveCSS('position', 'sticky');
  const initial = await scene.boundingBox();
  for (const y of [180, 300, 180, 0]) {
    await page.evaluate(y => scrollTo(0, y), y);
    await page.waitForTimeout(150);
    const current = await scene.boundingBox();
    expect(Math.abs(current.y - initial.y)).toBeLessThan(2);
    if (y === 300) await page.screenshot({ path: 'qa-artifacts/hero-sticky-desktop.png' });
  }
});

test('hero entry stays separate from the introduction throughout scrolling', async ({ page }) => {
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    for (const y of [0, 200, 400, 600, 800, 1000, 600, 200]) {
      await page.evaluate(y => scrollTo(0, y), y);
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.querySelector('.hero-entry').getBoundingClientRect().bottom <= document.querySelector('.hero-intro').getBoundingClientRect().top)).toBe(true);
    }
    await expect(page.getByRole('link', { name: 'Prova NexusNXS AI' })).toHaveCount(1);
  }
});

const publicRoutes = ["/", "/desktop", "/android", "/downloads", "/security", "/status", "/privacy", "/terms"];
const responsiveRoutes = [...publicRoutes, "/maintenance", "/percorso-che-non-esiste"];

test("fast scroll reversals retain one field and recover the current chapter",async({page})=>{
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    const canvas=page.locator('.nxs-cosmic-field');
    await expect(canvas).toHaveCount(1);
    await page.evaluate(()=>{window.__originalField=document.querySelector('.nxs-cosmic-field')});
    for(const ratio of [.85,.1,.6,0,.4]){
      await page.evaluate(r=>scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*r,behavior:'instant'}),ratio);
      await page.waitForTimeout(80);
    }
    await expect.poll(()=>canvas.evaluate(el=>Math.abs(Number(el.dataset.sceneProgress)-Number(el.dataset.sceneTarget)))).toBeLessThan(.12);
    expect(await page.evaluate(()=>window.__originalField===document.querySelector('.nxs-cosmic-field'))).toBe(true);
    await expect(canvas).toHaveCount(1);
  }
});

test("reading blur is feathered and transparent on desktop and mobile", async ({page}) => {
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    await page.locator('#vision').scrollIntoViewIfNeeded();
    await expect(page.locator('#vision')).toHaveClass(/nxs-in-view/);
    await page.waitForTimeout(2000);
    const treatment=await page.locator('#vision h2').evaluate(el=>{
      const style=getComputedStyle(el,'::before');
      return {blur:style.backdropFilter,mask:style.maskImage,background:style.backgroundColor,html:el.outerHTML,parent:el.parentElement?.className};
    });
    expect(treatment.blur,JSON.stringify(treatment)).toMatch(/blur\(/);
    expect(treatment.mask).toMatch(/radial-gradient/);
    expect(treatment.background).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('#site-content')).toHaveCSS('mix-blend-mode','normal');
    await page.screenshot({path:`outputs/reading-blur-${width}.png`});
    if(width===390) {
      const reserved=await page.locator('#vision').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));
      expect(reserved).toBeGreaterThan(400);
    }
  }
});

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
  // Both clients show real captures; the ambient field remains shared.
  await expect(page.locator(".app-card-visual.android img")).toHaveCount(1);
  await expect(page.locator(".app-card-visual.desktop img")).toHaveCount(1);
  await expect(page.locator(".app-card[data-cosmic-form='ambient']")).toHaveCount(2);
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
  await expect.poll(() => androidImage.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
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
  await expect(desktopFrame.locator("canvas")).toHaveCount(0);
  await expect(desktopFrame.locator("img")).toHaveAttribute("src", "/products/desktop-home.png");
  const frameBox = await desktopFrame.boundingBox();
  expect(frameBox).not.toBeNull();

  await page.mouse.move(4, 4);
  await page.waitForTimeout(520);
  expect(await desktopFrame.evaluate((frame) => new DOMMatrix(getComputedStyle(frame).transform).m42)).toBeCloseTo(0, 1);

  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await page.waitForTimeout(520);
  expect(await desktopFrame.evaluate((frame) => new DOMMatrix(getComputedStyle(frame).transform).m42)).toBeLessThan(-3);

  const desktopCardScreen = page.locator(".app-card-visual.android .app-card-visual__screen");
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
  await page.emulateMedia({ reducedMotion: "reduce" });
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
    { width: 900, height: 768 },
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

test("desktop navigation stays stable while scrolling and adapts to zoom", async ({ browser }) => {
  for (const width of [1920, 1536, 1280, 960]) {
    const context = await browser.newContext({viewport:{width,height:900}, colorScheme:"dark"});
    const page = await context.newPage();
    await page.goto("/desktop");
    const header = page.locator(".nxs-desktop-header");
    await expect(header).toBeVisible();
    await expect(page.locator(".nxs-menu-toggle")).toBeHidden();
    await expect(page.locator("#main-navigation")).toBeHidden();
    const box = await header.boundingBox();
    expect(box.x).toBe(0);
    expect(box.width).toBeLessThanOrEqual(width);
    await expect(header.getByRole("link", {name:"PC",exact:true})).toHaveAttribute("aria-current","page");
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    expect(await header.boundingBox()).toEqual(box);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.setViewportSize({width:390,height:844});
    await expect(header).toBeHidden();
    await page.locator(".nxs-menu-toggle").click();
    await expect(page.locator("#site-content")).toHaveAttribute("inert","");
    await page.setViewportSize({width:1280,height:900});
    await expect(page.locator("#site-content")).not.toHaveAttribute("inert","");
    await context.close();
  }
});

test("product pages use real accessible app captures without hydration flashes", async ({ page }) => {
  for (const product of [
    { route: "/desktop", image: "desktop-home.png", alt: /schermata principale.*PC/i },
    { route: "/android", image: "android-home-astral.png", alt: /interfaccia reale.*Android/i },
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
  const context = await browser.newContext({ viewport: { width: 900, height: 768 }, reducedMotion: "reduce", colorScheme: "dark" });
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
  await expect(page.locator("#main-navigation")).not.toHaveClass(/is-open/);
  await expect(page.locator(".nxs-menu-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".nxs-desktop-header")).toBeVisible();
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
  const core = page.locator(".nxs-cosmic-field");
  await expect(core).toHaveAttribute("data-particles", /\d+/);
  const initialHeroTransform = await core.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(260);
  const movingHeroTransform = await core.evaluate((canvas) => canvas.toDataURL());
  expect(movingHeroTransform).not.toBe(initialHeroTransform);

  const surface = page.locator(".presence-system");

  await expect(surface).not.toHaveClass(/nxs-ambient-active/);

  await surface.scrollIntoViewIfNeeded();
  await expect(hero).not.toHaveClass(/nxs-ambient-active/);
  await page.waitForTimeout(150);
  const pausedCore = await core.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(150);
  expect(await core.evaluate((canvas) => canvas.toDataURL())).not.toBe(pausedCore);
  await expect(surface).toHaveClass(/nxs-ambient-active/);
  await context.close();
});

test("astral hero reserves separate space for text at mobile, tablet and desktop sizes", async ({ page }) => {
  for (const width of [320, 390, 768, 900, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator(".hero-product-name")).toBeVisible();
    await page.waitForTimeout(800);
    const intro = await page.locator(".hero-intro").boundingBox();
    const core = await page.locator(".home-neural-core").boundingBox();
    if (width <= 800) expect(core.y + core.height).toBeLessThanOrEqual(intro.y + 1);
    else expect(core.y + core.height).toBeLessThanOrEqual(intro.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.locator(".premium-footer").scrollIntoViewIfNeeded();
    await expect(page.locator(".premium-footer canvas")).toHaveCount(0);
  }
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

test("the product title enters once and plans no longer appear", async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  const letters=page.locator(".hero-letter");
  await expect(letters).toHaveCount(8);
  await expect.poll(() => letters.evaluateAll(nodes => nodes.every(n => getComputedStyle(n).opacity === "1"))).toBe(true);
  await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
  await page.goto("/pricing");
  await expect(page).toHaveURL(/\/downloads$/);
});

test("a single background stays continuous on the internal pages", async ({page}) => {
  for (const route of ["/status", "/desktop", "/android", "/downloads", "/security"]) {
    await page.goto(route);
    await expect(page.locator('.nxs-cosmic-field')).toHaveCount(1);
    const backgrounds = await page.locator('main.inner-page > section').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).backgroundColor));
    expect(backgrounds.every(color => color === 'rgba(0, 0, 0, 0)'), route).toBe(true);
    await page.mouse.wheel(0, 650);
    await expect(page.locator('.nxs-cosmic-field')).toBeVisible();
  }
});

test("the continuous field moves particles locally without scaling the interface", async ({page}) => {
  await page.goto('/');
  const core = page.locator('.nxs-cosmic-field');
  await expect(core).toHaveAttribute('data-particles', /\d+/);
  const before = await core.boundingBox();
  const scene = page.locator('.astral-interlude').first();
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveCSS('cursor', 'grab');
  await expect(core).toHaveAttribute('data-background-particles', /\d+/);
  const backgroundCount = await core.getAttribute('data-background-particles');
  await page.mouse.move(before.x + before.width * .4, before.y + before.height * .5);
  await page.mouse.down();
  await expect(page.locator('html')).toHaveClass(/nxs-field-dragging/);
  await page.mouse.move(before.x + before.width * .65, before.y + before.height * .57, {steps:24});
  await expect(page.locator('html')).toHaveClass(/nxs-field-dragging/);
  await page.waitForTimeout(600);
  expect(Number(await core.getAttribute('data-max-drift'))).toBeGreaterThan(3);
  expect((await core.getAttribute('data-rotation')).split(',').some(v => Math.abs(Number(v)) > .01)).toBe(true);
  await page.mouse.up();
  await expect(page.locator('html')).not.toHaveClass(/nxs-field-dragging/);
  await page.mouse.move(0,0);
  await expect.poll(async () => Number(await core.getAttribute('data-max-drift')), {timeout:12000}).toBeLessThan(1);
  await expect.poll(async () => Math.max(...(await core.getAttribute('data-rotation')).split(',').map(v=>Math.abs(Number(v)))), {timeout:12000}).toBeLessThan(.01);
  expect(await core.boundingBox()).toEqual(before);
  expect(await core.getAttribute('data-background-particles')).toBe(backgroundCount);
});

test("replay reassembles only the home artwork and remains bounded on mobile", async ({page}) => {
  for (const viewport of [{width:1440,height:1000}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const core=page.locator('.nxs-cosmic-field');
    await expect(core).toHaveAttribute('data-particles', /\d+/);
    const original=await core.elementHandle();
    const replay=page.getByRole('button', {name:'Ripeti animazione'});
    await expect(replay).toBeVisible();
    const bounds=await replay.boundingBox();
    expect(await replay.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
    const cta = await page.locator('.hero-entry .primary-button').boundingBox();
    expect(bounds.x < cta.x + cta.width && bounds.x + bounds.width > cta.x && bounds.y < cta.y + cta.height && bounds.y + bounds.height > cta.y).toBe(false);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);
    await replay.click();
    expect(await original.evaluate(node=>node.isConnected)).toBe(true);
    await expect(core).toHaveAttribute('data-particles', /\d+/);
    await expect(page.locator('.nxs-cosmic-field')).toHaveCount(1);
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test("home wordmark and replay dissolve together and return with scroll", async ({page}) => {
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const replay = page.locator('.astral-hero__replay');
    const title = page.locator('.hero-product-name');
    await expect(replay).toBeEnabled();
    await page.evaluate(() => scrollTo({top:innerHeight*.29,behavior:'instant'}));
    await expect.poll(() => replay.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeCloseTo(.5, 1);
    expect(await replay.evaluate(el=>getComputedStyle(el).opacity)).toBe(await title.evaluate(el=>getComputedStyle(el).opacity));
    await page.evaluate(() => scrollTo({top:innerHeight*.6,behavior:'instant'}));
    await expect(replay).toBeDisabled();
    await expect(replay).toBeHidden();
    await expect(replay).toHaveAttribute('tabindex','-1');
    await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
    await expect(replay).toBeEnabled();
    await expect(replay).toHaveCSS('opacity','1');
    await expect(title).toHaveCSS('opacity','1');
  }
});
