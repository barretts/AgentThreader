import {
  explainErrorCode,
  listKnownErrorCodes,
  type ErrorExplanation,
} from '../../lib/errors/explain-error.js';

export interface ExplainErrorCommandOptions {
  code?: string;
  json: boolean;
}

export interface ExplainErrorResult {
  found: boolean;
  explanation?: ErrorExplanation;
  knownCodes: string[];
}

export function explainErrorCommand(options: ExplainErrorCommandOptions): ExplainErrorResult {
  const knownCodes = listKnownErrorCodes();
  if (!options.code) {
    return {
      found: false,
      knownCodes,
    };
  }

  const explanation = explainErrorCode(options.code);
  if (!explanation) {
    return {
      found: false,
      knownCodes,
    };
  }

  return {
    found: true,
    explanation,
    knownCodes,
  };
}
