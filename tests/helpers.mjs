import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

export class Collection extends Map {
  some(fn) { return Array.from(this.values()).some(fn); }
  find(fn) { return Array.from(this.values()).find(fn); }
}

export function environment() {
  const settings = new Map(Object.entries({ enableHpField: true, enableHpRadial: true,
    showHpForType: '', enableInitReflow: false, removeTargets: false, hideNonAllyInitiative: false }));
  const registrations = new Map();
  const hooks = new Map();
  globalThis.Hooks = {
    on(name, fn) { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn); },
    once(name, fn) { this.on(name, fn); },
  };
  globalThis.foundry = { utils: {
    getProperty(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); },
  } };
  globalThis.CONST = {
    TOKEN_DISPLAY_MODES: { NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50 },
    TOKEN_DISPOSITIONS: { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
    DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
  };
  globalThis.game = {
    user: { isGM: true, targets: new Set(), viewedScene: 'scene' },
    modules: new Map(), combat: null,
    system: { documentTypes: { Actor: ['character', 'npc'] } },
    settings: {
      get(namespace, key) {
        assert.equal(namespace, 'tracker-enhancements');
        return settings.get(key);
      },
      register(namespace, key, options) {
        assert.equal(namespace, 'tracker-enhancements');
        registrations.set(key, options);
      },
    },
    i18n: { localize(key) { return key === 'TRACKER_ENHANCEMENTS.hp.label' ? 'HP' : key; } },
  };
  globalThis.CONFIG = { Actor: {} };
  const warnings = [], errors = [];
  globalThis.ui = { notifications: { warn(message) { warnings.push(message); }, error(message) { errors.push(message); } } };
  delete globalThis.BarBrawlApi;
  delete globalThis.getProperty;
  delete globalThis.$;
  delete globalThis.Handlebars;
  return { settings, registrations, warnings, errors, hooks,
    async emit(name, ...args) { for (const fn of hooks.get(name) ?? []) await fn(...args); } };
}

export function combatant(id, initiative = 10, { hp = 10, max = 20, owner = false, token = true, resource } = {}) {
  const actor = {
    id: `actor-${id}`, uuid: `Actor.${id}`, documentName: 'Actor', type: 'npc', isOwner: owner,
    observer: false,
    testUserPermission() { return this.isOwner || this.observer; },
    system: { attributes: { hp: { value: hp, max } } }, updates: [],
    async update(data) {
      this.updates.push(data);
      for (const [path, value] of Object.entries(data)) {
        const keys = path.split('.');
        const field = keys.pop();
        foundry.utils.getProperty(this, keys.join('.'))[field] = value;
      }
      return this;
    },
  };
  return {
    id, name: id, initiative, actor, isOwner: owner,
    token: token ? {
      id: `token-${id}`, uuid: `Scene.scene.Token.${id}`, disposition: -1,
      displayBars: CONST.TOKEN_DISPLAY_MODES.NONE, bar1: { attribute: '' }, object: {},
      getBarAttribute(bar, { alternative }) {
        if (resource) return resource;
        const value = foundry.utils.getProperty(actor.system, alternative);
        return value && typeof value === 'object' ? { type: 'bar', ...value, editable: true }
          : typeof value === 'number' ? { type: 'value', value, editable: true } : null;
      },
    } : null,
  };
}

export function encounter(id, combatants, turn = 0) {
  const combat = {
    id, active: true, scene: { id: 'scene' }, turn, round: 1, updates: [], turnUpdates: [],
    combatants: new Collection(combatants.map(c => [c.id, c])), turns: [...combatants],
    get combatant() { return this.turns[this.turn]; },
    async updateEmbeddedDocuments(type, updates, options) {
      this.updates.push({ type, updates, options });
      for (const update of updates) this.combatants.get(update._id).initiative = update.initiative;
      this.turns = Array.from(this.combatants.values()).sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id));
    },
    async update(data, options) { this.turnUpdates.push({ data, options }); Object.assign(this, data); },
  };
  combatants.forEach(c => { c.parent = combat; });
  return combat;
}

export function tracker(combat, legacy = false) {
  const dom = new JSDOM(`<body><section class="combat-tracker"><ol>${combat.turns.map(c => `
    <li class="${legacy ? 'directory-item' : 'combatant'}" data-combatant-id="${c.id}">
      <img class="token-image" alt="portrait" data-action="pingCombatant">
      <div class="token-name"><h4>${c.id}</h4><div class="combatant-controls"><button data-action="toggleHidden">Hide</button></div></div>
      <div class="token-initiative"><input name="initiative" value="${c.initiative}"></div>
    </li>`).join('')}</ol></section></body>`);
  const root = dom.window.document.querySelector('section');
  root.querySelectorAll('li').forEach(row => { row.getBoundingClientRect = () => ({ top: 10, height: 60 }); });
  const app = { viewed: combat, rendered: true, renders: 0, render() { this.renders++; } };
  return { dom, root, app };
}

export function transfer(data) {
  const values = new Map();
  const result = {
    get types() { return [...values.keys()]; },
    setData(type, value) { values.set(type, value); },
    getData(type) { return values.get(type) ?? ''; },
    setDragImage() {},
  };
  if (data) result.setData('application/x-tracker-enhancements', JSON.stringify(data));
  return result;
}

export function dragEvent(target, dataTransfer, clientY = 60) {
  return { target, dataTransfer, clientY, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}
