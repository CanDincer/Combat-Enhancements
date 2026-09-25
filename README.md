# Tracker Enhancements

Adds editable HP fields, health rings, and drag/drop initiative reordering to Foundry VTT's combat tracker. This fork carries compatibility repairs for the V14 tracker while retaining the V12/V13 render hook interface.

Version 1.5.0 adds D&D 6 health handling on Foundry 14.367 or newer. This branch is a test candidate awaiting live-world validation. The implementation has automated regression and browser coverage. A licensed Foundry world with your game system and other modules still needs the checks in [TESTING.md](TESTING.md).

English is the only maintained module language. The module ships and registers only `lang/en.json`, generated from `yaml/lang/en.yaml`.

## Installation

The published manifest is:

https://raw.githubusercontent.com/CanDincer/Tracker-Enhancements/main/module.json

That manifest downloads `tracker-enhancements.zip` from the release tagged `latest`. Merging source changes does not update that ZIP. Until 1.5.0 is released, install the PR branch archive or its GitHub Actions test artifact using the development instructions below.

To try a development branch before release, download its source archive, extract it, rename the module directory to `tracker-enhancements`, and place it under your Foundry user data directory's `Data/modules`. The installed directory must contain `module.json`, `module/`, `lang/`, and `styles/dist/`. Restart Foundry and enable Tracker Enhancements in the world. The repository includes generated runtime assets, so a source-archive install does not require Node.js.

### Moving from Combat Enhancements

The Foundry package ID is now `tracker-enhancements`. Foundry treats it as a separate module, so install it using the new manifest instead of updating the old package in place. In each world, disable **Combat Enhancements** and enable **Tracker Enhancements**, then log in as GM. Keep only Tracker Enhancements enabled.

The active GM automatically copies the six saved world settings from `combat-enhancements` when the world is ready. Existing Tracker Enhancements settings take priority, including explicit defaults. The old settings are retained, and unsuccessful copies are retried on the next GM login. Check your settings after switching; remove the old installation when you have confirmed the new module works in your worlds.

## Health display and editing

The module uses the token's Bar 1 resource, falling back to `system.attributes.hp` when no resource is configured. Both scalar values and `{value, max}` resources are supported for editing. A health ring needs a finite value and positive maximum; zero HP is valid.

GMs see health rings when enabled. **Player HP circle visibility** controls which rings players see:

| Choice | Player display |
| --- | --- |
| Use token visibility | Follow token Bar 1 visibility, including ownership requirements |
| All combatants | Show every valid HP circle in the viewed tracker, including the player's own character, other PCs, and NPCs |
| Actor type: Character / NPC / another type | Follow token visibility and additionally show actors of the selected type |

`encounter`, `group`, and `vehicle` can be literal actor types supplied by the game system. **Actor type: Encounter** only matches that type; choose **All combatants** to include everyone in combat. Labels use the system's translated type names when available; existing saved choices retain their meaning. Public hover/control bar modes display a ring in the tracker; owner-only modes require ownership.

All Tracker Enhancements settings are **world settings**, configured by the GM and shared by every player. In Monk's Player Settings, keep **View settings for Player** on your own GM account. Selecting another player or **All Players** hides these settings because that view filters out world settings; it does not change whom the settings affect. To show PCs and NPCs together, enable **Enable HP radial bar**, set **Player HP circle visibility** to **All combatants**, and save as GM.

When Bar Brawl supplies a visibility rule, that rule can still hide a ring, including in All combatants mode. A ring needs a valid HP resource and positive maximum, and the actor must be present in the player's tracker. Tokens without a canvas object are handled conservatively. Showing a ring does not grant permission to edit HP.

For **D&D 6**, each row has a single **HP / Temp** pair. GMs and users with actor update permission can edit it. Non-owners see read-only values only for **friendly** tokens with Observer-or-higher permission. Unowned hostile and neutral tokens have no numeric fields. Matching native HP/Temp values are replaced; unrelated tracked resources such as AC remain visible. Turning off the field enhancement restores the native display.

