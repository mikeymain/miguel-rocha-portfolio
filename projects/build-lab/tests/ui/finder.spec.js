import { test, expect } from "@playwright/test";

const blank = "/?b=SF.81.185.84." + Array(21).fill(25).join("-");
test("finder accepts uncapped target ratings and finds the supplied 96 dunk and 91 three build", async ({
  page,
}) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Desired final ratings" })).toBeVisible();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("78");
  await page.getByLabel("Cap breakers available").fill("5");
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByLabel("Desired Three-Point Shot after caps").fill("91");
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  const result = page.locator(".finder-result-card").first();
  await expect(result).toBeVisible({ timeout: 10000 });
  await expect(result).toContainText(/6′[56]″/);
  await expect(result).toContainText("96");
  await expect(result).toContainText("91");
  await expect(result.locator(".finder-ovr")).not.toHaveText("OVER");
});

test("finder uses the builder attribute panel and only asks for height and cap budget", async ({
  page,
}) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  const settings = page.getByRole("region", { name: "Build search settings" });
  await expect(settings.getByRole("combobox", { name: "From height" })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "To height" })).toBeVisible();
  await expect(settings.getByRole("spinbutton", { name: "Cap breakers available" })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Position" })).toHaveCount(0);
  await expect(settings.getByRole("spinbutton", { name: "Weight" })).toHaveCount(0);
  await expect(settings.getByRole("combobox", { name: "Wingspan" })).toHaveCount(0);
  await expect(settings.locator(".attribute-columns .attribute-row")).toHaveCount(21);
  const dunk = settings
    .locator(".attribute-row")
    .filter({ has: page.getByRole("slider", { name: "Driving Dunk slider" }) });
  await expect(dunk.locator(".attribute-main .bar-cap-steps")).toBeVisible();
  await settings.getByRole("spinbutton", { name: "Desired Driving Dunk after caps" }).fill("99");
  await settings.getByRole("spinbutton", { name: "Desired Driving Dunk after caps" }).blur();
  await expect(
    settings.getByRole("spinbutton", { name: "Desired Driving Dunk after caps" }),
  ).toHaveValue("99");
});

test("finder starts from the supplied center build including its projected cap-breaker goals", async ({
  page,
}) => {
  const ratings = {
    close: 76,
    layup: 75,
    dunk: 93,
    standing: 61,
    post: 56,
    mid: 36,
    three: 25,
    free: 37,
    pass: 70,
    handle: 59,
    swb: 54,
    interior: 85,
    perimeter: 82,
    steal: 85,
    block: 92,
    oreb: 90,
    dreb: 93,
    speed: 81,
    agility: 74,
    strength: 90,
    vertical: 90,
  };
  const build = {
    name: "C 6'8 finder build",
    body: { position: "C", height: 80, weight: 271, wingspan: 86 },
    ratings,
    breakers: { block: 1, oreb: 2, dreb: 2 },
  };
  await page.goto(`/#build=${encodeURIComponent(JSON.stringify(build))}`);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "From height" })).toHaveValue("80");
  await expect(page.getByRole("combobox", { name: "To height" })).toHaveValue("80");
  await expect(page.getByLabel("Cap breakers available")).toHaveValue("5");
  await expect(page.getByLabel("Desired Block after caps")).toHaveValue("93");
  await expect(page.getByLabel("Desired Offensive Rebound after caps")).toHaveValue("92");
  await expect(page.getByLabel("Desired Defensive Rebound after caps")).toHaveValue("95");
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  const result = page.locator(".finder-result-card").first();
  await expect(result).toBeVisible({ timeout: 10000 });
  await expect(result).toContainText("C · 6′8″");
  await expect(result).toContainText("271 lbs");
  await expect(result).toContainText("7′2″ wingspan");
  await expect(result).toContainText("Block");
  await expect(result).toContainText("Offensive Rebound");
  await expect(result).toContainText("Defensive Rebound");
});

test("finder targets default to Must and can switch to best effort", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByLabel("Desired Driving Dunk after caps").blur();
  const must = page.getByRole("button", { name: "Must reach Driving Dunk" });
  await expect(must).toHaveAttribute("aria-pressed", "true");
  await must.click();
  await expect(must).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".finder-best-effort")).toContainText("Best effort after cap breakers");
  await expect(page.getByRole("button", { name: "Must reach Block" })).toBeDisabled();
});

