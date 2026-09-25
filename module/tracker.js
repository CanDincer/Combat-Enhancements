import { TrackerUtility } from './utility.js';
import { getHealthData, parseHealthOperation, applyHealthOperation, managesTrackedResource } from './health.js';
import { planInitiativeMove } from './initiative.js';
import { shouldClearTargets, untargetAllTokens } from './removeTarget.js';

const MODULE_ID = 'tracker-enhancements';
const ROW = '.combatant[data-combatant-id], .directory-item[data-combatant-id]';
const DRAG_TYPE = 'application/x-tracker-enhancements';
const INPUT = '.te-health-input';

/** Augment the existing tracker while preserving core and system controls. */
export class TrackerEnhancements {
  constructor() {
    this.apps = new Set();
    this.roots = new WeakMap();
    this.appRoots = new WeakMap();
    this.drafts = new WeakMap();
    this.nativeResources = new WeakMap();
    this.cancelledInputs = new WeakSet();
    this.pendingCombats = new Set();
    this.pendingActors = new Map();
    this.refreshPredicates = [];
    this.refreshTimer = null;
  }

  startup() {
    Hooks.on('renderCombatTracker', (app, html) => this.renderTracker(app, html));
    Hooks.on('closeCombatTracker', app => { this.apps.delete(app); this.drafts.delete(app); });
    Hooks.on('updateActor', actor => this.queueActorRefresh(actor));
    Hooks.on('updateToken', token => this.queueRefresh(c => c.token === token || (token.uuid && c.token?.uuid === token.uuid)));
    // Embedded changes can alter prepared maxima without an updateActor event.
    for (const type of ['ActiveEffect', 'Item']) {
      for (const action of ['create', 'update', 'delete']) {
        Hooks.on(`${action}${type}`, document => {
          let parent = document.parent;
          while (parent && parent.documentName !== 'Actor') parent = parent.parent;
          if (parent) this.queueActorRefresh(parent);
        });
      }
    }
    Hooks.on('updateCombat', (combat, changed, options) => {
      if (shouldClearTargets(combat, changed, options)) untargetAllTokens();
    });
    Hooks.on('deleteCombat', (combat, options) => {
      if (shouldClearTargets(combat, {}, options, true)) untargetAllTokens();
    });
  }

  getCombat(app) {
    // An explicitly empty tracker must not fall back to an unrelated active combat.
    return app && 'viewed' in app ? app.viewed : game.combat;
  }

  queueActorRefresh(actor) {
    this.queueRefresh(c => c.actor === actor || (actor.uuid && c.actor?.uuid === actor.uuid));
  }

