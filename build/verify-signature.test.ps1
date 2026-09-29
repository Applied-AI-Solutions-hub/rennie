$ErrorActionPreference = 'Stop'
$fixtureDir = Join-Path ([IO.Path]::GetTempPath()) ('foxsocket-signature-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $fixtureDir | Out-Null
$fixture = Join-Path $fixtureDir 'unsigned.ps1'
$report = Join-Path $fixtureDir 'report.jsonl'
Set-Content -LiteralPath $fixture -Value '# unsigned regression fixture'
try {
    $rejected = $false
    try { & "$PSScriptRoot/verify-signature.ps1" -Path $fixture -ReportPath $report -ExpectedPublisher 'Example' }
    catch {
        if ($_.Exception.Message -notlike '*Signature rejected*NotSigned*') { throw }
        $rejected = $true
    }
    if (-not $rejected) { throw 'An unsigned file passed verification' }
    if (Test-Path -LiteralPath $report) { throw 'Rejected signature produced success evidence' }
    Write-Host 'Unsigned artifact rejected; no success evidence written.'
} finally {
    Remove-Item -LiteralPath $fixture -Force
    if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report -Force }
    Remove-Item -LiteralPath $fixtureDir
}
