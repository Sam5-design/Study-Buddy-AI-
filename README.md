# Study Buddy AI

## Running the tests

From the project root, run:

    npm test

This runs the automated test suite for the AI Scheduling Engine
(tests/scheduling.test.js) using Node's built-in test runner.
No database or extra packages are needed. It covers:

- the weighted scheduling rules (slack first, priority as tiebreaker)
- edge cases (empty lists, fractional hours, multi-day splitting)
- regression checks for session-based scheduling
- rejection of invalid task data (missing deadline or effort hours)
- unavailable days (no study is scheduled on days the student blocks off)
- exam boost (exams get growing revision time in their last 3 days)