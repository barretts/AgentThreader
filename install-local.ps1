param(
  [switch]$Claude,
  [switch]$Cursor,
  [switch]$Windsurf,
  [switch]$OpenCode,
  [switch]$Codex,
  [switch]$All,
  [switch]$SkillsOnly,
  [switch]$Uninstall,
  [switch]$CompileOnly,
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PassthroughArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectName = if ($env:AGENT_THREADER_PACKAGE_NAME) { $env:AGENT_THREADER_PACKAGE_NAME } else { 'agent-threader' }
$CliBinName = 'agent-threader'
$ManagedMarker = 'managed_by: agent-threader'
$Skills = @('agent-threader')
$SkillDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CompiledDir = Join-Path $SkillDir 'compiled'
$HomeDir = [Environment]::GetFolderPath('UserProfile')
$AppDataDir = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HomeDir 'AppData\Roaming' }
$CodeXHomeDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HomeDir '.codex' }

$ClaudeSkillsDir = Join-Path $HomeDir '.claude\skills'
$CursorRulesDir = Join-Path $HomeDir '.cursor\rules'
$CursorSkillsDir = Join-Path $HomeDir '.cursor\skills'
$WindsurfRulesDir = Join-Path $HomeDir '.windsurf\rules'
$WindsurfSkillsDir = Join-Path $HomeDir '.codeium\windsurf\skills'
$OpenCodeAgentsDir = Join-Path $AppDataDir 'opencode\agents'
$CodeXSkillsDir = Join-Path $CodeXHomeDir 'skills'

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Cleanup-Managed {
  param([string]$Directory)
  if (-not (Test-Path $Directory)) {
    return
  }

  Get-ChildItem -Path $Directory -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    if (Select-String -Path $_.FullName -Pattern [regex]::Escape($ManagedMarker) -Quiet) {
      Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
      $parent = Split-Path -Parent $_.FullName
      if ($parent -and ($parent -ne $Directory)) {
        $remaining = Get-ChildItem -Path $parent -Force -ErrorAction SilentlyContinue
        if (-not $remaining) {
          Remove-Item $parent -Force -ErrorAction SilentlyContinue
        }
      }
      Write-Host "    Removed: $($_.FullName)"
    }
  }
}

function Install-Claude {
  param([string]$SkillName)
  $src = Join-Path $CompiledDir "claude\$SkillName\SKILL.md"
  $destDir = Join-Path $ClaudeSkillsDir $SkillName
  Ensure-Directory $destDir
  Copy-Item $src (Join-Path $destDir 'SKILL.md') -Force
  Write-Host "    Claude:   $(Join-Path $destDir 'SKILL.md')"
}

function Install-Cursor {
  param([string]$SkillName)
  $srcRule = Join-Path $CompiledDir "cursor\rules\$SkillName.mdc"
  $srcSkill = Join-Path $CompiledDir "cursor\skills\$SkillName\SKILL.md"
  $destDir = Join-Path $CursorSkillsDir $SkillName
  Ensure-Directory $CursorRulesDir
  Ensure-Directory $destDir
  Copy-Item $srcRule (Join-Path $CursorRulesDir "$SkillName.mdc") -Force
  Copy-Item $srcSkill (Join-Path $destDir 'SKILL.md') -Force
  Write-Host "    Cursor (rule):  $(Join-Path $CursorRulesDir "$SkillName.mdc")"
  Write-Host "    Cursor (skill): $(Join-Path $destDir 'SKILL.md')"
}

function Install-Windsurf {
  param([string]$SkillName)
  $srcRule = Join-Path $CompiledDir "windsurf\rules\$SkillName.md"
  $srcSkill = Join-Path $CompiledDir "windsurf\skills\$SkillName\SKILL.md"
  $destDir = Join-Path $WindsurfSkillsDir $SkillName
  Ensure-Directory $WindsurfRulesDir
  Ensure-Directory $destDir
  Copy-Item $srcRule (Join-Path $WindsurfRulesDir "$SkillName.md") -Force
  Copy-Item $srcSkill (Join-Path $destDir 'SKILL.md') -Force
  Write-Host "    Windsurf (rule):  $(Join-Path $WindsurfRulesDir "$SkillName.md")"
  Write-Host "    Windsurf (skill): $(Join-Path $destDir 'SKILL.md')"
}

function Install-OpenCode {
  param([string]$SkillName)
  $src = Join-Path $CompiledDir "opencode\$SkillName.md"
  Ensure-Directory $OpenCodeAgentsDir
  Copy-Item $src (Join-Path $OpenCodeAgentsDir "$SkillName.md") -Force
  Write-Host "    OpenCode: $(Join-Path $OpenCodeAgentsDir "$SkillName.md")"
}

