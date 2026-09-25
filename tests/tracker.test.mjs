import { beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TrackerEnhancements } from '../module/tracker.js';
import { environment, combatant, encounter, tracker, transfer, dragEvent } from './helpers.mjs';

let env;
beforeEach(() => { env = environment(); });

for (const legacy of [false, true]) {
  test(`render is idempotent for ${legacy ? 'legacy jQuery' : 'native V14'} tracker roots`, async () => {
    const sidebar = new TrackerEnhancements();
    const { root, app, dom } = tracker(encounter('viewed', [combatant('a')]), legacy);
    const html = legacy ? { 0: root } : root;
    sidebar.renderTracker(app, html);
    sidebar.renderTracker(app, html);
    for (const selector of ['.te-modify-hp', '.progress-ring', '.te-image-wrapper', '.te-drop-indicator']) {
      assert.equal(root.querySelectorAll(selector).length, 1);
    }
    assert.equal(root.querySelector('.token-image').dataset.action, 'pingCombatant');
    assert.equal(root.querySelector('.te-modify-hp').hasAttribute('name'), false);
    let saves = 0;
    sidebar.updateHp = async () => { saves++; };
    root.querySelector('.te-modify-hp').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();
    assert.equal(saves, 1);
    env.settings.set('enableHpField', false);
    env.settings.set('enableHpRadial', false);
    sidebar.renderTracker(app, html);
    assert.equal(root.querySelectorAll('.te-modify-hp, .progress-ring, .te-image-wrapper').length, 0);
    assert.equal(root.querySelector('.token-image').dataset.action, 'pingCombatant');
  });
}

test('HP edits use the viewed encounter and preserve core control events', async () => {
  const active = combatant('a', 10, { hp: 100 });
  game.combat = encounter('active', [active]);
  const viewed = combatant('a');
  const { root, app, dom } = tracker(encounter('viewed', [viewed]));
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(app, root);
  let coreChanges = 0, coreClicks = 0;
  root.addEventListener('change', () => { coreChanges++; });
  root.querySelector('li').addEventListener('click', () => { coreClicks++; });
  const input = root.querySelector('.te-modify-hp');
  input.value = '-3';
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(viewed.actor.system.attributes.hp.value, 7);
  assert.equal(active.actor.updates.length, 0);
  assert.equal(coreChanges, 0);
  input.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(coreClicks, 0);
  root.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(coreClicks, 1);
  root.querySelector('.token-initiative input').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(coreChanges, 1);
});

test('HP update rechecks ownership, resource path, and finite input', async () => {
  const member = combatant('a', 10, { owner: true });
  const { root, app } = tracker(encounter('viewed', [member]));
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(app, root);
  const input = root.querySelector('.te-modify-hp');
  input.value = '+3';
  game.user.isGM = false;
  member.actor.isOwner = false;
  await sidebar.updateHp(app, input);
  assert.equal(member.actor.updates.length, 0);
  member.actor.isOwner = true;
  input.dataset.teHpPath = 'system.other.value';
  await sidebar.updateHp(app, input);
  assert.equal(member.actor.updates.length, 0);
  input.dataset.teHpPath = 'system.attributes.hp.value';
  input.value = 'Infinity';
  await sidebar.updateHp(app, input);
  assert.equal(member.actor.updates.length, 0);
  assert.equal(input.value, '10');
  assert.equal(env.warnings.length, 1);
});

test('failed actor updates restore the field and report an error', async () => {
  const member = combatant('a');
  member.actor.update = async () => { throw new Error('Permission denied'); };
  const { root, app } = tracker(encounter('viewed', [member]));
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(app, root);
  const input = root.querySelector('.te-modify-hp');
  input.value = '+3';
  const log = mock.method(console, 'error', () => {});
  try {
    await sidebar.updateHp(app, input);
    assert.equal(input.value, '10');
    assert.equal(input.disabled, false);
    assert.equal(env.errors.length, 1);
  } finally { log.mock.restore(); }
});

test('separate windows use their own documents and empty trackers stay empty', () => {
  const combat = encounter('viewed', [combatant('a')]);
  game.combat = combat;
  const first = tracker(combat), second = tracker(combat);
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(first.app, first.root);
  sidebar.renderTracker(second.app, second.root);
  assert.equal(second.root.querySelector('.te-modify-hp').ownerDocument, second.dom.window.document);
  second.app.viewed = null;
  sidebar.renderTracker(second.app, second.root);
  assert.equal(second.root.querySelectorAll('.te-modify-hp, .progress-ring').length, 0);
  assert.equal(first.root.querySelectorAll('.te-modify-hp').length, 1);
});

