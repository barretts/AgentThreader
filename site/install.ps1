# install.ps1 -- Bootstrap installer for the published agent-threader package
# Usage: irm https://agentthreader.com/install.ps1 | iex -- [--claude] [--cursor] [--windsurf] [--opencode] [--codex] [--all]
#
# Bootstrap process:
#   1. Install the npm package globally
#   2. Delegate to install.js (Node.js, cross-platform) for skill installation

param(
  [switch]$Claude,
  [switch]$Cursor,
  [switch]$Windsurf,
  [switch]$OpenCode,
  [switch]$Codex,
  [switch]$All,
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PassthroughArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectName = if ($env:AGENT_THREADER_PACKAGE_NAME) { $env:AGENT_THREADER_PACKAGE_NAME } else { 'agent-threader' }
$ProjectVersion = if ($env:AGENT_THREADER_PACKAGE_VERSION) { $env:AGENT_THREADER_PACKAGE_VERSION } else { 'latest' }
$CliBinName = 'agent-threader'
$PackageSpec = "$ProjectName@$ProjectVersion"

function Get-InstallerArgs {
  $installerArgs = New-Object System.Collections.Generic.List[string]
  if ($Claude) { [void]$installerArgs.Add('--claude') }
  if ($Cursor) { [void]$installerArgs.Add('--cursor') }
  if ($Windsurf) { [void]$installerArgs.Add('--windsurf') }
  if ($OpenCode) { [void]$installerArgs.Add('--opencode') }
  if ($Codex) { [void]$installerArgs.Add('--codex') }
  if ($All) { [void]$installerArgs.Add('--all') }
  if ($Help) { [void]$installerArgs.Add('--help') }
  foreach ($arg in $PassthroughArgs) {
    [void]$installerArgs.Add($arg)
  }
  return $installerArgs.ToArray()
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'npm is required but was not found in PATH.'
}

$installerArgs = Get-InstallerArgs

Write-Host "==> Bootstrapping $PackageSpec"
Write-Host "--> Installing $PackageSpec globally..."
& npm install -g $PackageSpec
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$npmRoot = (& npm root -g).Trim()
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$packageDir = Join-Path $npmRoot $ProjectName
$localInstaller = Join-Path $packageDir 'install.js'

if (-not (Test-Path $localInstaller)) {
  Write-Error "Could not find install.js in $packageDir"
}

Write-Host '--> Delegating to Node.js installer...'
& node $localInstaller --skills-only @installerArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '==> Done.'
Write-Host "CLI available as: $CliBinName"