import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { getHealthData, parseHealthOperation, applyHealthOperation } from '../module/health.js';
import { TrackerEnhancements } from '../module/tracker.js';
import { environment, combatant, encounter, tracker } from './helpers.mjs';
import { dndHealthActor } from './fixtures/dnd-health.mjs';

let env;
beforeEach(() => {
  env = environment();
  Object.assign(game.system, { id: 'dnd5e', version: '6.0.5' });
});

function member(id = 'a', hp) {
  const c = combatant(id);
  dndHealthActor(c.actor, hp);
  c.token.getBarAttribute = () => ({ type: 'bar', editable: true,
    value: c.actor.system.attributes.hp.value + c.actor.system.attributes.hp.temp,
    max: c.actor.system.attributes.hp.effectiveMax });
  return c;
}

function rendered(c = member()) {
  const combat = encounter('test', [c]);
  combat.settings = { resource: 'attributes.hp.value' };
  const view = tracker(combat);
  const native = view.root.ownerDocument.createElement('div');
  native.className = 'token-resource';
  native.innerHTML = '<span title="Exact HP">100</span>';
  view.root.querySelector('li').append(native);
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(view.app, view.root);
  return { ...view, sidebar, native, combat, c };
}

for (const [pool, entry, hp, temp, attribute, amount, delta, bar] of [
  ['hp', '-5', 100, 15, 'attributes.hp', -5, true, true],
  ['hp', '-25', 95, 0, 'attributes.hp', -25, true, true],
  ['hp', '+3', 103, 20, 'attributes.hp', 3, true, true],
  ['hp', '+50', 120, 20, 'attributes.hp', 50, true, true],
  ['hp', '95', 95, 20, 'attributes.hp.value', 95, false, false],
  ['hp', '0', 0, 20, 'attributes.hp.value', 0, false, false],
  ['hp', '200', 120, 20, 'attributes.hp.value', 120, false, false],
  ['temp', '-5', 100, 15, 'attributes.hp', -5, true, true],
  ['temp', '-25', 95, 0, 'attributes.hp', -25, true, true],
  ['temp', '10', 100, 10, 'attributes.hp.temp', 10, false, false],
  ['temp', '0', 100, 0, 'attributes.hp.temp', 0, false, false],
  ['temp', '200', 100, 200, 'attributes.hp.temp', 200, false, false],
]) {
  test(`${pool} ${entry} uses the correct D&D API and pool semantics`, async () => {
    const c = member();
    await applyHealthOperation(getHealthData(c), pool, parseHealthOperation(entry, true));
    assert.deepEqual(c.actor.apiCalls, [{ attribute, value: amount, isDelta: delta, isBar: bar }]);
    assert.equal(c.actor.system.attributes.hp.value, hp);
    assert.equal(c.actor.system.attributes.hp.temp, temp);
    assert.equal(c.actor.updates.length, 1);
  });
}

test('Temp addition supplies the new total to the non-stacking system grant API', async () => {
  const c = member();
  await applyHealthOperation(getHealthData(c), 'temp', parseHealthOperation('+3', true));
  assert.deepEqual(c.actor.damageCalls, [{ damage: [{ type: 'temphp', value: 23 }], options: { ignore: true } }]);
  assert.equal(c.actor.apiCalls.length, 0);
  assert.equal(c.actor.system.attributes.hp.value, 100);
  assert.equal(c.actor.system.attributes.hp.temp, 23);
});

test('negative Temp with an empty pool is damage, while signed zero is a no-op', async () => {
  const c = member('a', { temp: 0 });
  await applyHealthOperation(getHealthData(c), 'temp', parseHealthOperation('-5', true));
  assert.equal(c.actor.system.attributes.hp.value, 95);
  assert.equal(c.actor.system.attributes.hp.temp, 0);
  for (const entry of ['+0', '-0']) await applyHealthOperation(getHealthData(c), 'hp', parseHealthOperation(entry, true));
  assert.equal(c.actor.updates.length, 1);
});

test('D&D rejects fractions, malformed values and unsafe integers before any update', () => {
  for (const input of ['', ' ', '1.5', '-.5', '2.0', '1e2', 'NaN', 'Infinity', '--2', '9007199254740992']) {
    assert.equal(parseHealthOperation(input, true), null, input);
  }
  assert.deepEqual(parseHealthOperation(' +3 ', true), { delta: true, amount: 3 });
});

