const Subject = require('../models/Subject');
const Task = require('../models/Task');
const Availability = require('../models/Availability');
const StudySession = require('../models/StudySession');

const DAYS = [
  { key: 'sunday', name: 'Sunday', number: 0 },
  { key: 'monday', name: 'Monday', number: 1 },
  { key: 'tuesday', name: 'Tuesday', number: 2 },
  { key: 'wednesday', name: 'Wednesday', number: 3 },
  { key: 'thursday', name: 'Thursday', number: 4 },
  { key: 'friday', name: 'Friday', number: 5 },
  { key: 'saturday', name: 'Saturday', number: 6 },
];

function userId(req) {
  return req.user && (req.user._id || req.user.id);
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function formatDateInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function dateKey(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as first day
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, count) {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
}

function setTime(date, hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minutesBetween(start, end) {
  return Math.floor((end - start) / 60000);
}

function priorityRank(priority) {
  return { High: 0, Medium: 1, Low: 2 }[priority] ?? 1;
}

function buildCandidateSlots(availability, tasks) {
  if (!availability || !availability.windows.length) return [];

  const now = new Date();
  const latestDeadline = tasks.reduce((latest, task) => {
    const deadline = new Date(task.deadline);
    return deadline > latest ? deadline : latest;
  }, addDays(now, 14));

  // Safety cap so a typo in a deadline does not create thousands of slots.
  const hardCap = addDays(now, 56);
  const horizon = latestDeadline < hardCap ? latestDeadline : hardCap;
  const sessionLength = availability.sessionLength || 60;
  const slots = [];

  for (let day = startOfDay(now); day <= horizon; day = addDays(day, 1)) {
    const matchingWindows = availability.windows.filter(
      (window) => window.dayOfWeek === day.getDay()
    );

    for (const window of matchingWindows) {
      let cursor = setTime(day, window.start);
      const windowEnd = setTime(day, window.end);

      if (windowEnd <= cursor) continue;

      while (cursor < windowEnd) {
        const candidateEnd = new Date(cursor.getTime() + sessionLength * 60000);
        if (candidateEnd > windowEnd) break;

        if (candidateEnd > now) {
          slots.push({
            start: new Date(cursor),
            end: candidateEnd,
            capacity: sessionLength,
          });
        }

        cursor = candidateEnd;
      }
    }
  }

  return slots.sort((a, b) => a.start - b.start);
}

function groupSessionsByDate(sessions) {
  const map = new Map();

  for (const session of sessions) {
    const key = dateKey(session.startDate);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(session);
  }

  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    label: new Date(`${key}T00:00:00`).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    sessions: items,
  }));
}

function buildWeekDays(sessions) {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const key = dateKey(day);
    return {
      key,
      date: day,
      dayName: day.toLocaleDateString('en-AU', { weekday: 'short' }),
      dayNumber: day.getDate(),
      sessions: sessions.filter((session) => dateKey(session.startDate) === key),
    };
  });
}

exports.dashboard = async (req, res, next) => {
  try {
    const uid = userId(req);
    const [subjectCount, taskCount, sessionCount] = await Promise.all([
      Subject.countDocuments({ user: uid }),
      Task.countDocuments({ user: uid, completed: false }),
      StudySession.countDocuments({ user: uid, completed: false }),
    ]);

    res.render('planner/dashboard', { subjectCount, taskCount, sessionCount });
  } catch (error) {
    next(error);
  }
};

exports.showCreateSubject = (req, res) => {
  res.render('planner/subject-new', {
    errors: [],
    formData: {},
  });
};

exports.createSubject = async (req, res, next) => {
  try {
    const uid = userId(req);
    const { name, code, trimester, colour } = req.body;
    const errors = [];

    if (!name || !name.trim()) errors.push('Please enter a subject name.');
    if (!code || !code.trim()) errors.push('Please enter a subject code.');
    if (!trimester) errors.push('Please select a trimester.');

    if (errors.length) {
      return res.status(400).render('planner/subject-new', {
        errors,
        formData: req.body,
      });
    }

    const subject = await Subject.create({
      user: uid,
      name: name.trim(),
      code: code.trim(),
      trimester,
      colour: colour || '#E56B61',
    });

    return res.redirect(`/planner/tasks/new?subject=${subject._id}`);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).render('planner/subject-new', {
        errors: ['You already have a subject with that code.'],
        formData: req.body,
      });
    }
    next(error);
  }
};

