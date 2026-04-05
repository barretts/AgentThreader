import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  title: string;
  status: DoctorStatus;
  detail: string;
  recommendation?: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  cwd?: string;
}

function parseMajor(version: string): number {
  const clean = version.startsWith('v') ? version.slice(1) : version;
  const [majorRaw] = clean.split('.');
  const major = Number.parseInt(majorRaw, 10);
  return Number.isNaN(major) ? 0 : major;
}

function checkNodeVersion(): DoctorCheck {
  const major = parseMajor(process.version);
  if (major >= 18) {
    return {
      id: 'node_version',
      title: 'Node.js version',
      status: 'pass',
      detail: `Detected ${process.version} (supported: >=18)`,
    };
  }
  return {
    id: 'node_version',
    title: 'Node.js version',
    status: 'fail',
    detail: `Detected ${process.version} (supported: >=18)`,
    recommendation: 'Upgrade Node.js to 18 or newer.',
  };
}

function checkNpm(): DoctorCheck {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (result.status === 0) {
    const version = (result.stdout ?? '').trim();
    return {
      id: 'npm_available',
      title: 'npm availability',
      status: 'pass',
      detail: `npm ${version || 'available'}`,
    };
  }

  return {
    id: 'npm_available',
    title: 'npm availability',
    status: 'fail',
    detail: 'npm was not found in PATH or failed to run.',
    recommendation: 'Install npm and ensure it is available in your shell PATH.',
  };
}

function checkHomeWritable(): DoctorCheck {
  const home = os.homedir();
  try {
    accessSync(home, constants.W_OK);
    return {
      id: 'home_writable',
      title: 'Home directory write access',
      status: 'pass',
      detail: `Writable: ${home}`,
    };
  } catch {
    return {
      id: 'home_writable',
      title: 'Home directory write access',
      status: 'fail',
      detail: `Not writable: ${home}`,
      recommendation: 'Ensure your user can write to the home directory for skill installation.',
    };
  }
}

function checkInstallScriptParity(cwd: string): DoctorCheck {
  const rootInstall = path.join(cwd, 'install.sh');
  const siteInstall = path.join(cwd, 'site', 'install.sh');

  if (!existsSync(rootInstall) || !existsSync(siteInstall)) {
    return {
      id: 'install_script_sync',
      title: 'Installer parity (repo clone)',
      status: 'warn',
      detail: 'install.sh and site/install.sh were not both found in current directory.',
      recommendation: 'Run doctor from the AgentThreader repository to verify script parity.',
    };
  }

  const rootContent = readFileSync(rootInstall, 'utf8');
  const siteContent = readFileSync(siteInstall, 'utf8');
  if (rootContent === siteContent) {
    return {
      id: 'install_script_sync',
      title: 'Installer parity (repo clone)',
      status: 'pass',
      detail: 'install.sh and site/install.sh are in sync.',
    };
  }

  return {
    id: 'install_script_sync',
    title: 'Installer parity (repo clone)',
    status: 'warn',
    detail: 'install.sh and site/install.sh differ.',
    recommendation: 'Copy root install.sh to site/install.sh after installer changes.',
  };
}

function checkCompiledArtifacts(cwd: string): DoctorCheck {
  const expected = path.join(cwd, 'compiled', 'cursor', 'skills', 'agent-threader', 'SKILL.md');
  if (existsSync(expected)) {
    return {
      id: 'compiled_artifacts',
      title: 'Compiled skill artifacts',
      status: 'pass',
      detail: 'Compiled skill artifacts are present.',
    };
  }

  return {
    id: 'compiled_artifacts',
    title: 'Compiled skill artifacts',
    status: 'warn',
    detail: 'Compiled artifacts were not found in this working directory.',
    recommendation: 'From a repo clone, run: npm run compile',
  };
}

export function runDoctor(options: DoctorOptions = {}): DoctorResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const checks: DoctorCheck[] = [
    checkNodeVersion(),
    checkNpm(),
    checkHomeWritable(),
    checkInstallScriptParity(cwd),
    checkCompiledArtifacts(cwd),
  ];

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    checks,
  };
}
