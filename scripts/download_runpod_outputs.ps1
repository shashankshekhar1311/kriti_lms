#Requires -Version 5.1
<#
.SYNOPSIS
  Incrementally download Kriti Rendered_Output videos from a RunPod pod (Windows).

.DESCRIPTION
  Pull-only, non-destructive downloader. Uses Windows OpenSSH (ssh + scp).
  Default: MP4 files only. Optional -AllArtifacts for the full output tree.
  Never deletes local or remote files. Never modifies the RunPod project.

.PARAMETER RemoteHost
  RunPod SSH hostname or IP. Alias: -Host
  Env fallback: KRITI_RUNPOD_HOST

.PARAMETER Port
  SSH port. Env fallback: KRITI_RUNPOD_PORT (default 22)

.PARAMETER User
  SSH user (default root). Env fallback: KRITI_RUNPOD_USER

.PARAMETER RemotePath
  Absolute remote Rendered_Output directory.
  Default / env: KRITI_RUNPOD_REMOTE_OUTPUT or /workspace/kriti_lms/Rendered_Output

.PARAMETER LocalPath
  Local Windows destination root.
  Default / env: KRITI_LOCAL_OUTPUT or E:\Kriti\Rendered_Output

.PARAMETER IdentityFile
  Optional path to an SSH private key (-i). Prefer agent/ssh-config when omitted.

.PARAMETER AllArtifacts
  Download all files under RemotePath (not only *.mp4).

.PARAMETER DryRun
  Show planned transfers; do not copy anything.

.EXAMPLE
  .\scripts\download_runpod_outputs.ps1 -Host "1.2.3.4" -Port 12345 -User root

.EXAMPLE
  .\scripts\download_runpod_outputs.ps1 -RemoteHost "..." -Port 12345 -IdentityFile "$env:USERPROFILE\.ssh\id_ed25519" -DryRun
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [Alias('Host')]
    [string]$RemoteHost = $(if ($env:KRITI_RUNPOD_HOST) { $env:KRITI_RUNPOD_HOST } else { '' }),

    [Parameter(Mandatory = $false)]
    [int]$Port = $(if ($env:KRITI_RUNPOD_PORT) { [int]$env:KRITI_RUNPOD_PORT } else { 22 }),

    [Parameter(Mandatory = $false)]
    [string]$User = $(if ($env:KRITI_RUNPOD_USER) { $env:KRITI_RUNPOD_USER } else { 'root' }),

    [Parameter(Mandatory = $false)]
    [string]$RemotePath = $(if ($env:KRITI_RUNPOD_REMOTE_OUTPUT) { $env:KRITI_RUNPOD_REMOTE_OUTPUT } else { '/workspace/kriti_lms/Rendered_Output' }),

    [Parameter(Mandatory = $false)]
    [string]$LocalPath = $(if ($env:KRITI_LOCAL_OUTPUT) { $env:KRITI_LOCAL_OUTPUT } else { 'E:\Kriti\Rendered_Output' }),

    [Parameter(Mandatory = $false)]
    [string]$IdentityFile = '',

    [switch]$AllArtifacts,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Header {
    Write-Host '=============================================='
    Write-Host '  KRITI RUNPOD OUTPUT DOWNLOADER'
    Write-Host '=============================================='
    Write-Host ''
}

function Write-Pass([string]$Message) { Write-Host "[PASS] $Message" }
function Write-Info([string]$Message) { Write-Host "[INFO] $Message" }
function Write-Fail([string]$Message) { Write-Host "[FAIL] $Message" }