exports.showCreateTask = async (req, res, next) => {
  try {
    const uid = userId(req);
    const subjects = await Subject.find({ user: uid }).sort({ code: 1 });

    if (!subjects.length) return res.redirect('/planner/subjects/new');

    res.render('planner/task-new', {
      errors: [],
      subjects,
      formData: {
        subject: req.query.subject || subjects[0]._id.toString(),
        priority: 'Medium',
      },
      formatDateInput,
    });
  } catch (error) {
    next(error);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    const uid = userId(req);
    const { name, subject, deadline, estimatedHours, priority, notes } = req.body;
    const errors = [];
    const subjects = await Subject.find({ user: uid }).sort({ code: 1 });

    const ownedSubject = await Subject.findOne({ _id: subject, user: uid });
    if (!ownedSubject) errors.push('Please select a valid subject.');
    if (!name || !name.trim()) errors.push('Please enter a task name.');

    const deadlineDate = deadline ? new Date(deadline) : null;
    if (!deadlineDate || Number.isNaN(deadlineDate.getTime())) {
      errors.push('Please choose a valid deadline.');
    } else if (deadlineDate <= new Date()) {
      errors.push('Deadline must be in the future.');
    }

    const hours = Number(estimatedHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      errors.push('Estimated effort must be greater than 0 hours.');
    }

    const allowedPriorities = ['Low', 'Medium', 'High'];
    const safePriority = allowedPriorities.includes(priority) ? priority : 'Medium';

    if (errors.length) {
      return res.status(400).render('planner/task-new', {
        errors,
        subjects,
        formData: req.body,
        formatDateInput,
      });
    }

    await Task.create({
      user: uid,
      subject: ownedSubject._id,
      name: name.trim(),
      deadline: deadlineDate,
      estimatedMinutes: Math.round(hours * 60),
      priority: safePriority,
      notes: (notes || '').trim(),
    });

    return res.redirect('/planner/availability');
  } catch (error) {
    next(error);
  }
};

exports.showAvailability = async (req, res, next) => {
  try {
    const uid = userId(req);
    const availability = await Availability.findOne({ user: uid });

    const windowMap = {};
    if (availability) {
      for (const window of availability.windows) {
        const day = DAYS.find((d) => d.number === window.dayOfWeek);
        if (day) windowMap[day.key] = window;
      }
    }

    res.render('planner/availability', {
      errors: [],
      days: DAYS.filter((day) => day.key !== 'sunday'),
      windowMap,
      sessionLength: availability ? availability.sessionLength : 60,
    });
  } catch (error) {
    next(error);
  }
};

exports.saveAvailability = async (req, res, next) => {
  try {
    const uid = userId(req);
    const sessionLength = Number(req.body.sessionLength) || 60;
    const windows = [];
    const errors = [];

    for (const day of DAYS) {
      if (!req.body[`${day.key}_enabled`]) continue;

      const start = req.body[`${day.key}_start`];
      const end = req.body[`${day.key}_end`];

      if (!start || !end) {
        errors.push(`${day.name}: please choose both start and end times.`);
        continue;
      }

      const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
      const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));

      if (endMinutes <= startMinutes) {
        errors.push(`${day.name}: end time must be later than start time.`);
        continue;
      }

      if (endMinutes - startMinutes < sessionLength) {
        errors.push(`${day.name}: the window must fit at least one ${sessionLength}-minute session.`);
        continue;
      }

      windows.push({
        dayOfWeek: day.number,
        dayName: day.name,
        start,
        end,
      });
    }

    if (!windows.length) {
      errors.push('Please select at least one available study period.');
    }

    if (errors.length) {
      const windowMap = {};
      for (const day of DAYS) {
        if (req.body[`${day.key}_enabled`]) {
          windowMap[day.key] = {
            start: req.body[`${day.key}_start`],
            end: req.body[`${day.key}_end`],
          };
        }
      }

      return res.status(400).render('planner/availability', {
        errors,
        days: DAYS.filter((day) => day.key !== 'sunday'),
        windowMap,
        sessionLength,
      });
    }

    await Availability.findOneAndUpdate(
      { user: uid },
      { user: uid, sessionLength, windows },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.redirect('/planner/availability?saved=1');
  } catch (error) {
    next(error);
  }
};

