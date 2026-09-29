function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(value) {
  const d = startOfDay(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildStreakViewModel({ plan, today = new Date() }) {
  const completedBlocks = plan && Array.isArray(plan.blocks)
    ? plan.blocks.filter((block) => block.status === 'complete')
    : [];

  const studyDayKeys = [...new Set(
    completedBlocks
      .filter((block) => block.date)
      .map((block) => dateKey(block.date))
  )].sort();

  const studyDaySet = new Set(studyDayKeys);

  let longestStreak = 0;
  let running = 0;
  let previousKey = null;

  studyDayKeys.forEach((key) => {
    if (!previousKey) {
      running = 1;
    } else {
      const previous = startOfDay(previousKey + 'T12:00:00');
      previous.setDate(previous.getDate() + 1);
      running = dateKey(previous) === key ? running + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, running);
    previousKey = key;
  });

  const todayDate = startOfDay(today);
  const yesterday = new Date(todayDate);
  yesterday.setDate(yesterday.getDate() - 1);

  let cursor = null;
  if (studyDaySet.has(dateKey(todayDate))) {
    cursor = new Date(todayDate);
  } else if (studyDaySet.has(dateKey(yesterday))) {
    // Keep yesterday's streak active until today is over.
    cursor = new Date(yesterday);
  }

  let currentStreak = 0;
  while (cursor && studyDaySet.has(dateKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const totalCompletedSessions = completedBlocks.length;
  const uniqueStudyDays = studyDayKeys.length;

  const badges = [
    {
      id: 'first-session',
      name: 'First Session',
      description: 'Earned after completing the first study block',
      symbol: '✦',
      earned: totalCompletedSessions >= 1,
    },
    {
      id: 'five-day-streak',
      name: '5 Day Streak',
      description: 'Earned after studying for 5 consecutive days',
      symbol: '5',
      earned: longestStreak >= 5,
    },
    {
      id: 'ten-sessions',
      name: '10 Sessions',
      description: 'Earned after completing 10 study sessions',
      symbol: '10',
      earned: totalCompletedSessions >= 10,
    },
    {
      id: 'consistent-learner',
      name: 'Consistent Learner',
      description: 'Earned after studying on 7 different days',
      symbol: '◌',
      earned: uniqueStudyDays >= 7,
    },
  ];

  return {
    currentStreak,
    longestStreak,
    totalCompletedSessions,
    uniqueStudyDays,
    earnedCount: badges.filter((badge) => badge.earned).length,
    badges,
  };
}

module.exports = { buildStreakViewModel, dateKey };
