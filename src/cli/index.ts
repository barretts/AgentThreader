#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { AppError } from '../lib/errors/types.js';
import { validateManifestCommand } from './commands/validate-manifest.js';
import { initStateCommand } from './commands/init-state.js';
import { parseResultCommand } from './commands/parse-result.js';
import { parseHealCommand } from './commands/parse-heal.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { doctorCommand } from './commands/doctor.js';
import { explainErrorCommand } from './commands/explain-error.js';
import { scaffoldCommand } from './commands/scaffold.js';

const program = new Command();

program
  .name('agent-threader')
  .description('AgentThreader -- manifest-driven agentic CLI orchestration')
  .version('2.0.0');

// ── validate-manifest ────────────────────────────────────────────────────────

program
  .command('validate-manifest')
  .alias('validate')
  .description('Validate a manifest.v2 JSON file')
  .argument('<path>', 'Path to manifest JSON file')
  .option('--json', 'Output as JSON', false)
  .action((manifestPath: string, options: { json: boolean }) => {
    try {
      const result = validateManifestCommand({ manifestPath, json: options.json });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.valid) {
          console.log(chalk.green(`Valid manifest: ${result.taskCount} tasks`));
          console.log(chalk.dim(`Dependency order: ${result.dependencyOrder.join(' -> ')}`));
        } else {
          console.log(chalk.red('Invalid manifest'));
        }
        for (const issue of result.issues) {
          const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
          console.log(color(`  ${issue.severity.toUpperCase()}: ${issue.message}`));
        }
      }

      if (!result.valid) process.exit(1);
    } catch (error) {
      handleError(error);
    }
  });

// ── init-state ───────────────────────────────────────────────────────────────

