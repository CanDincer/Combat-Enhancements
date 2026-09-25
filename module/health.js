const MODULE_ID = 'tracker-enhancements';

export function normalizeResourcePath(path) {
  return typeof path === 'string' ? path.replace(/^system\./, '') : '';
}

/** Resolve a fresh view model without adding properties to Foundry Documents. */
export function getHealthData(combatant) {
  const actor = combatant?.actor;
  if (!actor) return null;
  const token = combatant.token;
  const getProperty = foundry.utils.getProperty;
  const owner = game.user.isGM || actor.isOwner;
  const modes = CONST.TOKEN_DISPLAY_MODES;
  const alwaysOnType = game.settings.get(MODULE_ID, 'showHpForType');
  const mode = token?.displayBars ?? modes.NONE;
  const publicBar = [modes.ALWAYS, modes.CONTROL, modes.HOVER].includes(mode);
  const ownerBar = [modes.OWNER, modes.OWNER_HOVER].includes(mode) && owner;
  // '*' includes every combatant type; names such as 'encounter' remain literal actor types.
  let visible = game.user.isGM || publicBar || ownerBar || alwaysOnType === '*'
    || (alwaysOnType && actor.type === alwaysOnType);

  // Bar 1 overrides the conventional HP resource, including at zero HP.
  let attribute = token?.bar1?.attribute || 'attributes.hp';
  const barApi = game.modules.get('barbrawl')?.active ? globalThis.BarBrawlApi : null;
  const customBar = token && barApi?.getBar?.(token, 'bar1');
  if (customBar?.attribute) attribute = customBar.attribute;
  attribute = normalizeResourcePath(attribute);
  const dnd5e = game.system?.id === 'dnd5e' && Number.parseInt(game.system.version, 10) >= 6
    && ['attributes.hp', 'attributes.hp.value'].includes(attribute);
  const raw = getProperty(actor.system, attribute);
  let value = typeof raw === 'number' ? raw : raw?.value;
  const path = `system.${attribute}${typeof raw === 'number' ? '' : '.value'}`;
  const resource = token?.getBarAttribute?.('bar1', { alternative: attribute });
  let current = resource?.type === 'bar' ? resource.value : raw?.value;
  let max = resource?.type === 'bar' ? resource.max : raw?.max;

  if (customBar) {
    const actual = barApi.getActualBarValue?.(token, customBar);
    if (actual) ({ value: current, max } = actual);
    if (barApi.isBarVisible) {
      // A token in another scene has no canvas object to pass to Bar Brawl.
      visible = visible && (token.object
        ? barApi.isBarVisible(token.object, customBar, true) : game.user.isGM);
    }
  }

  const hp = dnd5e ? actor.system.attributes?.hp : null;
  const temp = hp?.temp;
  if (dnd5e) {
    // D&D's token bar adds Temp to HP. Neither Bar Brawl nor that combined value
    // may replace the independent pools or the system's prepared maximum.
    value = current = hp?.value;
    max = hp?.effectiveMax;
  }
  const canUpdate = game.user.isGM || (actor.canUserModify?.(game.user, 'update') ?? actor.isOwner);
  const observer = actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2);
  const readable = Boolean(owner || canUpdate
    || (token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY && observer));
  const fieldsEnabled = Boolean(game.settings.get(MODULE_ID, 'enableHpField'));
  const supported = !dnd5e || (Number.isSafeInteger(value) && value >= 0
    && Number.isSafeInteger(temp) && temp >= 0 && Number.isSafeInteger(max) && max >= 0
    && typeof actor.modifyTokenAttribute === 'function' && typeof actor.applyDamage === 'function');
  return {
    actor, path, attribute, value, current, max, temp, dnd5e, fieldsEnabled, readable,
    showFields: Boolean(fieldsEnabled && readable && Number.isFinite(value)),
    editable: Boolean(fieldsEnabled && supported && canUpdate
      && Number.isFinite(value) && resource?.editable !== false),
    displayHealth: Boolean(game.settings.get(MODULE_ID, 'enableHpRadial') && visible
      && Number.isFinite(current) && Number.isFinite(max) && max > 0),
  };
}

/** Identify matching native tracked resources by path, never by coincident values. */
export function managesTrackedResource(health, path) {
  if (!health?.fieldsEnabled || !Number.isFinite(health.value)) return false;
  const tracked = normalizeResourcePath(path);
  return health.dnd5e ? ['attributes.hp', 'attributes.hp.value', 'attributes.hp.temp'].includes(tracked)
    : tracked === normalizeResourcePath(health.path);
}

/** Keep the operation's sign: Temp damage cannot be inferred from a resulting pool value. */
export function parseHealthOperation(text, wholeNumbers = false) {
  const input = String(text).trim();
  const pattern = wholeNumbers ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!pattern.test(input)) return null;
  const amount = Number(input);
  if (!Number.isFinite(amount) || (wholeNumbers && !Number.isSafeInteger(amount))) return null;
  return { delta: /^[+-]/.test(input), amount };
}

/** Apply exactly one operation through the selected system; cancellation never triggers a fallback. */
export async function applyHealthOperation(health, pool, operation) {
  if (!health?.editable || !['hp', 'temp'].includes(pool) || (pool === 'temp' && !health.dnd5e)) return;
  const { actor, dnd5e } = health;
  const { amount, delta } = operation;
  if (!Number.isFinite(amount) || (dnd5e && !Number.isSafeInteger(amount))) throw new Error('Invalid health amount');
  if (delta && amount === 0) return;
  if (!dnd5e) {
    const value = delta ? health.value + amount : amount;
    if (!Number.isFinite(value)) throw new Error('Invalid resource total');
    if (value !== health.value) await actor.update({ [health.path]: value });
    return;
  }
  if (delta && (pool === 'hp' || amount < 0)) {
    // A negative entry in EITHER field deals full damage, including at zero Temp.
    await actor.modifyTokenAttribute('attributes.hp', amount, true, true);
  } else if (delta) {
    const total = health.temp + amount;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid temporary HP total');
    // D&D grants keep the higher Temp pool; supply the desired new total for +N.
    await actor.applyDamage([{ type: 'temphp', value: total }], { ignore: true });
  } else {
    if (amount < 0) throw new Error('Invalid absolute health amount');
    const field = pool === 'hp' ? 'value' : 'temp';
    const value = pool === 'hp' ? Math.min(amount, health.max) : amount;
    const source = actor.system._source?.attributes?.hp?.[field];
    if (value === (pool === 'hp' ? health.value : health.temp) && (source === undefined || source === value)) return;
    // The absolute HP BAR API means combined HP+Temp; use the scalar route to
    // correct just one pool while retaining core hooks and D&D's update lifecycle.
    await actor.modifyTokenAttribute(`attributes.hp.${field}`, value, false, false);
  }
}

/** Absolute decimal values or a signed delta; never submit NaN/Infinity or blank text. */
export function parseHpInput(text, current) {
  const operation = parseHealthOperation(text);
  if (!operation) return null;
  const result = operation.delta ? current + operation.amount : operation.amount;
  return Number.isFinite(current) && Number.isFinite(result) ? result : null;
}