test("finder max buttons and badge targets set Must ratings", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  const max = page.getByRole("button", { name: /^Set Block to max \d+$/ });
  const value = (await max.textContent()).trim();
  await max.click();
  await expect(page.getByLabel("Desired Block after caps")).toHaveValue(value);
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByLabel("Desired Driving Dunk after caps").blur();
  await page.getByRole("button", { name: "Must reach Driving Dunk" }).click();
  await page.getByRole("combobox", { name: "Badge", exact: true }).selectOption("Posterizer");
  await page.getByRole("combobox", { name: "Badge tier" }).selectOption("Gold");
  await page.getByRole("button", { name: "Add badge" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Posterizer Gold" })).toContainText(
    "80 Vertical",
  );
  await expect(page.getByLabel("Desired Driving Dunk after caps")).toHaveValue("96");
  await expect(page.getByLabel("Desired Vertical after caps")).toHaveValue("80");
  await expect(page.getByRole("button", { name: "Must reach Driving Dunk" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("finder shows closest builds when no build reaches every Must target", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  await page.getByLabel("Cap breakers available").fill("5");
  for (const [name, value] of [
    ["Driving Dunk", "99"],
    ["Three-Point Shot", "91"],
    ["Block", "80"],
  ]) {
    await page.getByLabel(`Desired ${name} after caps`).fill(value);
    await page.getByLabel(`Desired ${name} after caps`).blur();
  }
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /No exact match · \d+ closest builds/ }),
  ).toBeVisible({ timeout: 15000 });
  const card = page.locator(".finder-result-card").first();
  await expect(card.locator(".finder-short-summary")).toContainText("short");
  await card.getByRole("button", { name: "Use these targets" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Targets lowered" })).toBeVisible();
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^\d+ builds found$/ })).toBeVisible({
    timeout: 15000,
  });
});

test("finder results show each cap-breaker step and the reshuffle warning", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  await page.getByLabel("Cap breakers available").fill("5");
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByLabel("Desired Three-Point Shot after caps").fill("91");
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  const card = page.locator(".finder-result-card").first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".finder-reshuffle-note")).toContainText("can change every step");
  await expect(card.locator(".finder-table-row")).toHaveCount(21);
  await expect(card.locator(".finder-result-status")).toHaveText("Every target hit.");
  const dunk = card.locator(".finder-table-row").filter({ hasText: "Driving Dunk" });
  await expect(dunk.locator(".finder-must-tag")).toHaveText("MUST");
  await expect(dunk.locator(".finder-table-target")).toHaveText("✓ 96");
  const steps = dunk.locator(".finder-cap-steps");
  const label = await steps.getAttribute("aria-label");
  const chips = label.startsWith("Driving Dunk cap breakers: ") ? label.split(", ").length : 0;
  await expect(steps.locator("b")).toHaveCount(chips);
  const base = Number(await dunk.locator(".finder-table-base").textContent());
  const gains = chips ? label.match(/\+\d+/g).map(Number) : [];
  await expect(dunk.locator(".finder-table-final")).toHaveText(
    String(Math.min(99, base + gains.reduce((sum, gain) => sum + gain, 0))),
  );
});

test("finder searches can be stopped while running", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("69");
  await page.getByRole("combobox", { name: "To height" }).selectOption("88");
  for (const name of [
    "Close Shot",
    "Driving Layup",
    "Driving Dunk",
    "Standing Dunk",
    "Mid-Range Shot",
    "Three-Point Shot",
    "Pass Accuracy",
    "Ball Handle",
    "Speed With Ball",
    "Perimeter Defense",
    "Steal",
    "Block",
    "Speed",
    "Agility",
    "Vertical",
  ]) {
    await page.getByLabel(`Desired ${name} after caps`).fill("95");
    await page.getByLabel(`Desired ${name} after caps`).blur();
  }
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Search stopped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find builds", exact: true })).toBeEnabled();
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByLabel("Desired Driving Dunk after caps").blur();
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  await expect(page.locator(".finder-result-card").first()).toBeVisible({ timeout: 20000 });
});

