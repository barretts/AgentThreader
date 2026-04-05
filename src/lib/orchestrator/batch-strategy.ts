import type { RunPolicy } from "../state/types.js";
import { FIBONACCI_BATCH_SEQUENCE } from "../state/types.js";

export interface BatchDecision {
  nextBatchSize: number;
  reason: string;
}

export function growBatchSize(policy: RunPolicy): BatchDecision {
  if (policy.batch_strategy === "fixed") {
    return { nextBatchSize: policy.current_batch_size, reason: "fixed strategy; no growth" };
  }

  const seq = FIBONACCI_BATCH_SEQUENCE;
  const currentIdx = seq.indexOf(policy.current_batch_size as typeof seq[number]);

  if (currentIdx === -1) {
    const nextIdx = seq.findIndex(v => v > policy.current_batch_size);
    const next = nextIdx !== -1 ? seq[nextIdx] : seq[seq.length - 1];
    return { nextBatchSize: next, reason: `grew to next fibonacci step: ${next}` };
  }

  if (currentIdx < seq.length - 1) {
    const next = seq[currentIdx + 1];
    return { nextBatchSize: next, reason: `grew from ${policy.current_batch_size} to ${next}` };
  }

  return { nextBatchSize: policy.current_batch_size, reason: "at maximum fibonacci step" };
}

export function shrinkBatchSize(policy: RunPolicy): BatchDecision {
  if (policy.batch_strategy === "fixed") {
    return { nextBatchSize: policy.current_batch_size, reason: "fixed strategy; no shrink" };
  }

  const seq = FIBONACCI_BATCH_SEQUENCE;
  const currentIdx = seq.indexOf(policy.current_batch_size as typeof seq[number]);

  if (currentIdx <= 0) {
    return { nextBatchSize: 1, reason: "already at minimum batch size" };
  }

  const prev = seq[currentIdx - 1];
  return { nextBatchSize: prev, reason: `shrunk from ${policy.current_batch_size} to ${prev}` };
}

export function computeEffectiveWindowSize(
  batchSize: number,
  readyTaskCount: number,
): number {
  return Math.min(batchSize, readyTaskCount);
}
