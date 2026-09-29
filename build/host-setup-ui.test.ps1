# Render the actual setup window without running any prerequisite operations.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$source = Get-Content (Join-Path $PSScriptRoot 'host-setup.ps1') -Raw
$start = $source.IndexOf('$form = New-Object Windows.Forms.Form')
$end = $source.IndexOf('$form.Add_Shown')
Invoke-Expression $source.Substring($start, $end - $start)
$destination = Join-Path $PSScriptRoot '..\.qa'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
try {
    $form.StartPosition = 'Manual'
    $form.Location = New-Object Drawing.Point(-10000, -10000)
    $form.ShowInTaskbar = $false
    $form.Show()
    [Windows.Forms.Application]::DoEvents()
    $bitmap = New-Object Drawing.Bitmap($form.Width, $form.Height)
    $form.DrawToBitmap($bitmap, (New-Object Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
    $bitmap.Save((Join-Path $destination 'host-setup-window.png'))
    $bitmap.Dispose()
    Write-Output 'PASS: setup window rendered without running Windows or Ubuntu installation.'
} finally { $form.Dispose() }