exports.generatePlan = async (req, res, next) => {
  try {
    const uid = userId(req);
    const [availability, tasks] = await Promise.all([
      Availability.findOne({ user: uid }),
      Task.find({ user: uid, completed: false, deadline: { $gt: new Date() } })
        .populate('subject')
        .sort({ deadline: 1 }),
    ]);

    const errors = [];
    if (!availability || !availability.windows.length) {
      errors.push('Please save at least one available study period first.');
    }
    if (!tasks.length) {
      errors.push('Please create at least one incomplete task with a future deadline.');
    }

    if (errors.length) {
      const windowMap = {};
      if (availability) {
        for (const window of availability.windows) {
          const day = DAYS.find((d) => d.number === window.dayOfWeek);
          if (day) windowMap[day.key] = window;
        }
      }

      return res.status(400).render('planner/availability', {
        errors,
        days: DAYS.filter((day) => day.key !== 'sunday'),
        windowMap,
        sessionLength: availability ? availability.sessionLength : 60,
      });
    }

    // Regeneration replaces only future, incomplete sessions.
    await StudySession.deleteMany({
      user: uid,
      completed: false,
      startDate: { $gte: new Date() },
    });

    const slots = buildCandidateSlots(availability, tasks);
    const usedSlots = new Set();
    const plannedSessions = [];
    let unplannedMinutes = 0;

    const orderedTasks = [...tasks].sort((a, b) => {
      const deadlineDiff = new Date(a.deadline) - new Date(b.deadline);
      if (deadlineDiff !== 0) return deadlineDiff;
      return priorityRank(a.priority) - priorityRank(b.priority);
    });

    for (const task of orderedTasks) {
      let remaining = task.estimatedMinutes;

      for (let i = 0; i < slots.length && remaining > 0; i += 1) {
        if (usedSlots.has(i)) continue;
        const slot = slots[i];

        if (slot.start >= new Date(task.deadline)) continue;

        const duration = Math.min(slot.capacity, remaining);
        const endDate = new Date(slot.start.getTime() + duration * 60000);

        plannedSessions.push({
          user: uid,
          task: task._id,
          subject: task.subject._id,
          startDate: slot.start,
          endDate,
          durationMinutes: duration,
          completed: false,
        });

        usedSlots.add(i);
        remaining -= duration;
      }

      if (remaining > 0) unplannedMinutes += remaining;
    }

    if (!plannedSessions.length) {
      const windowMap = {};
      for (const window of availability.windows) {
        const day = DAYS.find((d) => d.number === window.dayOfWeek);
        if (day) windowMap[day.key] = window;
      }

      return res.status(400).render('planner/availability', {
        errors: [
          'No study sessions could be placed before your deadlines. Add more availability or move a deadline.',
        ],
        days: DAYS.filter((day) => day.key !== 'sunday'),
        windowMap,
        sessionLength: availability.sessionLength,
      });
    }

    await StudySession.insertMany(plannedSessions);

    return res.redirect(
      `/planner/plan?view=list&generated=1&unplannedMinutes=${unplannedMinutes}`
    );
  } catch (error) {
    next(error);
  }
};

exports.showPlan = async (req, res, next) => {
  try {
    const uid = userId(req);
    const view = req.query.view === 'calendar' ? 'calendar' : 'list';

    const sessions = await StudySession.find({ user: uid })
      .populate({ path: 'task', select: 'name priority notes deadline' })
      .populate({ path: 'subject', select: 'name code colour' })
      .sort({ startDate: 1 });

    const selectedSession = req.query.session
      ? sessions.find((session) => session._id.toString() === req.query.session)
      : sessions[0] || null;

    const totalMinutes = sessions.reduce(
      (sum, session) => sum + session.durationMinutes,
      0
    );
    const completedMinutes = sessions
      .filter((session) => session.completed)
      .reduce((sum, session) => sum + session.durationMinutes, 0);

    const progress = totalMinutes
      ? Math.round((completedMinutes / totalMinutes) * 100)
      : 0;

    const data = {
      sessions,
      selectedSession,
      groupedSessions: groupSessionsByDate(sessions),
      weekDays: buildWeekDays(sessions),
      totalHours: (totalMinutes / 60).toFixed(1),
      progress,
      generated: req.query.generated === '1',
      unplannedMinutes: Number(req.query.unplannedMinutes || 0),
    };

    return res.render(
      view === 'calendar' ? 'planner/plan-calendar' : 'planner/plan-list',
      data
    );
  } catch (error) {
    next(error);
  }
};

exports.completeSession = async (req, res, next) => {
  try {
    const uid = userId(req);

    const session = await StudySession.findOneAndUpdate(
      { _id: req.params.id, user: uid },
      { completed: true },
      { new: true }
    );

    if (!session) return res.status(404).send('Study session not found.');

    const taskSessionsRemaining = await StudySession.countDocuments({
      user: uid,
      task: session.task,
      completed: false,
    });

    if (taskSessionsRemaining === 0) {
      await Task.findOneAndUpdate(
        { _id: session.task, user: uid },
        { completed: true }
      );
    }

    return res.redirect(req.get('referer') || '/planner/plan?view=list');
  } catch (error) {
    next(error);
  }
};
