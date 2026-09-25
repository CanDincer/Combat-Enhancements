# Tracker Enhancements validation

## Automated coverage

The regression suite covers:

- D&D 6 API arguments and HP/Temp outcomes, full Temp damage overflow, zero Temp damage, absolute corrections, healing caps, non-stacking grant totals, hook cancellation, unavailable APIs, and over-maximum source corrections.
- Independent arc fractions, modified/zero maxima, numeric ownership/friendliness rules, reversible native resource deduplication, pending saves across windows, preserved drafts, and coalesced item/effect refreshes.

- HP resource resolution, zero HP, invalid values, permissions, visibility, and optional Bar Brawl APIs.
- The reported owned-PC/other-PC/NPC visibility combinations, All combatants, literal encounter/group actor types, and world-setting refreshes on player clients.
- Native and legacy tracker roots, repeated renders, separate documents, the viewed encounter, and preservation of core control events.
- Actor update failures, refreshes of open trackers, and settings changes.
- Actor-type labels across the init/i18nInit lifecycle, system type-name translations, missing-label fallback, and preserved saved values.
- Before/after initiative moves, decimal values, ties, floating-point exhaustion, stale or foreign drag data, shared groups, and active-combatant preservation.
- Target clearing on relevant turn/round/end events without system-specific HP assumptions.
- Rebranding settings migration after ready with the old module disabled, all six settings, explicit false/empty values, custom actor types, preserved new preferences, GM-only writes, invalid data, and retry after partial failure.