  queueRefresh(predicate) {
    this.refreshPredicates.push(predicate);
    if (this.refreshTimer !== null) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      const predicates = this.refreshPredicates.splice(0);
      this.refreshTrackers(c => predicates.some(test => test(c)));
    }, 0);
  }

  refreshTrackers(predicate = () => true) {
    for (const app of this.apps) {
      const combat = this.getCombat(app);
      if (app.rendered && combat?.combatants.some(predicate)) app.render();
    }
  }

  actorKey(actor) { return actor.uuid ?? actor; }

  getDrafts(app) {
    if (!this.drafts.has(app)) this.drafts.set(app, new Map());
    return this.drafts.get(app);
  }

  inputKey(input) {
    return JSON.stringify([input.dataset.teCombatId, input.dataset.teCombatantId,
      input.dataset.teActorId, input.dataset.tePool, input.dataset.teHpPath]);
  }

  getInputHealth(app, input) {
    const combat = this.getCombat(app);
    if (input.dataset.teCombatId !== combat?.id) return null;
    // A render may detach the original input while its save waits in the queue.
    const health = getHealthData(combat?.combatants.get(input.dataset.teCombatantId));
    if (!health || input.dataset.teActorId !== (health.actor.uuid ?? health.actor.id ?? '')) return null;
    const pool = input.dataset.tePool;
    const path = pool === 'temp' && health.dnd5e ? 'system.attributes.hp.temp' : pool === 'hp' ? health.path : null;
    return input.dataset.teHpPath === path ? health : null;
  }

  restoreInput(input, health) {
    const value = input.dataset.tePool === 'temp' ? health?.temp : health?.value;
    input.value = health?.readable && Number.isFinite(value) ? value : '';
  }

  restoreNativeResources(row) {
    for (const { element, placeholder } of this.nativeResources.get(row) ?? []) {
      if (placeholder.parentNode) placeholder.replaceWith(element);
    }
    this.nativeResources.delete(row);
  }

  replaceNativeResources(row) {
    const saved = [];
    for (const element of row.querySelectorAll('.token-resource')) {
      if (element.closest(ROW) !== row) continue;
      // Keep native nodes off-DOM, including enemy values and their tooltips.
      // A placeholder lets settings/resource changes restore the exact control.
      const placeholder = row.ownerDocument.createComment('tracker-enhancements resource');
      element.replaceWith(placeholder);
      saved.push({ element, placeholder });
    }
    this.nativeResources.set(row, saved);
  }

  renderTracker(app, html) {
    // V12 passes jQuery; V13/V14 pass a native element, possibly in another window.
    const root = html?.nodeType === 1 ? html : html?.[0];
    if (!root?.querySelectorAll) return;
    this.apps.add(app);
    this.appRoots.set(app, root);
    this.bindListeners(root, app);
    const combat = this.getCombat(app);
    const drafts = this.getDrafts(app), validDrafts = new Set();
    for (const row of root.querySelectorAll(ROW)) {
      this.restoreNativeResources(row);
      row.querySelectorAll('.te-health-fields, .te-modify-hp-wrapper, .te-drop-indicator, .te-image-wrapper > .progress-ring')
        .forEach(element => element.remove());
      row.querySelectorAll('.te-image-wrapper').forEach(wrapper => wrapper.replaceWith(...wrapper.childNodes));
      if (row.dataset.teDraggable !== undefined) {
        if (row.dataset.teDraggable === 'unset') row.removeAttribute('draggable');
        else row.setAttribute('draggable', row.dataset.teDraggable);
        delete row.dataset.teDraggable;
      }
      row.classList.remove('te-combatant', 'te-hide-initiative', 'te-drop-before', 'te-drop-after');
      const combatant = combat?.combatants.get(row.dataset.combatantId);
      if (!combatant || row.classList.contains('combatant-group')) continue;
      row.classList.add('te-combatant');
      const health = getHealthData(combatant);
      const doc = root.ownerDocument;
      const image = row.querySelector('.token-image');
      if (health?.displayHealth && image) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'te-image-wrapper';
        image.before(wrapper);
        wrapper.append(image);
        wrapper.insertAdjacentHTML('beforeend', health.dnd5e ? TrackerUtility.getHealthArcsHtml(health)
          : TrackerUtility.getProgressCircleHtml(TrackerUtility.getProgressCircle(health)));
      }
      if (managesTrackedResource(health, combat.settings?.resource)) this.replaceNativeResources(row);
      if (health?.showFields) {
        const pair = doc.createElement('div');
        pair.className = 'te-health-fields';
        const pools = health.dnd5e && Number.isFinite(health.temp) ? ['hp', 'temp'] : ['hp'];
        const focus = [];
        for (const pool of pools) {
          const label = doc.createElement('label');
          label.className = 'te-modify-hp-wrapper';
          const name = game.i18n.localize(`TRACKER_ENHANCEMENTS.${pool}.label`);
          label.append(`${name} `);
          const value = pool === 'hp' ? health.value : health.temp;
          if (health.editable) {
            const input = doc.createElement('input');
            input.className = `te-health-input te-modify-${pool}`;
            input.type = 'text';
            input.autocomplete = 'off';
            input.spellcheck = false;
            // No name: keep these fields out of core/system form submissions.
            Object.assign(input.dataset, {
              tePool: pool, teCombatId: combat.id, teCombatantId: combatant.id,
              teActorId: health.actor.uuid ?? health.actor.id ?? '',
              teHpPath: pool === 'temp' ? 'system.attributes.hp.temp' : health.path,
            });
            input.setAttribute('aria-label', `${name}: ${combatant.name ?? ''}`);
            input.title = game.i18n.localize(`TRACKER_ENHANCEMENTS.${health.dnd5e ? pool : 'resource'}.help`);
            const key = this.inputKey(input);
            validDrafts.add(key);
            const draft = drafts.get(key);
            input.value = draft?.text ?? value;
            input.style.setProperty('--te-digits', Math.max(4, input.value.length + 1));
            input.disabled = this.pendingActors.has(this.actorKey(health.actor));
            label.append(input);
            if (draft?.focused && !input.disabled) focus.push({ input, draft });
          } else {
            const output = doc.createElement('span');
            output.className = 'te-health-value';
            output.dataset.tePool = pool;
            output.textContent = value;
            label.append(output);
          }
          pair.append(label);
        }
        (row.querySelector('.token-name') ?? row.querySelector('.combatant-controls') ?? row).append(pair);
        for (const { input, draft } of focus) {
          input.focus({ preventScroll: true });
          input.setSelectionRange(draft.start, draft.end);
        }
      }
      if (game.user.isGM) {
        row.dataset.teDraggable = row.getAttribute('draggable') ?? 'unset';
        row.draggable = true;
        const indicator = doc.createElement('span');
        indicator.className = 'te-drop-indicator';
        row.append(indicator);
      }
      row.classList.toggle('te-hide-initiative', Boolean(!game.user.isGM
        && game.settings.get(MODULE_ID, 'hideNonAllyInitiative')
        && combatant.token?.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY));
    }
    for (const key of drafts.keys()) if (!validDrafts.has(key)) drafts.delete(key);
  }

  bindListeners(root, app) {
    const existing = this.roots.get(root);
    if (existing) { existing.app = app; return; }
    const state = { app };
    this.roots.set(root, state);
    root.addEventListener('input', event => {
      const input = event.target.closest?.(INPUT);
      if (!input) return;
      event.stopPropagation();
      this.cancelledInputs.delete(input);
      input.style.setProperty('--te-digits', Math.max(4, input.value.length + 1));
      this.getDrafts(state.app).set(this.inputKey(input), { text: input.value,
        start: input.selectionStart, end: input.selectionEnd, focused: input.ownerDocument.activeElement === input });
    }, true);
    root.addEventListener('focusout', event => {
      const input = event.target.closest?.(INPUT);
      const draft = input && this.getDrafts(state.app).get(this.inputKey(input));
      // Chromium can blur/change a focused input while core replaces the DOM.
      // Keep that draft focused for its replacement; a real user blur stays connected.
      if (draft) queueMicrotask(() => {
        if (input.isConnected && root.contains(input)) draft.focused = false;
      });
    }, true);
    for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) {
      root.addEventListener(type, event => {
        if (!event.target.closest?.('.te-health-fields')) return;
        event.stopPropagation();
        const input = event.target.closest(INPUT);
        if (!input) return;
        if (type === 'click') input.select();
        if (type === 'keydown' && ['Enter', 'Escape'].includes(event.key)) {
          event.preventDefault();
          if (event.key === 'Escape') {
            this.cancelledInputs.add(input);
            this.getDrafts(state.app).delete(this.inputKey(input));
            this.restoreInput(input, this.getInputHealth(state.app, input));
          } else void this.updateHp(state.app, input);
          input.blur();
        }
      }, true);
    }
    root.addEventListener('change', event => {
      const input = event.target.closest?.(INPUT);
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.cancelledInputs.delete(input)) return;
      // A render-triggered change must not turn an unfinished '-25' draft into damage.
      queueMicrotask(() => {
        if (input.isConnected && root.contains(input)) void this.updateHp(state.app, input);
      });
    }, true);
    root.addEventListener('dragstart', event => this.onDragStart(state.app, event), true);
    root.addEventListener('dragover', event => this.onDragOver(root, event), true);
    root.addEventListener('dragleave', event => {
      const row = event.target.closest?.(ROW);
      if (row && !row.contains(event.relatedTarget)) row.classList.remove('te-drop-before', 'te-drop-after');
    });
    root.addEventListener('dragend', () => this.clearDropIndicators(root));
    root.addEventListener('drop', event => { void this.onDrop(state.app, root, event); }, true);
  }

  syncActorInputs(actor) {
    const key = this.actorKey(actor);
    for (const app of this.apps) {
      for (const input of this.appRoots.get(app)?.querySelectorAll(INPUT) ?? []) {
        const health = this.getInputHealth(app, input);
        if (health && this.actorKey(health.actor) === key) input.disabled = this.pendingActors.has(key);
      }
    }
  }

  async updateHp(app, input) {
    if (input.disabled) return;
    const health = this.getInputHealth(app, input);
    if (!health?.editable) { this.restoreInput(input, health); return; }
    const pool = input.dataset.tePool;
    const operation = parseHealthOperation(input.value, health.dnd5e);
    this.getDrafts(app).delete(this.inputKey(input));
    if (!operation) {
      this.cancelledInputs.add(input);
      this.restoreInput(input, health);
      ui.notifications.warn(game.i18n.localize(`TRACKER_ENHANCEMENTS.${health.dnd5e ? 'invalidDndHp' : 'invalidHp'}`));
      return;
    }
    const key = this.actorKey(health.actor);
    input.disabled = true;
    const previous = this.pendingActors.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      // Read current pools, maxima, permission, and resource again at execution time.
      const fresh = this.getInputHealth(app, input);
      if (!fresh?.editable || this.actorKey(fresh.actor) !== key) return;
      await applyHealthOperation(fresh, pool, operation);
    });
    this.pendingActors.set(key, pending);
    this.syncActorInputs(health.actor);
    try {
      await pending;
    } catch (error) {
      this.reportError(error);
    } finally {
      if (this.pendingActors.get(key) === pending) this.pendingActors.delete(key);
      this.restoreInput(input, this.getInputHealth(app, input));
      input.disabled = this.pendingActors.has(key);
      this.syncActorInputs(health.actor);
      this.queueActorRefresh(health.actor);
    }
  }

  onDragStart(app, event) {
    if (!game.user.isGM || !event.dataTransfer) return;
    const row = event.target.closest?.(ROW);
    const combat = this.getCombat(app);
    if (!combat?.combatants.get(row?.dataset.combatantId)) return;
    if (event.target.closest('input, button, a, select, textarea')) {
      event.preventDefault();
      return;
    }
    const data = { type: MODULE_ID, combatId: combat.id, combatantId: row.dataset.combatantId };
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
    event.dataTransfer.setData('text/plain', JSON.stringify(data));
    event.dataTransfer.effectAllowed = 'move';
    const image = row.querySelector('.te-image-wrapper, .token-image') ?? row;
    event.dataTransfer.setDragImage?.(image, 24, 24);
    event.stopPropagation();
  }

  clearDropIndicators(root) {
    root.querySelectorAll('.te-drop-before, .te-drop-after')
      .forEach(row => row.classList.remove('te-drop-before', 'te-drop-after'));
  }

  isOurDrag(event) {
    return game.user.isGM && Array.from(event.dataTransfer?.types ?? []).includes(DRAG_TYPE);
  }

  onDragOver(root, event) {
    if (!this.isOurDrag(event)) return;
    const row = event.target.closest?.(ROW);
    if (!row) return;
    // preventDefault is required on EVERY dragover, including over the row itself.
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    this.clearDropIndicators(root);
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'te-drop-before' : 'te-drop-after');
  }

  async onDrop(app, root, event) {
    this.clearDropIndicators(root);
    if (!this.isOurDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.target.closest?.(ROW);
    const combat = this.getCombat(app);
    if (!row || !combat || this.pendingCombats.has(combat.id)) return;
    let data;
    try { data = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)); }
    catch { return; }
    if (data?.type !== MODULE_ID || data.combatId !== combat.id) return;
    const rect = row.getBoundingClientRect();
    const result = planInitiativeMove(combat.turns, data.combatantId, row.dataset.combatantId,
      event.clientY < rect.top + rect.height / 2, game.settings.get(MODULE_ID, 'enableInitReflow'));
    if (result.error) {
      ui.notifications.warn(game.i18n.localize(`TRACKER_ENHANCEMENTS.${result.error}`));
      return;
    }
    if (!result.updates.length) return;
    this.pendingCombats.add(combat.id);
    const activeId = combat.combatant?.id;
    const options = { trackerEnhancementsReorder: true, turnEvents: false };
    try {
      await combat.updateEmbeddedDocuments('Combatant', result.updates, options);
      const turn = combat.turns.findIndex(c => c.id === activeId);
      if (activeId && turn >= 0 && turn !== combat.turn) await combat.update({ turn }, options);
      this.refreshTrackers(c => c.parent?.id === combat.id);
    } catch (error) {
      this.reportError(error);
    } finally {
      this.pendingCombats.delete(combat.id);
    }
  }

  reportError(error) {
    console.error('Tracker Enhancements | Update failed', error);
    ui.notifications.error(game.i18n.localize('TRACKER_ENHANCEMENTS.updateFailed'));
  }
}
