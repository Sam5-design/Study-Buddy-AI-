/**
 * Public interface for the AI Scheduling Engine (FR-12, FR-15).
 *
 * This is the only file the rest of the app should import from
 * services/aiSchedulingEngine. Callers should not reach into
 * generatePlan.js directly, so the internals can change without
 * breaking anything outside this folder.
 *
 * Input contract — generatePlan({ tasks, availableStudyTimeHours, startDate })
 *   tasks                    Array of pending Task documents (or plain
 *                             objects with the same shape). Each needs
 *                             at least: _id, subject, deadline,
 *                             estimatedEffortHours, priority.
 *   availableStudyTimeHours  Number > 0. Hours per day the student has
 *                             free to study.
 *   startDate                Date. The first day the plan should cover.
 *
 * Output contract
 *   Promise<{ blocks: Array<{ date, task, subject, allocatedHours }> }>
 *   One entry per scheduled study session. `task` and `subject` are
 *   ObjectIds, matching the shape StudyPlan.blocks expects.
 *
 * A caller with invalid input (no tasks, availableStudyTimeHours <= 0)
 * should reject with a plain Error. The controller is responsible for
 * turning that into an HTTP response, this module just throws.
 */
const { generatePlan } = require('./generatePlan');

module.exports = { generatePlan };