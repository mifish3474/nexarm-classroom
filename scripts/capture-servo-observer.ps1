<# Use ONLY after approved installation and verification of the guarded observer.
No reset/upload operation. Default CAPTURE sends no downstream servo request.
Opening a USB serial port may affect control lines; keep the arm supported.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM[1-9][0-9]*$')]
    [string]$Port,
    [ValidateRange(0, 6)]
    [int]$Joint = 0
)
$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $repoDirectory '.analysis'
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) { throw 'Missing local analysis directory.' }
$connection = [IO.Ports.SerialPort]::new($Port, 115200, [IO.Ports.Parity]::None, 8, [IO.Ports.StopBits]::One)
$connection.DtrEnable = $false
$connection.RtsEnable = $false
$connection.ReadTimeout = 100
$connection.WriteTimeout = 1000
$connection.NewLine = "`n"
$line = [Text.StringBuilder]::new()
$handshake = $false
$complete = $false
$captureStarted = $false
$lines = [Collections.Generic.List[string]]::new()
$receivedCharacters = 0
$clock = [Diagnostics.Stopwatch]::StartNew()
try {
    $connection.Open()
    # This text is specific to the verified observer; never use on factory firmware.
    $connection.WriteLine('INFO')
    while ($clock.ElapsedMilliseconds -lt 8000 -and -not $complete) {
        try { $character = $connection.ReadChar() }
        catch [TimeoutException] { continue }
        ++$receivedCharacters
        if ($receivedCharacters -gt 131072) { throw 'Capture exceeded the local input bound.' }
        if ($character -eq 13) { continue }
        if ($character -ne 10) {
            if ($line.Length -ge 512) { throw 'Unexpected oversized observer line.' }
            [void]$line.Append([char]$character)
            continue
        }
        $text = $line.ToString()
        [void]$line.Clear()
        if (-not $handshake) {
            if ($text.StartsWith('NEXARM_OBSERVER_1_GUARDED;')) {
                $handshake = $true
                if ($Joint -eq 0) { $connection.WriteLine('CAPTURE') }
                else { $connection.WriteLine('POS ' + $Joint) }
                $captureStarted = $true
            }
            continue
        }
        if ($text.StartsWith('ERR ')) { throw $text }
        if (-not $text.StartsWith('{')) { continue }
        $record = $text | ConvertFrom-Json
        if ($record.kind -notin @('begin', 'rx', 'end')) { throw 'Unexpected observer record.' }
        $lines.Add($text)
        if ($record.kind -eq 'end') { $complete = $true }
    }
    if (-not $complete) { throw 'Observer did not finish within eight seconds; no retry sent.' }
    $outputFile = Join-Path $outputDirectory ('servo-observer-capture-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N') + '.jsonl')
    $file = [IO.File]::Open($outputFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $writer = [IO.StreamWriter]::new($file, [Text.UTF8Encoding]::new($false))
        try { foreach ($captureLine in $lines) { $writer.WriteLine($captureLine) } }
        finally { $writer.Dispose() }
    }
    finally { $file.Dispose() }
    Write-Output "Capture saved locally to $outputFile"
}
finally {
    if ($connection.IsOpen) {
        if ($captureStarted -and -not $complete) {
            try { $connection.WriteLine('STOP') } catch { }
        }
        $connection.Close()
    }
    $connection.Dispose()
}
