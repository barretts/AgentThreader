import { validateManifest, type ValidateManifestOptions, type ValidateManifestResult } from '../../core/validate-manifest.js';

export interface ValidateManifestCommandOptions extends ValidateManifestOptions {
  json: boolean;
}

export function validateManifestCommand(options: ValidateManifestCommandOptions): ValidateManifestResult {
  return validateManifest({ manifestPath: options.manifestPath });
}