program
  .command('init-state')
  .alias('init')
  .description('Initialize a state.v2 file from a manifest')
  .argument('<manifest-path>', 'Path to manifest JSON file')
  .option('--output <path>', 'Output state file path', '.agentic/state.json')
  .option('--heal <schedule>', 'Heal schedule: auto, off, task, batch, epoch')
  .option('--batch-strategy <strategy>', 'Batch strategy: fibonacci, fixed')
  .option('--json', 'Output as JSON', false)
  .action(async (manifestPath: string, options: { output: string; heal?: string; batchStrategy?: string; json: boolean }) => {
    try {
      const result = await initStateCommand({
        manifestPath,
        outputPath: options.output,
        heal: options.heal,
        batchStrategy: options.batchStrategy,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green(`State initialized: ${result.statePath}`));
        console.log(chalk.dim(`  Run ID:     ${result.runId}`));
        console.log(chalk.dim(`  Tasks:      ${result.taskCount}`));
        console.log(chalk.dim(`  Heal:       ${result.policy.heal_schedule}`));
        console.log(chalk.dim(`  Batch:      ${result.policy.batch_strategy}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── parse-result ─────────────────────────────────────────────────────────────

program
  .command('parse-result')
  .alias('parse')
  .description('Extract and validate task_result.v2 from a worker log')
  .argument('<log-path>', 'Path to worker log file')
  .option('--json', 'Output as JSON', false)
  .action((logPath: string, options: { json: boolean }) => {
    try {
      const result = parseResultCommand({ logPath, json: options.json });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.ok && result.taskResult) {
        const tr = result.taskResult;
        console.log(chalk.green(`Parsed task result: ${tr.task_id}`));
        console.log(chalk.dim(`  Status:        ${tr.status}`));
        console.log(chalk.dim(`  Summary:       ${tr.summary}`));
        console.log(chalk.dim(`  Changed files: ${tr.changed_files?.length ?? 0}`));
        console.log(chalk.dim(`  Writes:        ${tr.writes?.length ?? 0}`));
      } else if (result.error) {
        console.log(chalk.red(`Parse failed [${result.error.code}]: ${result.error.message}`));
        process.exit(1);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── parse-heal ───────────────────────────────────────────────────────────────

program
  .command('parse-heal')
  .alias('heal')
  .description('Extract and validate heal_decision.v2 from a healer log')
  .argument('<log-path>', 'Path to healer log file')
  .option('--json', 'Output as JSON', false)
  .action((logPath: string, options: { json: boolean }) => {
    try {
      const result = parseHealCommand({ logPath, json: options.json });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.ok && result.healDecision) {
        const hd = result.healDecision;
        console.log(chalk.green(`Parsed heal decision: ${hd.decision}`));
        console.log(chalk.dim(`  Scope:         ${hd.scope}`));
        console.log(chalk.dim(`  Failure class: ${hd.failure_class}`));
        console.log(chalk.dim(`  Root cause:    ${hd.root_cause}`));
        console.log(chalk.dim(`  Patches:       ${hd.patches.length}`));
        if (hd.learned_rule) {
          console.log(chalk.dim(`  Learned rule:  ${hd.learned_rule}`));
        }
      } else if (result.error) {
        console.log(chalk.red(`Parse failed [${result.error.code}]: ${result.error.message}`));
        process.exit(1);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── status ───────────────────────────────────────────────────────────────────

program
  .command('status')
  .alias('st')
  .description('Display run status from a state.v2 file')
  .argument('[state-path]', 'Path to state JSON file', '.agentic/state.json')
  .option('--json', 'Output as JSON', false)
  .action((statePath: string, options: { json: boolean }) => {
    try {
      const result = statusCommand({ statePath, json: options.json });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const statusColor = result.runStatus === 'COMPLETED' ? chalk.green
          : result.runStatus === 'ABORTED' ? chalk.red
          : chalk.yellow;

        console.log(`Run ${chalk.bold(result.runId)}: ${statusColor(result.runStatus)}`);
        if (result.abortReason) {
          console.log(chalk.red(`  Abort reason: ${result.abortReason}`));
        }
        console.log();

        console.log(chalk.bold('Tasks:'));
        for (const [status, count] of Object.entries(result.taskSummary)) {
          const c = status === 'DONE' ? chalk.green
            : status === 'FAILED' || status === 'ESCALATED' ? chalk.red
            : status === 'RUNNING' ? chalk.yellow
            : chalk.dim;
          console.log(`  ${c(status.padEnd(10))} ${count}`);
        }
        console.log(chalk.dim(`  Total:     ${result.totalTasks}`));
        console.log();

        if (result.healingRounds > 0) {
          console.log(chalk.bold(`Healing rounds: ${result.healingRounds}`));
          if (result.lastHealDecision) {
            console.log(chalk.dim(`  Last decision: ${result.lastHealDecision}`));
          }
          console.log();
        }

        if (result.failedTasks.length > 0) {
          console.log(chalk.bold('Failed/Escalated/Blocked tasks:'));
          for (const ft of result.failedTasks) {
            console.log(chalk.red(`  ${ft.taskId}: ${ft.status}`));
            if (ft.failureClass) console.log(chalk.dim(`    Class:     ${ft.failureClass}`));
            if (ft.failureSignature) console.log(chalk.dim(`    Signature: ${ft.failureSignature}`));
            console.log(chalk.dim(`    Attempts:  ${ft.workerAttempts}`));
          }
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── logs ─────────────────────────────────────────────────────────────────────

program
  .command('logs')
  .alias('history')
  .description('List log files from state history entries')
  .argument('[state-path]', 'Path to state JSON file', '.agentic/state.json')
  .option('--task <id>', 'Filter by task ID')
  .option('--phase <phase>', 'Filter by phase: worker, verify, healer, rollback')
  .option('--json', 'Output as JSON', false)
  .action((statePath: string, options: { task?: string; phase?: string; json: boolean }) => {
    try {
      const result = logsCommand({
        statePath,
        taskId: options.task,
        phase: options.phase,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.entries.length === 0) {
          console.log(chalk.dim('No log entries found.'));
        } else {
          console.log(chalk.bold(`${result.entries.length} log entries:`));
          console.log();
          for (const entry of result.entries) {
            const phaseColor = entry.phase === 'worker' ? chalk.blue
              : entry.phase === 'verify' ? chalk.cyan
              : entry.phase === 'healer' ? chalk.magenta
              : chalk.yellow;
            const exitStr = entry.exitCode !== null ? ` exit=${entry.exitCode}` : '';
            console.log(`  ${chalk.dim(entry.timestamp)} ${entry.taskId} ${phaseColor(entry.phase)}#${entry.attempt}${chalk.dim(exitStr)}`);
            console.log(chalk.dim(`    ${entry.logPath}`));
            if (entry.verifyLogPath) {
              console.log(chalk.dim(`    ${entry.verifyLogPath}`));
            }
          }
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── doctor ───────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .alias('diag')
  .description('Check environment and local setup health')
  .option('--cwd <path>', 'Directory to inspect for local repo checks', process.cwd())
  .option('--json', 'Output as JSON', false)
  .action((options: { cwd: string; json: boolean }) => {
    try {
      const result = doctorCommand({
        cwd: options.cwd,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.bold('AgentThreader Doctor'));
        console.log();

        for (const check of result.checks) {
          const icon = check.status === 'pass' ? chalk.green('PASS')
            : check.status === 'warn' ? chalk.yellow('WARN')
            : chalk.red('FAIL');
          console.log(`${icon} ${chalk.bold(check.title)} - ${check.detail}`);
          if (check.recommendation) {
            console.log(chalk.dim(`     fix: ${check.recommendation}`));
          }
        }

        console.log();
        if (result.ok) {
          console.log(chalk.green('Doctor passed with no fatal issues.'));
        } else {
          console.log(chalk.red('Doctor found fatal issues. Fix FAIL checks and retry.'));
          process.exit(1);
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── explain ──────────────────────────────────────────────────────────────────

program
  .command('explain')
  .alias('why')
  .description('Explain an AgentThreader error code')
  .argument('[code]', 'Error code to explain (e.g. CONFIG_ERROR, NO_SENTINEL)')
  .option('--json', 'Output as JSON', false)
  .action((code: string | undefined, options: { json: boolean }) => {
    try {
      const result = explainErrorCommand({
        code,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        if (code && !result.found) process.exit(1);
        return;
      }

      if (!code) {
        console.log(chalk.bold('Known error codes:'));
        for (const knownCode of result.knownCodes) {
          console.log(`  - ${knownCode}`);
        }
        console.log();
        console.log(chalk.dim('Usage: agent-threader explain <code>'));
        return;
      }

      if (!result.found || !result.explanation) {
        console.log(chalk.red(`Unknown error code: ${code}`));
        console.log(chalk.dim('Run `agent-threader explain` to list supported codes.'));
        process.exit(1);
      }

      const exp = result.explanation;
      console.log(chalk.green(`${exp.code} (${exp.category})`));
      console.log(chalk.dim(exp.meaning));
      console.log();
      console.log(chalk.bold('Likely causes:'));
      for (const cause of exp.likelyCauses) {
        console.log(`  - ${cause}`);
      }
      console.log(chalk.bold('Suggested fixes:'));
      for (const fix of exp.suggestedFixes) {
        console.log(`  - ${fix}`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── scaffold ────────────────────────────────────────────────────────────────

program
  .command('scaffold')
  .alias('new')
  .description('Scaffold a new orchestrator project from the AgentThreader boilerplate')
  .argument('<target-dir>', 'Directory to create the project in')
  .option('--name <name>', 'Project name (defaults to directory name)')
  .option('--force', 'Overwrite existing files', false)
  .option('--json', 'Output as JSON', false)
  .action((targetDir: string, options: { name?: string; force: boolean; json: boolean }) => {
    try {
      const result = scaffoldCommand({
        targetDir,
        projectName: options.name,
        force: options.force,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green(`Scaffolded project: ${result.projectName}`));
        console.log(chalk.dim(`  Directory: ${result.targetDir}`));
        console.log();

        if (result.filesCreated.length > 0) {
          console.log(chalk.bold(`Created ${result.filesCreated.length} files:`));
          for (const f of result.filesCreated) {
            console.log(chalk.dim(`  + ${f}`));
          }
        }

        if (result.skipped.length > 0) {
          console.log();
          console.log(chalk.yellow(`Skipped ${result.skipped.length} existing files (use --force to overwrite):`));
          for (const f of result.skipped) {
            console.log(chalk.dim(`  ~ ${f}`));
          }
        }

        console.log();
        console.log(chalk.bold('Next steps:'));
        console.log(chalk.dim(`  cd ${targetDir}`));
        console.log(chalk.dim('  npm install'));
        console.log(chalk.dim('  # Edit src/my-adapter.ts for your CLI agent'));
        console.log(chalk.dim('  # Edit manifest.json for your tasks'));
        console.log(chalk.dim('  npx tsx src/orchestrator.ts --manifest manifest.json'));
      }
    } catch (error) {
      handleError(error);
    }
  });

// ── Error handling ───────────────────────────────────────────────────────

program.parse();

function handleError(error: unknown): never {
  if (error instanceof AppError) {
    console.error(chalk.red(`Error [${error.code}]: ${error.message}`));
    if (Object.keys(error.context).length > 0) {
      console.error(chalk.dim(JSON.stringify(error.context, null, 2)));
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
  } else {
    console.error(chalk.red(`Error: ${String(error)}`));
  }
  process.exit(1);
}

export { program, handleError };