test('D&D pools use prepared values, including modified/zero maxima without a token bar', async () => {
  const c = member('a', { value: 80, tempmax: -20 });
  assert.equal(getHealthData(c).current, 80);
  assert.equal(getHealthData(c).temp, 20);
  assert.equal(getHealthData(c).max, 100);
  c.token = null;
  assert.equal(getHealthData(c).max, 100);
  c.actor.system._source.attributes.hp.tempmax = 20;
  c.actor.prepareHealth();
  assert.equal(getHealthData(c).max, 140);
  c.actor.system._source.attributes.hp.tempmax = -120;
  c.actor.prepareHealth();
  assert.equal(getHealthData(c).max, 0);
  assert.equal(getHealthData(c).displayHealth, false);
  await applyHealthOperation(getHealthData(c), 'hp', parseHealthOperation('100', true));
  assert.equal(c.actor.system._source.attributes.hp.value, 0);
  assert.equal(c.actor.system.attributes.hp.temp, 20);
});

test('an absolute correction fixes an over-maximum source without touching Temp', async () => {
  const c = member('a', { value: 140, tempmax: -20 });
  assert.equal(c.actor.system.attributes.hp.value, 100);
  await applyHealthOperation(getHealthData(c), 'hp', parseHealthOperation('100', true));
  assert.equal(c.actor.system._source.attributes.hp.value, 100);
  assert.equal(c.actor.system.attributes.hp.temp, 20);
});

test('custom resources stay generic; Bar Brawl cannot replace D&D pool values or override its veto', () => {
  const c = member();
  game.modules.set('barbrawl', { active: true });
  globalThis.BarBrawlApi = { getBar: () => ({}), getActualBarValue: () => ({ value: 120, max: 999 }), isBarVisible: () => false };
  assert.equal(getHealthData(c).current, 100);
  assert.equal(getHealthData(c).max, 120);
  assert.equal(getHealthData(c).displayHealth, false);
  BarBrawlApi.getBar = () => ({ attribute: 'wounds' });
  c.actor.system.wounds = { value: 3.5, max: 10 };
  assert.equal(getHealthData(c).dnd5e, false);
  assert.equal(getHealthData(c).path, 'system.wounds.value');
  assert.equal(getHealthData(c).value, 3.5);
});

test('missing system APIs fail closed; cancelled damage produces no fallback update', async () => {
  const c = member();
  c.actor.cancelDamage = true;
  await applyHealthOperation(getHealthData(c), 'temp', parseHealthOperation('-25', true));
  assert.equal(c.actor.updates.length, 0);
  delete c.actor.applyDamage;
  assert.equal(getHealthData(c).editable, false);
  await applyHealthOperation(getHealthData(c), 'hp', parseHealthOperation('-5', true));
  assert.equal(c.actor.updates.length, 0);
});

for (const [gm, owner, observer, disposition, editable, readonly] of [
  [true, false, false, -1, 2, 0], [false, true, false, -1, 2, 0],
  [false, false, true, 1, 0, 2], [false, false, false, 1, 0, 0],
  [false, false, true, -1, 0, 0], [false, false, true, 0, 0, 0],
]) {
  test(`numeric visibility: GM=${gm}, owner=${owner}, Observer=${observer}, disposition=${disposition}`, () => {
    const c = member();
    game.user.isGM = gm; c.actor.isOwner = owner; c.actor.observer = observer; c.token.disposition = disposition;
    env.settings.set('showHpForType', '*');
    const { root } = rendered(c);
    assert.equal(root.querySelectorAll('.te-health-input').length, editable);
    assert.equal(root.querySelectorAll('.te-health-value').length, readonly);
    assert.equal(root.querySelectorAll('.token-resource').length, 0);
    assert.equal(root.querySelectorAll('.te-health-arcs').length, 1);
    if (!editable && !readonly) assert.equal(root.querySelectorAll('[title], .te-health-fields').length, 0);
  });
}

test('native HP/Temp duplicates are reversible and unrelated equal-valued resources survive', () => {
  const { root, app, sidebar, native, combat } = rendered();
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelectorAll('.te-health-input').length, 2);
  assert.equal(root.querySelectorAll('.token-resource').length, 0);
  combat.settings.resource = 'system.attributes.hp.temp';
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelectorAll('.token-resource').length, 0);
  combat.settings.resource = 'attributes.ac.value';
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelector('.token-resource'), native);
  combat.settings.resource = 'attributes.hp.value';
  env.settings.set('enableHpField', false);
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelector('.token-resource'), native);
  assert.equal(root.querySelectorAll('.te-health-fields').length, 0);
});

