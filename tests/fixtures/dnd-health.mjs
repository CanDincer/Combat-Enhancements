/**
 * Minimal public-API contract double, based on D&D 6.0.5 actor.mjs and
 * templates/attributes.mjs. Not a replacement for testing the licensed system.
 * It deliberately gives absolute bar values D&D's combined HP+Temp semantics.
 */
export function dndHealthActor(actor, { value = 100, max = 120, temp = 20, tempmax = 0 } = {}) {
  const source = { value, max, temp, tempmax };
  actor.system._source = { attributes: { hp: source } };
  actor.apiCalls = [];
  actor.damageCalls = [];
  actor.cancelDamage = false;
  actor.prepareHealth = function() {
    const effectiveMax = Math.max(0, source.max + source.tempmax);
    const value = Math.min(source.value, effectiveMax);
    this.system.attributes.hp = { ...source, value, effectiveMax, damage: effectiveMax - value };
  };
  actor.prepareHealth();
  actor.update = async function(data) {
    this.updates.push(data);
    for (const [path, value] of Object.entries(data)) source[path.split('.').at(-1)] = value;
    this.prepareHealth();
    this.afterUpdate?.();
    return this;
  };
  actor.modifyTokenAttribute = async function(attribute, value, isDelta, isBar) {
    this.apiCalls.push({ attribute, value, isDelta, isBar });
    const hp = this.system.attributes.hp;
    if (attribute === 'attributes.hp') return this.applyDamage(isDelta ? -value : hp.value + hp.temp - value, { isDelta });
    const current = attribute.endsWith('.temp') ? hp.temp : hp.value;
    return this.update({ [`system.${attribute}`]: isDelta ? current + value : value });
  };
  actor.applyDamage = async function(damage, options = {}) {
    this.damageCalls.push({ damage, options });
    await this.beforeDamage?.();
    if (this.cancelDamage) return this;
    const hp = this.system.attributes.hp;
    if (Array.isArray(damage)) {
      const grant = damage.filter(d => d.type === 'temphp').reduce((sum, d) => sum + d.value, 0);
      return this.update({ 'system.attributes.hp.temp': Math.max(hp.temp, grant) });
    }
    const absorbed = damage > 0 ? Math.min(hp.temp, damage) : 0;
    return this.update({
      'system.attributes.hp.temp': hp.temp - absorbed,
      'system.attributes.hp.value': Math.min(hp.effectiveMax, Math.max(0, hp.value - damage + absorbed)),
    });
  };
  return actor;
}