| Entry | HP field | Temp field |
| --- | --- | --- |
| `20` | Set regular HP to 20, retaining Temp | Set Temp to 20, retaining regular HP |
| `+3` | Heal 3 HP, up to the modified maximum | Add 3 to the current Temp pool |
| `-25` | Deal 25 damage, consuming Temp first | Deal the same 25 damage, consuming Temp first |
| `0` | Set regular HP to zero, retaining Temp | Clear Temp without damaging regular HP |

For example, starting at **100/120 HP + 20 Temp**, `-25` in either field leaves **95 HP + 0 Temp**. A negative Temp entry still damages HP when Temp is already zero. Manual damage is a final amount; D&D handles absorption and its normal damage/update hooks. Absolute assignments use the scalar attribute API to affect only the selected pool. Temp addition is a manual pool adjustment, not a change to D&D's non-stacking spell/item grants.

Enter or leaving the field saves; Escape cancels. D&D entries must be whole numbers; blank, malformed, and fractional input is rejected. Pending edits disable the actor's fields across open trackers to prevent duplicate local saves. Cancellation or failure restores current actor values and never bypasses the system API. Other game systems and custom Bar 1 resources retain generic numeric editing, including decimals.

D&D portraits show **two 3.5 px semicircles** at a 48 px portrait size: HP on the left, Temp on the right, both filling bottom to top. Each half uses D&D's effective maximum independently, including maximum-HP modifiers. Thus 100/120 HP plus 20 Temp fills 83.3% of the HP half and 16.7% of the Temp half. Zero Temp leaves its half empty. Temp above the maximum fills its half, while authorized fields retain the actual amount. A zero or invalid maximum suppresses the arcs; rendering never changes actor values.

Each tracker edits its own viewed encounter, including pop-outs and detached windows. Core portrait actions, initiative fields, and system controls remain available. Actor, token, item, and Active Effect changes refresh open trackers, including maximum-HP changes.

## Initiative reordering

GMs can drag a combatant's portrait or row. Drop on the top half of a row to insert before it, or on the bottom half to insert after it. Roll all initiatives first.

Ordinary moves assign a value between neighboring initiatives and preserve decimal tie breakers. If no numeric gap exists, enable initiative reflow to renumber the entire encounter in the requested order. Reflow replaces existing initiative values, including decimal tie breakers. Reordering preserves the active combatant and suppresses turn events.

For V14 combatants with shared group initiative, use the core or system group controls. Individual member drags and reflows that would overwrite shared group initiatives are rejected with an explanation. Custom turn orders that do not sort by descending initiative are also left to their system controls.

## Other settings

- **Hide non-ally initiative:** hides initiative controls for non-friendly combatants on player clients. This is a visual preference, not a restriction on document data access.
- **Remove targets:** clears the user's targets on relevant turn/round changes and encounter deletion. It does not clear them for unrelated encounter edits or initiative reordering. This setting takes effect without reloading and does not assume a system-specific HP path.
- HP fields, health rings, and initiative reflow can each be configured separately.

## Development

Use Node.js 22 or newer:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Edit English text in `yaml/lang/en.yaml`, the manifest in `yaml/module.yaml`, and styles in `styles/src/`. `npm run build` regenerates `module.json`, `lang/en.json`, and `styles/dist/`; commit generated files with their sources. CI runs the regression suite, build, browser smoke test, and a check that generated files are current.

See [TESTING.md](TESTING.md) for test scope and live-world verification.

The [v1.5 health design](docs/v1.5-health-design.md) records the agreed behavior and release acceptance checks. The implementation is in this test branch; live validation with the maintainer's D&D 6 world remains pending.

Original module by Asacolips: [upstream project](https://gitlab.com/asacolips-projects/foundry-mods/combat-enhancements).
