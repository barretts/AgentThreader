import type { TaskState, RunPolicy, HealingRound } from "../state/types.js";
import {
  HEALABLE_FAILURE_CLASSES,
  NON_HEALABLE_FAILURE_CLASSES,
  FATAL_TRANSIENT_INFRA_SUBTYPES,
} from "../contracts/types.js";

export interface WindowOutcome {
  windowTaskIds: string[];
  taskStates: Record<string, TaskState>;
}

export interface FailureRateResult {
  rate: number;
  healableFailedCount: number;
  attemptedHealableCount: number;
  shouldSkipHealer: boolean;
}

export interface HealDecisionInput {
  windowOutcome: WindowOutcome;
  policy: RunPolicy;
  healingRounds: HealingRound[];
}

export interface ShouldHealResult {
  shouldHeal: boolean;
  shouldShrink: boolean;
  shouldAbort: boolean;
  reason: string;
}

export function isHealableFailure(failureClass: string | null): boolean {
  if (!failureClass) return false;
  if (NON_HEALABLE_FAILURE_CLASSES.has(failureClass)) return false;
  if (HEALABLE_FAILURE_CLASSES.has(failureClass)) return true;
  // build_error, test_error, smoke_error are conditionally healable
  return !NON_HEALABLE_FAILURE_CLASSES.has(failureClass);
}

export function computeFailureRate(outcome: WindowOutcome): FailureRateResult {
  let healableFailedCount = 0;
  let attemptedHealableCount = 0;

  for (const taskId of outcome.windowTaskIds) {
    const ts = outcome.taskStates[taskId];
    if (!ts) continue;

    const isHealable = isHealableFailure(ts.last_failure_class);
    if (!isHealable) continue;

    attemptedHealableCount++;

    if (ts.status !== "DONE") {
      healableFailedCount++;
    }
  }

  if (attemptedHealableCount === 0) {
    return { rate: 0, healableFailedCount: 0, attemptedHealableCount: 0, shouldSkipHealer: true };
  }

  return {
    rate: healableFailedCount / attemptedHealableCount,
    healableFailedCount,
    attemptedHealableCount,
    shouldSkipHealer: false,
  };
}

export function shouldHeal(input: HealDecisionInput): ShouldHealResult {
  const { policy, healingRounds } = input;

  if (policy.heal_schedule === "off") {
    return { shouldHeal: false, shouldShrink: false, shouldAbort: false, reason: "healing disabled" };
  }

  if (healingRounds.length >= policy.max_total_heal_rounds) {
    return { shouldHeal: false, shouldShrink: false, shouldAbort: true, reason: "total healing budget exhausted" };
  }

  const failureRate = computeFailureRate(input.windowOutcome);

  if (failureRate.shouldSkipHealer) {
    return { shouldHeal: false, shouldShrink: false, shouldAbort: false, reason: "no healable failures in window" };
  }

  if (failureRate.rate === 0) {
    return { shouldHeal: false, shouldShrink: false, shouldAbort: false, reason: "zero failure rate; grow batch" };
  }

  if (failureRate.rate <= policy.failure_threshold) {
    return { shouldHeal: true, shouldShrink: false, shouldAbort: false, reason: `failure rate ${failureRate.rate.toFixed(2)} within threshold` };
  }

  return { shouldHeal: true, shouldShrink: true, shouldAbort: false, reason: `failure rate ${failureRate.rate.toFixed(2)} exceeds threshold; shrink` };
}

export function checkConvergence(
  currentRound: { failedTaskIds: string[]; signatures: Set<string> },
  previousRound: { failedTaskIds: string[]; signatures: Set<string> } | null,
): ConvergenceResult {
  if (!previousRound) {
    return { converging: true, reason: "first healing round" };
  }

  const failCountDropped = currentRound.failedTaskIds.length < previousRound.failedTaskIds.length;
  const signatureCountDropped = currentRound.signatures.size < previousRound.signatures.size;

  if (failCountDropped || signatureCountDropped) {
    return { converging: true, reason: "failure count or signature diversity decreased" };
  }

  const sameFailSet =
    currentRound.failedTaskIds.length === previousRound.failedTaskIds.length &&
    currentRound.failedTaskIds.every(id => previousRound.failedTaskIds.includes(id));

  if (sameFailSet) {
    return { converging: false, reason: "same failing set persists across rounds" };
  }

  return { converging: false, reason: "no measurable improvement" };
}