function Get-CommandPath([string]$Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

function New-SshArgumentList {
    param(
        [int]$SshPort,
        [string]$KeyFile
    )
    # Common options for non-interactive RunPod pulls
    $args = @(
        '-p', "$SshPort",
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=20'
    )
    if ($KeyFile -and $KeyFile.Trim().Length -gt 0) {
        if (-not (Test-Path -LiteralPath $KeyFile)) {
            throw "IdentityFile not found: $KeyFile"
        }
        $args += @('-i', $KeyFile)
    }
    return $args
}

function New-ScpArgumentList {
    param(
        [int]$SshPort,
        [string]$KeyFile
    )
    # scp uses -P for port (capital P)
    $args = @(
        '-P', "$SshPort",
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=20'
    )
    if ($KeyFile -and $KeyFile.Trim().Length -gt 0) {
        $args += @('-i', $KeyFile)
    }
    return $args
}

function Invoke-RemoteCommand {
    param(
        [string]$SshExe,
        [string[]]$SshArgs,
        [string]$Target,
        [string]$RemoteCommand
    )
    $allArgs = @()
    $allArgs += $SshArgs
    $allArgs += @($Target, $RemoteCommand)
    $output = & $SshExe @allArgs 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        $text = ($output | Out-String).Trim()
        throw "SSH command failed (exit $code): $text"
    }
    return ($output | ForEach-Object { "$_" })
}

Write-Header

if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    Write-Fail 'Remote host is required. Pass -Host / -RemoteHost or set KRITI_RUNPOD_HOST.'
    Write-Host 'See docs/RUNPOD_SSH.md for setup.'
    exit 1
}

$modeLabel = if ($AllArtifacts) { 'All artifacts' } else { 'MP4 only' }
Write-Host 'Remote:'
Write-Host ("  {0}@{1}:{2}:{3}" -f $User, $RemoteHost, $Port, $RemotePath)
Write-Host ''
Write-Host 'Local:'
Write-Host ("  {0}" -f $LocalPath)
Write-Host ''
Write-Host 'Mode:'
Write-Host ("  {0}" -f $modeLabel)
if ($DryRun) {
    Write-Host '  DryRun: yes (no files will be transferred)'
}
Write-Host ''

# --- Tooling checks (native Windows OpenSSH; no WSL/Cygwin required) ---
$sshExe = Get-CommandPath 'ssh'
$scpExe = Get-CommandPath 'scp'
if (-not $sshExe) {
    Write-Fail 'ssh.exe not found. Install the Windows OpenSSH Client optional feature.'
    exit 1
}
Write-Pass "SSH executable found ($sshExe)"
if (-not $scpExe) {
    Write-Fail 'scp.exe not found. Install the Windows OpenSSH Client optional feature.'
    exit 1
}
Write-Pass "SCP executable found ($scpExe)"

$sshArgs = New-SshArgumentList -SshPort $Port -KeyFile $IdentityFile
$scpArgs = New-ScpArgumentList -SshPort $Port -KeyFile $IdentityFile
$target = '{0}@{1}' -f $User, $RemoteHost

# Quote remote path for bash on the pod (handles spaces)
$remoteQuoted = "'" + ($RemotePath.Replace("'", "'\''")) + "'"

