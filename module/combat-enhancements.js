import { CombatSidebarCe } from './combat.js';
import { CeUtility } from './utility.js';

Hooks.once('init', async function() {
  CeUtility.registerHelpers();

  // TODO: Determine a good way to localize this.
  let types = Object.keys(game.system.documentTypes.Actor);
  let choices = {
    '': '—'
  };
  for (let type of types) {
    choices[type] = type;
  }

  game.settings.register('combat-enhancements', 'showHpForType', {
    name: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.showHpForType.label'),
    scope: 'world',
    config: true,
    default: null,
    type: String,
    choices: choices,
  });

  game.settings.register('combat-enhancements', 'enableInitReflow', {
    name: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.reflow.label'),
    hint: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.reflow.description'),
    scope: 'world',
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register('combat-enhancements', 'enableHpField', {
    name: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.enableHpField.label'),
    hint: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.enableHpField.description'),
    scope: 'world',
    config: true,
    default: true,
    type: Boolean,
  });

  game.settings.register('combat-enhancements', 'enableHpRadial', {
    name: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.enableHpRadial.label'),
    hint: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.enableHpRadial.description'),
    scope: 'world',
    config: true,
    default: true,
    type: Boolean,
  });

  game.settings.register('combat-enhancements', 'removeTargets', {
    name: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.removeTargets.label'),
    hint: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.removeTargets.description'),
    scope: 'world',
    config: true,
    default: false,
    type: Boolean,
    onChange: () => location.reload(),
  });

  game.settings.register('combat-enhancements', 'hideNonAllyInitiative', {
    name: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.hideNonAllyInitiative.label'),
    hint: game.i18n.localize('COMBAT_ENHANCEMENTS.setting.hideNonAllyInitiative.description'),
    scope: 'world',
    config: true,
    default: false,
    type: Boolean,
  });

  let combatSidebar = new CombatSidebarCe();
  combatSidebar.startup();
});
