export function parseScheduleScores(schedule, week) {
  const scores = new Map();
  for (const game of schedule || []) {
    for (const side of [game.home, game.away]) {
      const id = side?.teamId ?? side?.team?.id ?? side?.team?.teamId;
      if (id == null || !Number.isInteger(Number(id))) continue;
      // ESPN can return the entire schedule even with scoringPeriodId set.
      const weekly = side?.pointsByScoringPeriod?.[week];
      const value = weekly ?? (Number(game.matchupPeriodId) === week ? side?.totalPoints : undefined);
      if (value == null || value === '' || !Number.isFinite(Number(value))) continue;
      scores.set(Number(id), { espnTeamId: Number(id), points: Number(value) });
    }
  }
  return [...scores.values()];
}