The Playwright smoke test runs actual browser input and drag/drop events against a tracker fixture. It checks Enter, Escape, blur validation, core controls, narrow rows with long names, dark/light themes, active-turn preservation, player edit permissions, hidden initiative, and the full HP visibility choice matrix for an owned PC, another PC, and a zero-HP NPC. It also exercises the D&D field pair, Temp overflow, absolute corrections, fractional-input rejection, saved drafts, effective maxima, native HP/Temp deduplication, and unrelated AC preservation. It produces GM/player screenshots in both themes in `test-results/`.

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
git diff --exit-code -- module.json lang styles/dist
```

An existing compatible Chromium executable can be selected with `TE_CHROMIUM_PATH`. Set `TE_CORE_CSS` to a locally available Foundry core CSS file to repeat the layout checks with that stylesheet.

## Focused 1.5.0 test pass

The public API baseline was rechecked against [D&D 6.0.5](https://github.com/foundryvtt/dnd5e/tree/release-6.0.5) on 2026-09-25. Local validation passed 73 regression/API-contract tests, the build, and the browser suite in Chromium 133, both with the fixture stylesheet and with the available public-demo V14.365 core stylesheet. Screenshots were reviewed. The older stylesheet check is a layout reference; it does not replace live testing on Foundry 14.367 or newer. Automated D&D fixtures model the public contract; they do not run the full system. Record your exact Foundry build, D&D 6.0.x patch, and enabled modules when reporting the live results.

Use a disposable encounter with an owned PC, another friendly PC with Observer access, and an unowned enemy. Open the GM and player clients plus a detached tracker.

| Check | Expected result |
| --- | --- |
| Start at 100/120 HP + 20 Temp; enter `-25` in Temp | 95 HP / 0 Temp, exactly one damage event |
| Reset; enter `-5` in HP | 100 HP / 15 Temp; regular HP is unchanged |
| At zero Temp, enter `-5` in Temp | 5 damage to regular HP |
| Enter absolute HP `95`, Temp `10`, Temp `0` | Set only the selected pool; clearing Temp does not damage HP |
| Enter Temp `+3` while Temp is 20 | 23 Temp; no regular-HP healing |
| Heal above the effective maximum; apply/remove positive and negative maximum modifiers | HP respects the effective cap; both arcs rescale; no extra healing/damage caused by rendering |
| Expire/toggle an item or Active Effect that changes max HP | All open trackers refresh, including synthetic actors and off-scene combatants |
| Compare GM, owned PC, friendly Observer, and enemy Observer rows | Two editable fields / two editable fields / two read-only values / no numbers; never a duplicate HP value |
| Configure native tracked resource as HP, Temp, then AC | HP/Temp duplicates disappear; AC remains |
| Inspect 100/120 HP + 20 Temp, full HP without Temp, and zero HP with Temp | Independent 3.5 px halves; Temp never fills missing regular HP |
| Enter, blur, Escape, rerender while typing, and edit across linked rows/pop-outs | One save, Escape cancels, drafts survive unrelated renders, and pending fields cannot submit twice |
| Cause an external damage hook to cancel | Current values restored; no raw fallback write or duplicate concentration/status handling |

Normal damage/concentration modules must be enabled for the final integration pass. Check concentration when all damage is absorbed by Temp as well as when damage reaches regular HP. Client-to-client simultaneous edits are not transactional; do not automatically retry an uncertain damage save.

## What was checked

The implementation was checked against the official V14 APIs for [CombatTracker](https://foundryvtt.com/api/v14/classes/foundry.applications.sidebar.tabs.CombatTracker.html), [TokenDocument](https://foundryvtt.com/api/v14/classes/foundry.documents.TokenDocument.html), and [Combat](https://foundryvtt.com/api/v14/classes/foundry.documents.Combat.html), and the V14.365 client served by the public Foundry demo.

The rebranding migration uses the public [WorldSettings.getSetting](https://foundryvtt.com/api/v14/classes/foundry.documents.collections.WorldSettings.html#getSetting) and document `toObject()` APIs to read saved values without registering the old module. It copies only recognized, correctly typed settings through `game.settings.set`, after ready, on the designated active GM client. It does not modify actors, combatants, token permissions, or old setting documents.

Initial repair validation passed all 31 original regressions, the build, and the browser smoke test in Chromium 134. The browser test also passed with the public demo's V14.365 core stylesheet, and screenshots were inspected. GitHub Actions repeats the current regression, build, and browser checks; use its current run for the result on a particular commit.

The maintainer reported live testing on 2026-09-15: absolute/relative HP edits and initiative drag/drop worked. On 2026-09-16 they confirmed the desired player HP visibility, owner-only HP editing, and no observed errors, then reported merging and releasing 1.4.0. Exact Foundry/system/module versions were not recorded. The remaining reported issue was untranslated actor-type label prefixes, addressed in 1.4.1.

The player selector was traced to [Monk's Player Settings](https://github.com/ironmonk108/monks-player-settings/blob/main/apps/settings-config.js). Its category preparation excludes world settings when the selected player lacks SETTINGS_MODIFY, including the All Players view. All Tracker Enhancements settings use world scope and already affect all players, as defined by the [Foundry settings API](https://foundryvtt.com/api/v14/classes/foundry.helpers.ClientSettings.html#register).

Automated tests model Foundry documents and tracker markup. They do not launch a licensed Foundry server, exercise socket synchronization, or establish compatibility with every game system and third-party module. The maintainer report is limited to the cases above.

## Live-world checks before release

Use a disposable encounter in your actual V14 build and game system, with a GM and a player connected. Record the build, system version, browser, enabled modules, and any console errors.

| Area | Exercise | Expected result |
| --- | --- | --- |
| Package migration | In a world using the previous package, record all six settings; install the new package, disable the old module, enable Tracker Enhancements, and log in as GM | Module title is Tracker Enhancements, ID is tracker-enhancements, saved choices carry over, and no duplicate controls appear |
| Migration persistence | Change a new setting, reload the GM and player, then open a fresh world with only Tracker Enhancements enabled | New choices are retained; the fresh world uses defaults without migration errors |
| Settings labels | After loading the world, open Player HP circle visibility and inspect each option | Use token visibility, All combatants, and readable Actor type labels; no TRACKER_ENHANCEMENTS or TYPES translation keys |
| Tracker rendering | Open sidebar, pop-out, and detached tracker; switch viewed encounters; repeatedly render or change settings | One set of module controls per row; each window operates on its own encounter |
| Core and system controls | Use portrait ping, visibility, defeated, targeting, initiative entry, and group controls | Existing actions still work |
| Resources | Try linked and unlinked tokens, zero HP, custom Bar 1, scalar resources, missing tokens/actors, and zero maximum | Correct editable resource; valid rings only; no errors |
| HP editing | Enter absolute and signed values; save by Enter and blur; cancel with Escape; try blank/invalid input | Correct actor update, one save, cancellation and useful feedback |
| Permissions | Compare GM, owner, observer, and non-owner; change ownership while a tracker is open | HP editing follows current actor update permission |
| Visibility | With owner-only bars, compare Use token visibility, Actor type: character, Actor type: npc, and All combatants for an owned PC, another PC, and an NPC | Token visibility shows the owned PC; character adds the other PC; npc adds the NPC; All combatants shows all three; HP editing still follows ownership |
| World settings / Monk's Player Settings | As GM select your own account, enable HP radial bars, choose All combatants and save; then inspect the player client and compare other-player / All Players settings views | All player trackers receive the visibility change; world settings are edited under the GM account and are absent from Monk's other-player / All Players views by design |
| Layout | Use dark/light themes, narrow sidebar, long names, and many system controls | Fields fit; names truncate; portrait and action targets remain usable |
| Reordering | Move before first, after last, and between rows, including decimals and ties | Requested order; ties explain the reflow option; active combatant stays active |
| Group/custom initiative | Use native shared groups and any system-specific sort mode | Core/system controls remain usable; unsupported module moves explain the limitation |
| Other drag data | Drop actors and tokens from elsewhere, and drag between encounters | No unintended initiative writes |
| Target clearing | Toggle the setting without reload; advance/reverse turn or round; rename/edit another encounter; reorder initiative; end combat | Targets clear only for relevant turn/round/end events when enabled |
| Bar Brawl and scene changes | If used, test its bar visibility rules on current-scene and off-scene combatants | No visibility bypass or missing-canvas errors |
| Multiple clients | Change HP and turns as GM while observing the player and detached tracker | Clients refresh correctly without stale fields or duplicate saves |

## Packaging

The branch manifest and npm metadata are version 1.5.0. Run the validation commands, then package `module.json` at the archive root together with `module/`, `lang/`, and `styles/dist/`. CI uploads these runtime files as an installable test artifact. A source-archive install also works because generated assets are committed. Keep development dependencies and tests out of a release archive.

Complete the live checks before publishing the release. The current manifest's download URL points to the literal release tag `latest` and asset name `tracker-enhancements.zip`. Update the published manifest and its corresponding archive together. Keep the old published `combat-enhancements.zip` asset intact for existing installations until their users switch; the new package is installed separately. Finally, install through the new manifest into a clean test world and repeat an HP edit and initiative move. A source merge alone does not update an existing release asset.
