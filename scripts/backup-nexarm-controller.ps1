<#
Offline plan by default. -Execute requires a separately approved controller
restart with the arm supported. This reads ESP32 flash, not AT32 or servo NVM.
No erase, flash write, fuse write, application command or automatic restart.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM[1-9][0-9]*$')]
    [string]$Port,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$analysisDirectory = Join-Path $repoDirectory '.analysis'
$backupTool = Join-Path $analysisDirectory 'esptool-v5.6.0.exe'
$expectedToolHash = '7A4FC0B651197D8034DAB52DB1468EBF5C009D8E754306E59C7DE0AA47767914'
if (-not (Test-Path -LiteralPath $backupTool -PathType Leaf)) {
    throw 'The reviewed Espressif v5.6.0 backup tool must be prepared in .analysis first.'
}
if ((Get-FileHash -LiteralPath $backupTool -Algorithm SHA256).Hash -ne $expectedToolHash) {
    throw 'Backup tool differs from the reviewed executable. Stop and review it.'
}

Write-Output 'Plan: two complete ESP32 flash reads at 115200 baud, then compare length and SHA256.'
Write-Output 'Each read enters the bootloader using default-reset; no-reset leaves it there afterward.'
Write-Output 'Holding may be interrupted. Support the arm, close robot apps, and approve this restart before Execute.'
Write-Output 'The standard tool may load a helper into RAM. No flash writes or erases are requested.'
Write-Output 'Backups/logs remain local under ignored .analysis and may contain credentials or saved programs.'
Write-Output 'This does not back up the AT32 processor or settings stored inside the servos.'
if (-not $Execute) {
    Write-Output 'PLAN ONLY: no serial port opened and no backup files created.'
    return
}

$backupName = 'controller-backup-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N')
$backupDirectory = Join-Path $analysisDirectory $backupName
New-Item -ItemType Directory -Path $backupDirectory | Out-Null
$readHashes = @()
$readLengths = @()
foreach ($readNumber in @(1, 2)) {
    $backupFile = Join-Path $backupDirectory ('esp32-read-' + $readNumber + '.bin')
    $logFile = Join-Path $backupDirectory ('esp32-read-' + $readNumber + '.log')
    # Fixed read-only command: caller cannot inject alternate esptool operations.
    # Windows PowerShell turns native stderr into error records. Preserve the
    # full message and exit code instead of terminating on its first line.
    $savedErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $backupTool --chip esp32 --port $Port --baud 115200 --before default-reset --after no-reset read-flash 0 ALL $backupFile 2>&1 |
            Tee-Object -FilePath $logFile
        $readExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $savedErrorPreference
    }
    if ($readExitCode -ne 0) {
        throw "Read $readNumber failed. No retry or recovery command was sent; preserve $backupDirectory for review."
    }
    $backupInfo = Get-Item -LiteralPath $backupFile
    if ($backupInfo.Length -le 0) { throw 'Backup is empty; stop for review.' }
    $readLengths += $backupInfo.Length
    $readHashes += (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash
}
if ($readLengths[0] -ne $readLengths[1] -or $readHashes[0] -ne $readHashes[1]) {
    throw 'The two reads differ. Do not flash; preserve both files for review.'
}
[ordered]@{
    capturedAtUtc = [DateTime]::UtcNow.ToString('o')
    tool = 'Espressif esptool v5.6.0'
    toolSha256 = $expectedToolHash
    bytesPerRead = $readLengths[0]
    sha256PerRead = $readHashes
    matchingReads = $true
    scope = 'ESP32 flash only; AT32, servo NVM and successful restore are not verified.'
} | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 (Join-Path $backupDirectory 'manifest.json')
Write-Output "Two matching copies saved to $backupDirectory."
Write-Output 'The ESP32 is intentionally left in the bootloader. Do not restart or flash until the supported-arm recovery step is reviewed.'
