$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$errors=$null; $tokens=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'host-setup.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Helper syntax error'}
$node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Invoke-SetupProcess'},$true)
Invoke-Expression $node.Extent.Text
$activity=New-Object Windows.Forms.ProgressBar
$elapsed=New-Object Windows.Forms.Label
$log=New-Object Windows.Forms.TextBox
try {
    $result=Invoke-SetupProcess (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') '-NoProfile -Command "Write-Output ''download 50%''; Start-Sleep -Milliseconds 200; [Console]::Error.WriteLine(''diagnostic''); Write-Output ''done''"' -TimeoutSeconds 10
    if($result.code -ne 0 -or $result.output -notmatch 'download 50%' -or $result.output -notmatch 'diagnostic' -or $log.Text -notmatch 'done'){throw 'Streaming output was not captured'}
    Write-Output 'PASS: live stdout/stderr progress and process completion without installing prerequisites.'
} finally {$activity.Dispose();$elapsed.Dispose();$log.Dispose()}
