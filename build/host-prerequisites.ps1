# Shared by the installer setup window and its isolated tests. No work on import.
function Get-HostSetupAction($State, [string[]]$Distros, [string]$Boot, [bool]$RestartPending) {
    if ($State.phase -eq 'restart' -and $State.boot -eq $Boot) { return 'restart' }
    if ($State.ownsUbuntu -and $Distros -contains 'Ubuntu-24.04') { return 'initialize' }
    if ($Distros.Count -gt 0) { return 'existing' }
    if ($RestartPending) { return 'restart' }
    if ($State.phase -eq 'restart' -and $State.boot -ne $Boot) { return 'install' }
    if ($State.phase -in @('install', 'initialize')) { return 'install' }
    return 'windows'
}

function Get-WslProblem([string]$Output, $Code = $null, $Default = $null) {
    # WSL and Windows Update print well-known error codes. Turn the common ones
    # into an instruction a beginner can follow, instead of a generic failure.
    $text = [string]$Output
    # Exit codes arrive as Int32 from a process, or as text from a caller. X8 on a
    # negative Int32 prints its two's-complement HRESULT (for example 80070070).
    $number = 0
    if ($null -ne $Code -and [int32]::TryParse([string]$Code, [ref]$number) -and $number -lt 0) { $text += ' 0x{0:X8}' -f $number }
    $known = [ordered]@{
        '0x80370102|HCS_E_HYPERV_NOT_INSTALLED' = 'Virtualization is turned off. Turn on virtualization (often called SVM, VT-x or Intel Virtualization Technology) in this PC''s BIOS/UEFI settings, then restart Windows and choose Try again.'
        '0x8007019e' = 'The Windows feature that runs Linux is not active yet. Restart Windows, then choose Try again.'
        '0x800701bc' = 'The Windows Linux kernel needs an update. Make sure Windows Update has finished, restart Windows, then choose Try again.'
        '0x80070070' = 'The disk is full. Free up space (for example, empty the Recycle Bin), then choose Try again.'
        '0x80072ee7|0x80072efd' = 'Windows could not reach the download server. Check the internet connection, then choose Try again.'
        '0x80072f8f' = 'A secure connection could not be made. Check that the Windows date and time are correct, then choose Try again.'
    }
    foreach ($pattern in $known.Keys) { if ($text -match "(?i)($pattern)") { return $known[$pattern] } }
    return $Default
}

function Get-HostSetupResumeCommand([string]$PowerShell, [string]$Script, [string]$AppPath) {
    # Paths are Windows filenames, passed as arguments, never interpolated into code.
    foreach ($value in @($PowerShell, $Script, $AppPath)) {
        if ($value -match '["\r\n]') { throw 'Invalid setup path.' }
    }
    return ('"{0}" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}" -AppPath "{2}"' -f $PowerShell, $Script, $AppPath)
}

function Get-HostSetupLinuxScript {
    # Only used for a distro created by this setup. No password or broad sudo grant.
    return @'
set -eu
if ! id foxsocket >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash foxsocket
fi
test "$(id -u foxsocket)" != 0
python3 - <<'PY'
import configparser, os
p = '/etc/wsl.conf'
c = configparser.ConfigParser()
c.read(p)
for section in ('boot', 'user'):
    if not c.has_section(section): c.add_section(section)
c.set('boot', 'systemd', 'true')
c.set('user', 'default', 'foxsocket')
with open(p + '.foxsocket.tmp', 'w') as f: c.write(f)
os.replace(p + '.foxsocket.tmp', p)
PY
'@
}
