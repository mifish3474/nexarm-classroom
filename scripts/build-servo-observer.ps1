<# Offline compile/audit only; deliberately has no upload or COM-port option. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoDirectory '.analysis/arduino-cli.exe'
$config = Join-Path $repoDirectory '.analysis/arduino-cli.json'
$compiler = Join-Path $repoDirectory '.analysis/tc/bin'
$output = Join-Path $repoDirectory '.analysis/observer-build'
if ((Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash -ne '1017DE89179C3167E6B8A38CA6CC4091FA69A3CF97AAFA7810F01423003F5571') { throw 'Arduino CLI differs from the reviewed v1.5.1 executable.' }
$guards = @('esp_partition_write', 'esp_partition_write_raw', 'esp_partition_erase_range', 'esp_flash_write', 'esp_flash_erase_region', 'spi_flash_write', 'spi_flash_write_encrypted', 'spi_flash_erase_range', 'spi_flash_erase_sector')
# --undefined retains all guards so the audit can verify every expected symbol.
$guardFlags = ($guards | ForEach-Object { '-Wl,--wrap=' + $_ + ',--undefined=__wrap_' + $_ }) -join ' '
$compilerPath = $compiler.Replace('\', '/') + '/'
& $cli compile --config-file $config --fqbn esp32:esp32:esp32:PartitionScheme=huge_app --build-property ('compiler.path=' + $compilerPath) --build-property 'compiler.cpp.extra_flags=-DSERVO_OBSERVER_FLASH_GUARDS=1' --build-property ('compiler.c.elf.extra_flags=' + $guardFlags) --build-path $output --warnings all (Join-Path $repoDirectory 'firmware/servo-observer')
if ($LASTEXITCODE -ne 0) { throw 'Observer compilation failed.' }
$symbols = & (Join-Path $compiler 'xtensa-esp32-elf-nm.exe') -C (Join-Path $output 'servo-observer.ino.elf')
if ($LASTEXITCODE -ne 0) { throw 'Could not audit observer symbols.' }
if ($symbols | Select-String '\b(initArduino\(\)|nvs_flash_init)\s*$') { throw 'Unexpected NVS/Arduino startup linked into observer.' }
foreach ($guard in $guards) {
    if (-not ($symbols | Select-String ('\bT __wrap_' + $guard + '$'))) { throw "Missing flash guard: $guard" }
    if ($symbols | Select-String ('\b[Tt] ' + $guard + '$')) { throw "Unwrapped flash writer remains: $guard" }
}
$sourceHashes = [ordered]@{}
foreach ($name in @('servo-observer.ino', 'FlashWriteGuards.cpp')) {
    $sourceHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $repoDirectory ('firmware/servo-observer/' + $name)) -Algorithm SHA256).Hash
}
[ordered]@{
    compiledAtUtc = [DateTime]::UtcNow.ToString('o')
    arduinoCli = '1.5.1'
    core = 'esp32:esp32@2.0.12'
    board = 'esp32:esp32:esp32:PartitionScheme=huge_app'
    binarySha256 = (Get-FileHash -LiteralPath (Join-Path $output 'servo-observer.ino.bin') -Algorithm SHA256).Hash
    sourceSha256 = $sourceHashes
    guardedFlashApis = $guards
    standardArduinoNvsStartupAbsent = $true
    hardwareTested = $false
    firmwareWriteApproved = $false
} | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $output 'build-audit.json')
Write-Output 'Offline compile and flash/startup symbol audit passed. No firmware was installed.'
