export const XP_BASE_PER_SOLVE = 10;
export const XP_CLEAN_BONUS = 5;
export const XP_LEVEL_TWO_BONUS = 5;
export const XP_COMBO_BONUS_CAP = 20;

export function xpNeededForNextLevel(level) {
  const safeLevel = Math.max(1, Math.trunc(Number(level) || 1));
  return 100 + (safeLevel - 1) * 50;
}

export function getExperienceProgress(totalXp = 0) {
  let remaining = Math.max(0, Math.trunc(Number(totalXp) || 0));
  let level = 1;
  let needed = xpNeededForNextLevel(level);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = xpNeededForNextLevel(level);
  }
  return Object.freeze({
    totalXp: Math.max(0, Math.trunc(Number(totalXp) || 0)),
    level,
    currentLevelXp: remaining,
    nextLevelXp: needed,
    progressPercent: Math.round(remaining / needed * 100),
  });
}

export function calculateSessionExperience(result = {}) {
  const solved = (result.problemResults ?? []).filter((item) => (
    item && item.problemScore > 0 && !item.submittedIncorrect && !item.skipped
  ));
  const problemXp = solved.reduce((sum, item) => (
    sum + XP_BASE_PER_SOLVE
      + (item.cleanSolve ? XP_CLEAN_BONUS : 0)
      + (item.level === 2 ? XP_LEVEL_TWO_BONUS : 0)
  ), 0);
  const comboBonus = Math.min(
    XP_COMBO_BONUS_CAP,
    Math.max(0, (Number(result.bestCombo) || 0) - 1) * 2,
  );
  return Math.max(0, Math.trunc(problemXp + comboBonus));
}