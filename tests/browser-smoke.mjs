import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const base = resolve(import.meta.dirname, '..');
const server = createServer(async (request, response) => {
  try {
    const path = resolve(base, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(base + sep)) { response.writeHead(403).end(); return; }
    const content = await readFile(path);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TE_CHROMIUM_PATH ? { executablePath: process.env.TE_CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 850, height: 650 } });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/tracker.html`);
  await page.waitForFunction(() => window.testHarness);
  if (process.env.TE_CORE_CSS) await page.addStyleTag({ path: process.env.TE_CORE_CSS });
  const hp = page.locator('[data-combatant-id="a"] .te-modify-hp');

  await hp.fill('-3');
  await hp.press('Enter');
  await page.waitForFunction(() => testHarness.members[0].actor.system.attributes.hp.value === 17);
  assert.equal(await page.evaluate(() => testHarness.members[0].actor.writes.length), 1);
  await hp.fill('+8');
  await hp.press('Escape');
  assert.equal(await hp.inputValue(), '17');
  assert.equal(await page.evaluate(() => testHarness.members[0].actor.writes.length), 1);
  await hp.fill('');
  await hp.press('Tab');
  assert.equal(await hp.inputValue(), '17');
  assert.equal(await page.evaluate(() => testHarness.warnings.length), 1);
  await page.locator('[data-action="toggleHidden"]').first().click();
  assert.equal(await page.evaluate(() => testHarness.coreClicks), 1);
  assert.equal(await page.evaluate(() => testHarness.coreChanges), 0);

  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.body.className = `theme-${theme}`; }, theme);
    const overflow = await page.locator('.te-modify-hp').evaluateAll(inputs => inputs.filter(input => {
      const field = input.getBoundingClientRect(), row = input.closest('li').getBoundingClientRect();
      return field.left < row.left || field.right > row.right || field.bottom > row.bottom;
    }).length);
    assert.equal(overflow, 0, `HP fields fit inside tracker rows in the ${theme} theme`);
    await mkdir(resolve(base, 'test-results'), { recursive: true });
    await page.screenshot({ path: resolve(base, `test-results/tracker-${theme}.png`) });
  }

  await page.locator('[data-combatant-id="c"]').dragTo(page.locator('[data-combatant-id="a"]'), {
    targetPosition: { x: 15, y: 3 },
  });
  await page.waitForFunction(() => testHarness.combat.turns[0].id === 'c');
  assert.equal(await page.evaluate(() => testHarness.combat.combatant.id), 'b');
  await page.evaluate(() => {
    game.user.isGM = false;
    testHarness.settings.set('hideNonAllyInitiative', true);
    testHarness.app.render();
  });
  assert.equal(await page.locator('.te-modify-hp').count(), 1);
  assert.equal(await page.locator('.te-hide-initiative').count(), 2);
  assert.equal(await page.locator('[data-combatant-id="b"] .token-initiative').isVisible(), false);

  // Match a player's owned PC, another player's PC and an NPC with owner-only bars.
  await page.evaluate(() => {
    testHarness.members[2].actor.type = 'npc';
    for (const c of testHarness.members) c.token.displayBars = CONST.TOKEN_DISPLAY_MODES.OWNER;
  });
  for (const [choice, expected] of [
    ['', ['a']], ['npc', ['a', 'c']], ['character', ['a', 'b']],
    ['encounter', ['a']], ['group', ['a']], ['*', ['a', 'b', 'c']], ['', ['a']],
  ]) {
    await page.evaluate(choice => {
      testHarness.settings.set('showHpForType', choice);
      testHarness.app.render();
    }, choice);
    const visible = await page.locator('.progress-ring').evaluateAll(rings =>
      rings.map(ring => ring.closest('[data-combatant-id]').dataset.combatantId).sort());
    assert.deepEqual(visible, expected, `Player HP circles for ${choice || 'token visibility'}`);
    assert.equal(await page.locator('.te-modify-hp').count(), 1);
  }
  assert.deepEqual(await page.evaluate(() => testHarness.errors), []);

  // D&D 6 public-API contract fixture: real DOM events, two pools, and native duplicates.
  await page.evaluate(() => testHarness.enableDnd());
  const temp = page.locator('[data-combatant-id="a"] .te-modify-temp');
  assert.equal(await page.locator('.token-resource').count(), 0);
  assert.equal(await page.locator('.te-health-input').count(), 6);
  await temp.fill('-25'); await temp.press('Enter');
  await page.waitForFunction(() => testHarness.members[0].actor.system.attributes.hp.value === 95);
  assert.equal(await temp.inputValue(), '0');
  assert.equal(await page.evaluate(() => testHarness.members[0].actor.updates.length), 1);
  await temp.fill('20'); await temp.press('Tab');
  await page.waitForFunction(() => testHarness.members[0].actor.system.attributes.hp.temp === 20);
  assert.equal(await hp.inputValue(), '95');
  await temp.fill('+3'); await temp.press('Enter');
  await page.waitForFunction(() => testHarness.members[0].actor.system.attributes.hp.temp === 23);
  await hp.fill('+50'); await hp.press('Enter');
  await page.waitForFunction(() => testHarness.members[0].actor.system.attributes.hp.value === 120);
  assert.equal(await temp.inputValue(), '23');
  await hp.fill('100'); await hp.press('Enter');
  await page.waitForFunction(() => testHarness.members[0].actor.system.attributes.hp.value === 100);
  assert.equal(await temp.inputValue(), '23');

  await temp.fill('-5');
  await page.evaluate(() => testHarness.app.render());
  assert.equal(await temp.inputValue(), '-5');
  assert.equal(await temp.evaluate(input => input === document.activeElement), true);
  await temp.press('Escape');
  assert.equal(await temp.inputValue(), '23');
  const writes = await page.evaluate(() => testHarness.members[0].actor.updates.length);
  await hp.fill('2.5'); await hp.press('Enter');
  assert.equal(await hp.inputValue(), '100');
  assert.equal(await page.evaluate(() => testHarness.members[0].actor.updates.length), writes);

  await page.evaluate(() => {
    const actor = testHarness.members[0].actor;
    actor.system._source.attributes.hp.tempmax = -20;
    actor.system._source.attributes.hp.value = 140;
    actor.prepareHealth();
    testHarness.app.render();
  });
  assert.equal(await page.locator('[data-combatant-id="a"] .te-hp-arc').getAttribute('stroke-dasharray'), '100 100');
  assert.equal(await page.locator('[data-combatant-id="a"] .te-temp-arc').getAttribute('stroke-width'), '3.5');
  // A max reduction can leave source HP above the prepared value. Escape or
  // invalid input must not accidentally commit an absolute correction on blur.
  const beforeCancel = await page.evaluate(() => testHarness.members[0].actor.updates.length);
  await hp.fill('-1'); await hp.press('Escape');
  await hp.fill('2.5'); await hp.press('Enter');
  assert.equal(await page.evaluate(() => testHarness.members[0].actor.updates.length), beforeCancel);
  assert.equal(await page.evaluate(() => testHarness.members[0].actor.system._source.attributes.hp.value), 140);

  for (const gm of [true, false]) {
    await page.evaluate(gm => { game.user.isGM = gm; testHarness.app.render(); }, gm);
    assert.equal(await page.locator('.te-health-input').count(), gm ? 6 : 2);
    assert.equal(await page.locator('.te-health-value').count(), gm ? 0 : 2);
    assert.equal(await page.locator('.token-resource').count(), 0);
    if (!gm) assert.equal(await page.locator('[data-combatant-id="c"] .te-health-fields').count(), 0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.body.className = `theme-${theme}`; }, theme);
      const clipped = await page.locator('.te-health-input, .te-health-value').evaluateAll(elements => elements.some(el => {
        const field = el.getBoundingClientRect(), row = el.closest('li').getBoundingClientRect();
        return field.left < row.left || field.right > row.right || field.bottom > row.bottom;
      }));
      assert.equal(clipped, false, `D&D fields fit in ${theme}, GM=${gm}`);
      await page.screenshot({ path: resolve(base, `test-results/dnd6-${gm ? 'gm' : 'player'}-${theme}.png`) });
    }
  }
  await page.evaluate(() => { testHarness.combat.settings.resource = 'attributes.ac.value'; testHarness.app.render(); });
  assert.equal(await page.locator('.token-resource').count(), 3, 'Unrelated native AC remains present');
  assert.deepEqual(await page.evaluate(() => testHarness.errors), []);
  assert.deepEqual(failures, []);
  console.log('Browser smoke passed: generic and D&D health edits, Temp overflow, drafts/cancel, two themes and roles, native resource deduplication, modifiers, core controls, drag/drop, active turn and player visibility.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