test('hostile initiative hiding is reversible and safe without tokens', () => {
  const a = combatant('a'), b = combatant('b', 5, { token: false });
  const { root, app } = tracker(encounter('viewed', [a, b]));
  const sidebar = new TrackerEnhancements();
  game.user.isGM = false;
  env.settings.set('hideNonAllyInitiative', true);
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelectorAll('.te-hide-initiative').length, 2);
  a.token.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelectorAll('.te-hide-initiative').length, 1);
  env.settings.set('hideNonAllyInitiative', false);
  sidebar.renderTracker(app, root);
  assert.equal(root.querySelectorAll('.te-hide-initiative').length, 0);
  assert.equal(root.querySelectorAll('.token-initiative').length, 2);
});

test('row and portrait drags carry encounter identity and accept repeated dragover', () => {
  const { root, app } = tracker(encounter('viewed', [combatant('a')]));
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(app, root);
  const row = root.querySelector('li');
  for (const target of [row, row.querySelector('img')]) {
    const data = transfer();
    sidebar.onDragStart(app, dragEvent(target, data));
    assert.deepEqual(JSON.parse(data.getData('application/x-tracker-enhancements')), {
      type: 'tracker-enhancements', combatId: 'viewed', combatantId: 'a',
    });
    for (let i = 0; i < 2; i++) {
      const event = dragEvent(row, data);
      sidebar.onDragOver(root, event);
      assert.equal(event.prevented, true);
      assert.equal(row.classList.contains('te-drop-after'), true);
    }
  }
  const foreign = dragEvent(row, transfer());
  sidebar.onDragOver(root, foreign);
  assert.equal(foreign.prevented, false);
});

test('drops preserve the active combatant without triggering turn events', async () => {
  const combat = encounter('viewed', [combatant('a', 20), combatant('b', 10), combatant('c', 5)], 1);
  const { root, app } = tracker(combat);
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(app, root);
  const data = transfer({ type: 'tracker-enhancements', combatId: 'viewed', combatantId: 'c' });
  await sidebar.onDrop(app, root, dragEvent(root.querySelector('li'), data, 12));
  assert.deepEqual(combat.turns.map(c => c.id), ['c', 'a', 'b']);
  assert.equal(combat.combatant.id, 'b');
  assert.equal(combat.turn, 2);
  assert.deepEqual(combat.turnUpdates[0].options, { trackerEnhancementsReorder: true, turnEvents: false });
});

test('foreign, malformed, stale, and player drops make no changes', async () => {
  const combat = encounter('viewed', [combatant('a', 20), combatant('b', 10)]);
  const { root, app } = tracker(combat);
  const sidebar = new TrackerEnhancements();
  sidebar.renderTracker(app, root);
  const row = root.querySelector('li');
  for (const payload of [null,
    { type: 'tracker-enhancements', combatId: 'other', combatantId: 'b' },
    { type: 'tracker-enhancements', combatId: 'viewed', combatantId: 'gone' },
    { type: 'Actor', combatId: 'viewed', combatantId: 'b' }]) {
    await sidebar.onDrop(app, root, dragEvent(row, transfer(payload), 12));
  }
  const malformed = transfer();
  malformed.setData('application/x-tracker-enhancements', '{bad');
  await sidebar.onDrop(app, root, dragEvent(row, malformed, 12));
  game.user.isGM = false;
  await sidebar.onDrop(app, root, dragEvent(row, transfer({
    type: 'tracker-enhancements', combatId: 'viewed', combatantId: 'b',
  }), 12));
  assert.equal(combat.updates.length, 0);
});

test('actor and token updates refresh every open tracker and stop after close', async () => {
  const member = combatant('a');
  const combat = encounter('viewed', [member]);
  const first = tracker(combat), second = tracker(combat);
  const sidebar = new TrackerEnhancements();
  sidebar.startup();
  await env.emit('renderCombatTracker', first.app, first.root);
  await env.emit('renderCombatTracker', second.app, second.root);
  await env.emit('updateActor', member.actor);
  await env.emit('updateToken', member.token);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(first.app.renders, 1);
  assert.equal(second.app.renders, 1);
  await env.emit('closeCombatTracker', second.app);
  await env.emit('updateActor', member.actor);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(first.app.renders, 2);
  assert.equal(second.app.renders, 1);
});
