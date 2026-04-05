import { validateManifest, type ValidateManifestOptions, type ValidateManifestResult } from '../../lib/contracts/validate-manifest.js';

export interface ValidateManifestCommandOptions extends ValidateManifestOptions {
  json: boolean;
}

export function validateManifestCommand(options: ValidateManifestCommandOptions): ValidateManifestResult {
  return validateManifest({ manifestPath: options.manifestPath });
}