test('arcs have the agreed width, side/direction, permanent gaps and independent fractions', () => {
  const { root, app, sidebar, c } = rendered();
  const hp = root.querySelector('.te-hp-arc'), temp = root.querySelector('.te-temp-arc');
  assert.equal(hp.getAttribute('stroke-width'), '3.5');
  assert.equal(temp.getAttribute('stroke-width'), '3.5');
  assert.match(hp.getAttribute('d'), /A 20.5 20.5 0 0 1 /);
  assert.match(temp.getAttribute('d'), /A 20.5 20.5 0 0 0 /);
  assert.ok(Math.abs(parseFloat(hp.getAttribute('stroke-dasharray')) - 100 / 120 * 100) < 1e-9);
  assert.ok(Math.abs(parseFloat(temp.getAttribute('stroke-dasharray')) - 20 / 120 * 100) < 1e-9);
  Object.assign(c.actor.system._source.attributes.hp, { value: 0, temp: 300 }); c.actor.prepareHealth();
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelector('.te-hp-arc').getAttribute('stroke-dasharray'), '0 100');
  assert.equal(root.querySelector('.te-temp-arc').getAttribute('stroke-dasharray'), '100 100');
  assert.equal(root.querySelector('.te-modify-temp').value, '300');
});

test('a pending edit locks linked rows and pop-outs, survives rerenders, and saves once', async () => {
  const { root, app, sidebar, c, combat } = rendered();
  const second = tracker(combat);
  sidebar.renderTracker(second.app, second.root);
  let release, started;
  const reached = new Promise(resolve => { started = resolve; });
  c.actor.beforeDamage = () => new Promise(resolve => { release = resolve; started(); });
  const input = root.querySelector('.te-modify-temp');
  input.value = '-25';
  const saving = sidebar.updateHp(app, input);
  assert.equal(second.root.querySelector('.te-modify-hp').disabled, true);
  sidebar.renderTracker(app, root);
  await reached;
  assert.equal(root.querySelector('.te-modify-temp').disabled, true);
  await sidebar.updateHp(app, root.querySelector('.te-modify-temp'));
  release(); await saving;
  assert.equal(c.actor.updates.length, 1);
  assert.equal(c.actor.system.attributes.hp.value, 95);
  assert.equal(second.root.querySelector('.te-modify-hp').disabled, false);
});

test('editing rechecks current max, permission and encounter before invoking the API', async () => {
  const { root, app, sidebar, c } = rendered();
  const input = root.querySelector('.te-modify-hp');
  input.value = '200';
  c.actor.system._source.attributes.hp.tempmax = -20; c.actor.prepareHealth();
  await sidebar.updateHp(app, input);
  assert.equal(c.actor.system._source.attributes.hp.value, 100);
  input.value = '-5';
  const pending = sidebar.updateHp(app, input);
  game.user.isGM = false; c.actor.isOwner = false;
  await pending;
  assert.equal(c.actor.damageCalls.length, 0);
  game.user.isGM = true;
  app.viewed = encounter('different', [c]);
  await sidebar.updateHp(app, input);
  assert.equal(c.actor.damageCalls.length, 0);
});

test('uncommitted drafts survive unrelated rerenders and are discarded on encounter change', () => {
  const { root, app, sidebar, dom } = rendered();
  let input = root.querySelector('.te-modify-temp');
  input.focus(); input.value = '-25'; input.setSelectionRange(3, 3);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  sidebar.renderTracker(app, root);
  input = root.querySelector('.te-modify-temp');
  assert.equal(input.value, '-25');
  assert.equal(dom.window.document.activeElement, input);
  assert.equal(input.selectionStart, 3);
  app.viewed = encounter('different', [member()]);
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelector('.te-modify-temp').value, '20');
});

test('item and effect changes coalesce and refresh every open tracker, including synthetic actors', async () => {
  const { sidebar, c, app, combat } = rendered();
  c.actor.uuid = 'Scene.scene.Token.token.Actor.actor';
  const second = tracker(combat);
  sidebar.renderTracker(second.app, second.root); sidebar.startup();
  const item = { documentName: 'Item', parent: c.actor };
  for (const action of ['create', 'update', 'delete']) {
    await env.emit(`${action}ActiveEffect`, { parent: item });
    await env.emit(`${action}Item`, item);
  }
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(app.renders, 1); assert.equal(second.app.renders, 1);
  assert.equal(c.actor.updates.length, 0);
});