export interface ConvergenceResult {
  converging: boolean;
  reason: string;
}

export function shouldEscalateTask(
  taskState: TaskState,
  policy: RunPolicy,
): EscalationResult {
  if (!isHealableFailure(taskState.last_failure_class)) {
    return { escalate: true, reason: `non-healable failure class: ${taskState.last_failure_class}` };
  }

  if (taskState.worker_attempts >= policy.max_worker_attempts_per_task) {
    // Check signature repetition
    const signatureCounts = new Map<string, number>();
    for (const h of taskState.history) {
      if (h.failure_signature) {
        signatureCounts.set(h.failure_signature, (signatureCounts.get(h.failure_signature) ?? 0) + 1);
      }
    }

    for (const [sig, count] of signatureCounts) {
      if (count >= policy.signature_repeat_limit) {
        return { escalate: true, reason: `signature "${sig}" repeated ${count} times (limit: ${policy.signature_repeat_limit})` };
      }
    }
  }

  return { escalate: false, reason: "within retry and signature limits" };
}

export interface EscalationResult {
  escalate: boolean;
  reason: string;
}

export function shouldAbortRun(
  policy: RunPolicy,
  healingRounds: HealingRound[],
  taskStates: Record<string, TaskState>,
): RunAbortResult {
  if (healingRounds.length >= policy.max_total_heal_rounds) {
    return { abort: true, reason: "total healing budget exhausted without convergence" };
  }

  const allNonDone = Object.values(taskStates).filter(ts => ts.status !== "DONE" && ts.status !== "PENDING");
  const allEscalated = allNonDone.every(ts => ts.status === "ESCALATED" || ts.status === "BLOCKED");

  if (allNonDone.length > 0 && allEscalated) {
    return { abort: true, reason: "all remaining tasks are escalated or blocked" };
  }

  return { abort: false, reason: "run may continue" };
}

export interface RunAbortResult {
  abort: boolean;
  reason: string;
}

export interface FatalTransientResult {
  /** True when any window task carries a subtype in the fatal set. */
  fatal: boolean;
  /** First matched subtype (e.g. "transient_infra:api_auth_blocked"). */
  subtype: string | null;
  /** Task ids whose last failure class matched the fatal set. */
  taskIds: string[];
  /** Operator-actionable message for the abort path. */
  reason: string;
}

/**
 * Scan a window for failures tagged with a "fatal transient" infrastructure
 * subtype (e.g. API auth blocked, tool unavailable). These are static
 * conditions where PBH retries provably burn budget against a non-recoverable
 * upstream block. Callers should abort the run rather than enter the normal
 * heal-shrink-isolate loop, leaving FAILED tasks intact for `--resume` once
 * the operator resolves the upstream condition.
 */
export function checkWindowFatalTransient(
  outcome: WindowOutcome,
  fatalSet: ReadonlySet<string> = FATAL_TRANSIENT_INFRA_SUBTYPES,
): FatalTransientResult {
  const matched: string[] = [];
  let firstSubtype: string | null = null;

  for (const taskId of outcome.windowTaskIds) {
    const ts = outcome.taskStates[taskId];
    const cls = ts?.last_failure_class;
    if (!cls) continue;
    if (fatalSet.has(cls)) {
      matched.push(taskId);
      if (firstSubtype === null) firstSubtype = cls;
    }
  }

  if (matched.length === 0) {
    return { fatal: false, subtype: null, taskIds: [], reason: "no fatal transient subtypes in window" };
  }

  return {
    fatal: true,
    subtype: firstSubtype,
    taskIds: matched,
    reason: `fatal transient infra detected (${firstSubtype}) on ${matched.length} task(s); operator action required`,
  };
}
