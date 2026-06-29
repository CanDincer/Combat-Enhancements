# Combat Enhancements

![Foundry v14](https://img.shields.io/badge/foundry-v14-green)

This small module adds a radial health bar, an editable HP field, and drag/drop re-ordering to the combat tracker.

Compatible with Foundry VTT 10 through 14.

## Installation

Install using the module browser in Foundry or via this manifest URL: [https://raw.githubusercontent.com/CanDincer/Combat-Enhancements/refs/heads/main/module.json](https://raw.githubusercontent.com/CanDincer/Combat-Enhancements/refs/heads/main/module.json)
## Usage

### Radial Health Bars

The radial health bars will appear automatically if you're a GM user. For players, the health bar will only appear if the user is either the owner of the combatant's token or if the token's bar visibility is set to something other than one of the "owner" options.

The module will attempt to use the `system.attributes.hp` field on the actor, but this can be overridden by changing the attribute associated with Bar 1 in the token settings.

### Health Modification

For GM users, all combatants will have an HP input that lets them modify it using absolute numbers or relative numbers (such as `-10` or `+3`).

Players will only be able to edit HP if they own the combatant's token.

### Drag/drop Re-ordering

The module also includes the ability to rearrange combatants by dragging and dropping them. This is handled by setting the combatant being dragged to a new initiative that's the average of the two combatants it's landing in-between. This means that if you're using dexterity tie-breakers, the tiebreaker will become a number much higher than possible dexterity scores due to the average math.

If you're not using dexterity tie breakers, the module includes an optional setting to reflow combatant initiative if the combatants have identical initiative. For example, if you drop a combatant on top of another combatant that has an initiative of 18 and the combatant after that one has an 18 as well, the combatants will have new initiatives equal to 20, 19, and 18. If this setting isn't enabled, the combatants won't appear to change since the order is initiative followed by the alphabetical name.

### End of Turn Target Removal

When enabled, this will remove all targets from all tokens when the turn/round is updated in the combat tracker. Going backwards, forwards, and ending combat will cause all targets to be removed from all tokens. This is system agnostic. Enabling will cause a refresh of all connected clients.

#### ***Note! This is in direct conflict with other target removal modules like Midi-QoL. For this reason it is off by default.***
