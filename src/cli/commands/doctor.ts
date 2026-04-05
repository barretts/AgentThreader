import { runDoctor, type DoctorOptions, type DoctorResult } from '../../lib/diagnostics/doctor.js';

export interface DoctorCommandOptions extends DoctorOptions {
  json: boolean;
}

export function doctorCommand(options: DoctorCommandOptions): DoctorResult {
  return runDoctor({
    cwd: options.cwd,
  });
}