test("editor opens the current build in the finder", async ({ page }) => {
  const ratings = {
    close: 76,
    layup: 75,
    dunk: 93,
    standing: 61,
    post: 56,
    mid: 36,
    three: 25,
    free: 37,
    pass: 70,
    handle: 59,
    swb: 54,
    interior: 85,
    perimeter: 82,
    steal: 85,
    block: 92,
    oreb: 90,
    dreb: 93,
    speed: 81,
    agility: 74,
    strength: 90,
    vertical: 90,
  };
  const build = {
    name: "C finder handoff",
    body: { position: "C", height: 80, weight: 271, wingspan: 86 },
    ratings,
    breakers: { block: 1 },
  };
  await page.goto(`/#build=${encodeURIComponent(JSON.stringify(build))}`);
  await page.getByRole("button", { name: "Open in Finder" }).click();
  await expect(page.getByRole("heading", { name: "Find your build" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "From height" })).toHaveValue("80");
  await expect(page.getByLabel("Desired Driving Dunk after caps")).toHaveValue("93");
});

test("finder target hints jump to the next badge step", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  await page.getByLabel("Desired Driving Dunk after caps").fill("90");
  await page.getByLabel("Desired Driving Dunk after caps").blur();
  await page.getByRole("button", { name: "Next badge: 93 Posterizer Gold" }).click();
  await expect(page.getByLabel("Desired Driving Dunk after caps")).toHaveValue("93");
});

test("finder splits regular and specialization cap breakers", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  const special = page.getByRole("spinbutton", { name: "Specialization breakers" });
  await expect(special).toBeDisabled();
  await page.getByRole("combobox", { name: "Specialization", exact: true }).selectOption("fin");
  await expect(special).toHaveValue("2");
  await special.fill("3");
  await page.getByRole("combobox", { name: "Specialization", exact: true }).selectOption("sht");
  await expect(special).toHaveValue("3");
  await page.getByRole("combobox", { name: "Specialization", exact: true }).selectOption("fin");
  await page.getByLabel("Cap breakers available").fill("2");
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByLabel("Desired Three-Point Shot after caps").fill("91");
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  const card = page.locator(".finder-result-card").first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card.locator(".finder-caps-pill")).toContainText("/ 5 CB");
  await expect(card.locator("footer")).toContainText("on Finishing");
});

test("finder falls back to an on-page search when the worker file is missing", async ({ page }) => {
  await page.route("**/assets/finderWorker-*.js", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  await page.getByLabel("Cap breakers available").fill("5");
  await page.getByLabel("Desired Driving Dunk after caps").fill("96");
  await page.getByRole("button", { name: "Find builds", exact: true }).click();
  await expect(page.locator(".finder-result-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".finder-errors")).toHaveCount(0);
});

test("finder targets cannot exceed the height range maximum", async ({ page }) => {
  await page.goto(blank);
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  const max = (
    await page.getByRole("button", { name: /^Set Block to max \d+$/ }).textContent()
  ).trim();
  expect(Number(max)).toBeLessThan(99);
  const block = page.getByLabel("Desired Block after caps");
  await block.fill("99");
  await block.blur();
  await expect(block).toHaveValue(max);
  await expect(page.getByRole("slider", { name: "Block slider" })).toHaveAttribute("max", max);
  await expect(page.locator('[aria-label="Increase desired Block"]')).toBeDisabled();
  await page.getByRole("combobox", { name: "To height" }).selectOption("88");
  await page.getByRole("combobox", { name: "From height" }).selectOption("88");
  await page.getByRole("combobox", { name: "To height" }).selectOption("77");
  await page.getByRole("combobox", { name: "From height" }).selectOption("77");
  await expect(block).toHaveValue(max);
});

test("builder minimizes cap breakers while keeping every after-cap rating", async ({ page }) => {
  const build = {
    name: "slack",
    body: { position: "C", height: 80, weight: 271, wingspan: 86 },
    ratings: {
      close: 60,
      layup: 60,
      dunk: 85,
      standing: 61,
      post: 50,
      mid: 36,
      three: 25,
      free: 37,
      pass: 60,
      handle: 55,
      swb: 50,
      interior: 80,
      perimeter: 75,
      steal: 75,
      block: 85,
      oreb: 80,
      dreb: 85,
      speed: 75,
      agility: 70,
      strength: 85,
      vertical: 85,
    },
    breakers: { block: 3, oreb: 2, dreb: 2, dunk: 3 },
  };
  await page.goto(`/#build=${encodeURIComponent(JSON.stringify(build))}`);
  await page.getByRole("button", { name: "Cap breakers", exact: true }).click();
  await expect(page.locator(".cap-usage strong")).toHaveText("10");
  await page.getByRole("button", { name: "Minimize caps" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(page.locator(".cap-usage strong")).not.toHaveText("10");
  await page.getByRole("button", { name: "Find build", exact: true }).click();
  await expect(page.getByRole("button", { name: /Minimize caps needed/ })).toHaveCount(0);
});
