export class AppError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code = 'APP_ERROR',
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, identifier: string, context: Record<string, unknown> = {}) {
    super(`${entity} not found: ${identifier}`, 'NOT_FOUND_ERROR', {
      entity,
      identifier,
      ...context,
    });
    this.name = 'NotFoundError';
  }
}

export class CommandError extends AppError {
  constructor(command: string, exitCode: number | null, stderr: string, context: Record<string, unknown> = {}) {
    super(`Command failed: ${command}`, 'COMMAND_ERROR', {
      command,
      exitCode,
      stderr,
      ...context,
    });
    this.name = 'CommandError';
  }
}

export class ConfigError extends AppError {
  constructor(filePath: string, cause: string, context: Record<string, unknown> = {}) {
    super(`Configuration error in ${filePath}: ${cause}`, 'CONFIG_ERROR', {
      filePath,
      cause,
      ...context,
    });
    this.name = 'ConfigError';
  }
}
