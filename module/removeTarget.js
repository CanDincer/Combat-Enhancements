export function untargetDeadTokens() {
  game.user.targets.forEach((t) => {
    if (t.actor?.system.attributes.hp.value <= 0) {
      t.setTarget(false, { releaseOthers: false });
      game.user.targets.delete(t);
    }
  });
}

export function untargetAllTokens(...args) {
  const params = args[0];
  const combat = params[0] ?? game.combat;
  if (game.user.targets) {
    game.user.targets.forEach((t) => {
      t.setTarget(false, { releaseOthers: false });
    });
    game.user.targets.clear();
  }
}
