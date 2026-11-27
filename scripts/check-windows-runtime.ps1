param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath
)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $ExePath).Path

# Run from a Visual Studio developer shell (also configured in Windows CI).
$imports = & dumpbin /nologo /dependents $exe 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect DLL dependencies for $exe"
}
$dlls = @($imports | ForEach-Object {
    if ($_ -match '^\s*([\w.+-]+\.dll)\s*$') { $Matches[1] }
})
if ($dlls.Count -eq 0) {
    throw 'No DLL imports found; dependency inspection did not succeed.'
}
$unbundled = @($dlls | Where-Object {
    $_ -match '^(libunwind|libgcc.*|libstdc\+\+.*|libwinpthread.*|msvcp\d.*|vcruntime\d.*|concrt\d.*)\.dll$'
})
if ($unbundled.Count -gt 0) {
    throw "Executable depends on unbundled compiler runtimes: $($unbundled -join ', ')"
}
Write-Host "DLL dependency check passed: $($dlls -join ', ')"

# Compiler DLLs on the developer/runner PATH must not mask a startup failure.
$previousPath = $env:PATH
$process = $null
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru
    if ($process.WaitForExit(15000)) {
        throw "Application exited during startup (exit code $($process.ExitCode))."
    }
    Write-Host 'Application stayed running for the 15-second startup check.'
} finally {
    $env:PATH = $previousPath
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}