try {
    $null = Invoke-RemoteCommand -SshExe $sshExe -SshArgs $sshArgs -Target $target `
        -RemoteCommand ("test -d {0} && echo KRITI_REMOTE_OK" -f $remoteQuoted)
    Write-Pass 'Remote connection successful'
}
catch {
    Write-Fail ("Remote connection failed: {0}" -f $_.Exception.Message)
    Write-Host 'Check host/port, that the pod is running, and SSH key authentication.'
    exit 1
}

# List remote files: SIZE<TAB>MTIME_EPOCH<TAB>RELATIVE_PATH (path relative to RemotePath)
# Prefer find -printf (GNU find on Linux RunPod).
if ($AllArtifacts) {
    $findCmd = ("find {0} -type f -printf '%s\t%T@\t%P\n'" -f $remoteQuoted)
}
else {
    $findCmd = ("find {0} -type f -name '*.mp4' -printf '%s\t%T@\t%P\n'" -f $remoteQuoted)
}

try {
    $listLines = Invoke-RemoteCommand -SshExe $sshExe -SshArgs $sshArgs -Target $target -RemoteCommand $findCmd
}
catch {
    Write-Fail ("Failed to list remote files: {0}" -f $_.Exception.Message)
    exit 1
}

$entries = @()
foreach ($line in $listLines) {
    $trim = ("$line").Trim()
    if ([string]::IsNullOrWhiteSpace($trim)) { continue }
    if ($trim -eq 'KRITI_REMOTE_OK') { continue }
    $parts = $trim.Split([char]9, 3)
    if ($parts.Count -lt 3) { continue }
    $size = 0L
    [void][long]::TryParse($parts[0], [ref]$size)
    $rel = $parts[2].Replace('/', '\').TrimStart('\')
    if ([string]::IsNullOrWhiteSpace($rel)) { continue }
    $entries += [pscustomobject]@{
        Size     = $size
        Relative = $rel
        RemoteRelPosix = $parts[2].TrimStart('/')
    }
}

Write-Info ("Found {0} remote file(s) to consider" -f $entries.Count)

if (-not (Test-Path -LiteralPath $LocalPath)) {
    if ($DryRun) {
        Write-Info ("Would create local directory: {0}" -f $LocalPath)
    }
    else {
        New-Item -ItemType Directory -Path $LocalPath -Force | Out-Null
        Write-Info ("Created local directory: {0}" -f $LocalPath)
    }
}

$downloaded = 0
$updated = 0
$skipped = 0
$failed = 0

foreach ($entry in $entries) {
    $localFile = Join-Path $LocalPath $entry.Relative
    $localDir = Split-Path -Parent $localFile
    $action = 'download'  # download | update | skip

    if (Test-Path -LiteralPath $localFile) {
        $localSize = (Get-Item -LiteralPath $localFile).Length
        if ($localSize -eq $entry.Size) {
            $action = 'skip'
        }
        else {
            $action = 'update'
        }
    }

    $displayRel = $entry.Relative
    if ($action -eq 'skip') {
        $skipped++
        continue
    }

    Write-Info ("{0}:" -f ($(if ($action -eq 'update') { 'Updating' } else { 'Downloading' })))
    Write-Host ("       {0}" -f $displayRel)

    if ($DryRun) {
        if ($action -eq 'update') { $updated++ } else { $downloaded++ }
        continue
    }

    try {
        if (-not (Test-Path -LiteralPath $localDir)) {
            New-Item -ItemType Directory -Path $localDir -Force | Out-Null
        }

        # Build remote scp source. Quote the path after the colon so spaces work
        # with Windows OpenSSH scp (user@host:"/abs/path/file name.mp4").
        $remoteFilePosix = ($RemotePath.TrimEnd('/') + '/' + $entry.RemoteRelPosix)
        $remoteSpec = '{0}:"{1}"' -f $target, ($remoteFilePosix.Replace('"', '\"'))

        $scpAll = @()
        $scpAll += $scpArgs
        $scpAll += @($remoteSpec, $localFile)

        & $scpExe @scpAll
        if ($LASTEXITCODE -ne 0) {
            throw "scp exited with code $LASTEXITCODE"
        }

        if (-not (Test-Path -LiteralPath $localFile)) {
            throw 'Local file missing after scp'
        }
        $finalSize = (Get-Item -LiteralPath $localFile).Length
        if ($finalSize -ne $entry.Size) {
            throw ("Size mismatch after transfer (remote={0} local={1})" -f $entry.Size, $finalSize)
        }

        if ($action -eq 'update') { $updated++ } else { $downloaded++ }
    }
    catch {
        $failed++
        Write-Fail ("Transfer failed for {0}: {1}" -f $displayRel, $_.Exception.Message)
        Write-Host ''
        Write-Host '=============================================='
        Write-Host '  DOWNLOAD FAILED'
        Write-Host '=============================================='
        Write-Host ("Downloaded: {0}" -f $downloaded)
        Write-Host ("Updated:    {0}" -f $updated)
        Write-Host ("Skipped:    {0}" -f $skipped)
        Write-Host ("Failed:     {0}" -f $failed)
        Write-Host '=============================================='
        exit 1
    }
}

Write-Host ''
Write-Host '=============================================='
if ($DryRun) {
    Write-Host '  DRY RUN COMPLETE'
}
else {
    Write-Host '  DOWNLOAD COMPLETE'
}
Write-Host '=============================================='
Write-Host ("Downloaded: {0}" -f $downloaded)
Write-Host ("Updated:    {0}" -f $updated)
Write-Host ("Skipped:    {0}" -f $skipped)
Write-Host ("Failed:     {0}" -f $failed)
Write-Host '=============================================='

if ($failed -gt 0) {
    exit 1
}
exit 0