function Install-Codex {
  param([string]$SkillName)
  $src = Join-Path $CompiledDir "codex\$SkillName\SKILL.md"
  $destDir = Join-Path $CodeXSkillsDir $SkillName
  Ensure-Directory $destDir
  Copy-Item $src (Join-Path $destDir 'SKILL.md') -Force
  Write-Host "    Codex:    $(Join-Path $destDir 'SKILL.md')"
}

function Uninstall-Claude {
  foreach ($skill in $Skills) {
    Remove-Item (Join-Path $ClaudeSkillsDir $skill) -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host '    Claude:   removed'
}

function Uninstall-Cursor {
  foreach ($skill in $Skills) {
    Remove-Item (Join-Path $CursorRulesDir "$skill.mdc") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $CursorSkillsDir $skill) -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host '    Cursor:   removed'
}

function Uninstall-Windsurf {
  foreach ($skill in $Skills) {
    Remove-Item (Join-Path $WindsurfRulesDir "$skill.md") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $WindsurfSkillsDir $skill) -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host '    Windsurf: removed'
}

function Uninstall-OpenCode {
  foreach ($skill in $Skills) {
    Remove-Item (Join-Path $OpenCodeAgentsDir "$skill.md") -Force -ErrorAction SilentlyContinue
  }
  Write-Host '    OpenCode: removed'
}

function Uninstall-Codex {
  foreach ($skill in $Skills) {
    Remove-Item (Join-Path $CodeXSkillsDir $skill) -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host '    Codex:    removed'
}

function Get-DetectedTargets {
  $detected = New-Object System.Collections.Generic.List[string]
  if (Test-Path (Join-Path $HomeDir '.claude')) { [void]$detected.Add('claude') }
  if (Test-Path (Join-Path $HomeDir '.cursor')) { [void]$detected.Add('cursor') }
  if ((Test-Path (Join-Path $HomeDir '.windsurf')) -or (Test-Path (Join-Path $HomeDir '.codeium\windsurf'))) { [void]$detected.Add('windsurf') }
  if ((Test-Path (Join-Path $AppDataDir 'opencode')) -or (Test-Path (Join-Path $HomeDir '.opencode'))) { [void]$detected.Add('opencode') }
  if ($env:CODEX_HOME -or (Test-Path $CodeXHomeDir)) { [void]$detected.Add('codex') }
  return $detected.ToArray()
}

function Show-Help {
  Write-Host 'Usage: powershell -ExecutionPolicy Bypass -File .\install-local.ps1 [options]'
  Write-Host ''
  Write-Host 'Options:'
  Write-Host '  -Claude        Install skills for Claude Code'
  Write-Host '  -Cursor        Install skills for Cursor'
  Write-Host '  -Windsurf      Install skills for Windsurf'
  Write-Host '  -OpenCode      Install skills for OpenCode'
  Write-Host '  -Codex         Install skills for Codex'
  Write-Host '  -All           Install for all five tools'
  Write-Host '  -SkillsOnly    Skip npm install/build/link (just copy skills)'
  Write-Host '  -Uninstall     Remove installed skills from target tools'
  Write-Host '  -CompileOnly   Generate compiled output directory (no install)'
  Write-Host '  -Help          Show this help'
  Write-Host ''
  Write-Host 'No flags = auto-detect installed tools.'
}

if ($Help -or ($PassthroughArgs -contains '--help') -or ($PassthroughArgs -contains '-h')) {
  Show-Help
  exit 0
}

$targets = New-Object System.Collections.Generic.List[string]
if ($Claude -or ($PassthroughArgs -contains '--claude')) { [void]$targets.Add('claude') }
if ($Cursor -or ($PassthroughArgs -contains '--cursor')) { [void]$targets.Add('cursor') }
if ($Windsurf -or ($PassthroughArgs -contains '--windsurf')) { [void]$targets.Add('windsurf') }
if ($OpenCode -or ($PassthroughArgs -contains '--opencode')) { [void]$targets.Add('opencode') }
if ($Codex -or ($PassthroughArgs -contains '--codex')) { [void]$targets.Add('codex') }
if ($All -or ($PassthroughArgs -contains '--all')) {
  $targets.Clear()
  foreach ($target in @('claude', 'cursor', 'windsurf', 'opencode', 'codex')) {
    [void]$targets.Add($target)
  }
}
if ($PassthroughArgs -contains '--skills-only') { $SkillsOnly = $true }
if ($PassthroughArgs -contains '--uninstall') { $Uninstall = $true }
if ($PassthroughArgs -contains '--compile-only') { $CompileOnly = $true }

if ($CompileOnly) {
  Write-Host '==> Delegating to compile.mjs...'
  Push-Location $SkillDir
  try {
    Invoke-Checked 'node' @('skill/build/compile.mjs')
  }
  finally {
    Pop-Location
  }
  exit 0
}

if ($targets.Count -eq 0) {
  foreach ($target in Get-DetectedTargets) {
    [void]$targets.Add($target)
  }
}

if ($targets.Count -eq 0) {
  Write-Error 'No supported tools detected. Use -Claude, -Cursor, -Windsurf, -OpenCode, -Codex, or -All.'
}

if ($Uninstall) {
  Write-Host "==> Uninstalling $ProjectName"
  Write-Host "    Targets: $($targets -join ' ')"
  Write-Host ''

  foreach ($target in $targets) {
    switch ($target) {
      'claude' { Uninstall-Claude }
      'cursor' { Uninstall-Cursor }
      'windsurf' { Uninstall-Windsurf }
      'opencode' { Uninstall-OpenCode }
      'codex' { Uninstall-Codex }
    }
  }

  Write-Host "--> Removing $CliBinName CLI..."
  try {
    & npm unlink $ProjectName *> $null
  }
  catch {
  }

  $command = Get-Command $CliBinName -ErrorAction SilentlyContinue
  if ($command) {
    Write-Host "    WARNING: $CliBinName still in PATH at $($command.Source)"
  }
  else {
    Write-Host "    $CliBinName removed"
  }

  Write-Host ''
  Write-Host '==> Done. Skills and CLI removed.'
  exit 0
}

Write-Host "==> $ProjectName setup"
Write-Host "    Project: $SkillDir"
Write-Host "    Targets: $($targets -join ' ')"
Write-Host ''

Push-Location $SkillDir
try {
  if (-not $SkillsOnly) {
    Write-Host '--> Installing dependencies...'
    Invoke-Checked 'npm' @('install')

    Write-Host '--> Cleaning previous build...'
    Remove-Item (Join-Path $SkillDir 'dist') -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host '--> Building TypeScript...'
    Invoke-Checked 'npm' @('run', 'build')

    $cliEntry = Join-Path $SkillDir 'dist\cli\index.js'
    if (Test-Path $cliEntry) {
      Write-Host "    Built CLI entry: $cliEntry"
    }

    Write-Host '--> Compiling skills...'
    Invoke-Checked 'npm' @('run', 'compile')

    Write-Host "--> Installing $CliBinName CLI globally..."
    Invoke-Checked 'npm' @('link')

    $npmBin = Join-Path ((& npm prefix -g).Trim()) 'bin'
    $command = Get-Command $CliBinName -ErrorAction SilentlyContinue
    if ($command) {
      Write-Host "    $CliBinName: $($command.Source)"
      $versionOutput = & $CliBinName --version 2>$null
      if ($LASTEXITCODE -eq 0 -and $versionOutput) {
        Write-Host "    version:  $versionOutput"
      }
    }
    else {
      Write-Host "    WARNING: $CliBinName not found in PATH after npm link."
      Write-Host "    npm global bin: $npmBin"
    }
  }

  Write-Host "--> Cleaning stale $ProjectName files..."
  foreach ($target in $targets) {
    switch ($target) {
      'claude' { Cleanup-Managed $ClaudeSkillsDir }
      'cursor' { Cleanup-Managed $CursorRulesDir; Cleanup-Managed $CursorSkillsDir }
      'windsurf' { Cleanup-Managed $WindsurfRulesDir; Cleanup-Managed $WindsurfSkillsDir }
      'opencode' { Cleanup-Managed $OpenCodeAgentsDir }
      'codex' { Cleanup-Managed $CodeXSkillsDir }
    }
  }

  Write-Host '--> Installing skills...'
  foreach ($skill in $Skills) {
    Write-Host "  ${skill}:"
    foreach ($target in $targets) {
      switch ($target) {
        'claude' { Install-Claude $skill }
        'cursor' { Install-Cursor $skill }
        'windsurf' { Install-Windsurf $skill }
        'opencode' { Install-OpenCode $skill }
        'codex' { Install-Codex $skill }
      }
    }
  }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host '==> Done.'
Write-Host ''
Write-Host "Skills installed for: $($targets -join ' ')"
Write-Host "CLI available as: $CliBinName"
