$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\build\host-prerequisites.ps1')
function Assert($Condition, [string]$Message) { if (!$Condition) { throw $Message } }
$errors = $null; $tokens = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\..\build\host-setup.ps1'), [ref]$tokens, [ref]$errors)
Assert ($errors.Count -eq 0) 'Setup helper must parse in Windows PowerShell.'
# Persisted identifiers are an upgrade contract with already-saved resume scripts.
# Execute only the directory assignment with a synthetic root, never the helper.
$directoryAssignment = $ast.Find({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$setupDir' }, $true)
$savedLocalAppData = $env:LOCALAPPDATA
try {
    $env:LOCALAPPDATA = 'C:\Rennie upgrade fixture'
    Invoke-Expression $directoryAssignment.Extent.Text
    Assert ($setupDir -eq 'C:\Rennie upgrade fixture\Foxsocket\HostSetup') 'Upgrade must read the progress directory used by the old resume helper.'
} finally { $env:LOCALAPPDATA = $savedLocalAppData }
$helperSource = $ast.Extent.Text
Assert ($helperSource.Contains("'Local\FoxsocketHostSetup-'")) 'Old and new helpers must share the per-user mutex.'
Assert ($helperSource.Contains("New-ItemProperty -Path `$runKey -Name 'FoxsocketHostSetup'")) 'Resume must replace the existing Run value rather than add a second launcher.'
# Load functions only. Never run the UI, registry writes, WSL or elevation.
foreach ($name in @('Start-HostSetup', 'Require-Success', 'Request-Restart')) {
    $node = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
    Invoke-Expression $node.Extent.Text
}
function Reset-Fixture {
    $script:progress = @{ phase = 'start'; boot = ''; ownsUbuntu = $false }
    $script:registered = @(); $script:calls = @(); $script:resume = $false
    $script:failInstall = $false; $script:denyWindows = $false; $script:badIdentity = $false; $script:legacyRegistration = $false
    $script:action = @{ Text = '' }; $script:nextAction = 'setup'
    $script:log = New-Object PSObject
    $script:log | Add-Member ScriptMethod AppendText { param($text) }
    $script:wsl = 'wsl.exe'; $script:powerShell = 'powershell.exe'
}
function Get-CimInstance { return @{ LastBootUpTime = [datetime]'2026-09-22T08:00:00Z' } }
function Test-Path { return $false }
function Get-Distros { return $script:registered }
function Get-UbuntuLauncher { return 'C:\Program Files\WindowsApps\Ubuntu\ubuntu2404.exe' }
function Save-Progress { }
function Set-Resume([bool]$Enabled) { $script:resume = $Enabled }
function Write-Stage([string]$Text) { }
function Invoke-SetupProcess([string]$Exe, [string]$Arguments, [string]$InputText='', [switch]$Elevate, [int]$TimeoutSeconds=1800) {
    $script:calls += @{ exe=$Exe; args=$Arguments; elevated=[bool]$Elevate; input=$InputText }
    if ($Elevate -and $script:denyWindows) { throw 'Permission declined' }
    if ($Arguments -like '--install -d*') {
        if ($script:failInstall) { return @{code=1;output='Download failed'} }
        if (!$script:legacyRegistration) { $script:registered = @('Ubuntu-24.04') }
    }
    if ($Arguments -eq 'install --root') { $script:registered = @('Ubuntu-24.04') }
    if ($Arguments -like '*id -un*') {
        if ($script:badIdentity) { return @{code=0;output="root`nsystemd"} }
        return @{code=0;output="rennie`nsystemd"}
    }
    return @{code=0;output=''}
}

Reset-Fixture
Start-HostSetup
Assert ($script:calls.Count -eq 1 -and $script:calls[0].elevated) 'Fresh Windows requests elevation only for Windows prerequisites.'
Assert ($script:progress.phase -eq 'restart' -and $script:resume) 'Restart progress and resume must be persisted.'
Start-HostSetup
Assert ($script:calls.Count -eq 1) 'Do not repeat installation before the requested restart.'
$script:progress.boot = 'previous boot'
Start-HostSetup
Assert ($script:progress.phase -eq 'complete' -and !$script:resume) 'After reboot, install, initialize, verify, and clear resume.'
Assert (@($script:calls | Where-Object elevated).Count -eq 1) 'Ubuntu is installed and initialized as the original Windows user.'
Assert ($script:calls[1].args -eq '--install -d Ubuntu-24.04 --no-launch --web-download') 'Download Ubuntu without terminal account prompts.'
Assert ($script:calls[2].input -match 'useradd --create-home') 'Automatically create the regular account.'
Assert ($script:calls[3].args -eq '--terminate Ubuntu-24.04') 'Restart only the distro created by setup, never all WSL.'

Reset-Fixture
$script:registered = @('MyExistingUbuntu')
Start-HostSetup
Assert ($script:calls.Count -eq 0 -and $script:nextAction -eq 'open') 'Existing Linux must never be reconfigured.'

Reset-Fixture
$script:denyWindows = $true
try { Start-HostSetup; throw 'Expected cancellation' } catch { Assert ($_.Exception.Message -eq 'Permission declined') 'Permission failure is recoverable.' }
Assert (!$script:progress.ownsUbuntu -and $script:progress.phase -eq 'start') 'Denied elevation cannot claim Ubuntu ownership or completion.'

Reset-Fixture
$script:progress.phase = 'install'; $script:failInstall = $true
try { Start-HostSetup; throw 'Expected failure' } catch { Assert ($_.Exception.Message -match 'Ubuntu installation did not finish') 'Download failures are reported.' }
Assert ($script:progress.phase -eq 'install' -and $script:resume) 'Failed download remains retryable.'
$script:failInstall = $false
Start-HostSetup
Assert ($script:progress.phase -eq 'complete') 'Retry completes the interrupted download.'

Reset-Fixture
$script:progress.phase = 'install'; $script:legacyRegistration = $true
Start-HostSetup
Assert ($script:calls[1].args -eq 'install --root' -and !$script:calls[1].elevated) 'Register legacy Store packages without an interactive account prompt.'
Assert ($script:progress.phase -eq 'complete') 'Legacy registration must also verify a regular default user.'

Reset-Fixture
$script:progress.phase = 'initialize'; $script:progress.ownsUbuntu = $true; $script:registered = @('Ubuntu-24.04'); $script:badIdentity = $true
try { Start-HostSetup; throw 'Expected verification failure' } catch { Assert ($_.Exception.Message -match 'account or background service manager') 'Root identity cannot pass verification.' }
Assert ($script:progress.phase -ne 'complete' -and $script:resume) 'Verification failure retains recovery state.'
Assert (@($script:calls | Where-Object { $_.args -like '--install*' }).Count -eq 0) 'Resume initialization without reinstalling Ubuntu.'

$command = Get-HostSetupResumeCommand 'C:\Windows\powershell.exe' 'C:\A B\setup.ps1' 'C:\A B\Rennie.exe'
Assert ($command -match '-File "C:\\A B\\setup.ps1" -AppPath "C:\\A B\\Rennie.exe"') 'Resume paths with spaces are quoted.'
try { Get-HostSetupResumeCommand 'powershell.exe' 'bad"path' 'app.exe'; throw 'Expected bad path' } catch { Assert ($_.Exception.Message -eq 'Invalid setup path.') 'Reject command-line path injection.' }
Assert ((Get-WslProblem 'Error code: Wsl/Service/CreateInstance/CreateVm/HCS/0x80370102') -match 'BIOS/UEFI') 'Virtualization-off output names the firmware fix.'
Assert ((Get-WslProblem '' -2147024784) -match 'disk is full') 'A negative HRESULT exit code (0x80070070) is recognized.'
Assert ((Get-WslProblem 'WININET_E 0x80072EE7 name not resolved') -match 'internet connection') 'Network codes match case-insensitively.'
Assert ($null -eq (Get-WslProblem 'something unfamiliar' 1)) 'Unknown failures fall back to the general message.'
Reset-Fixture
$script:progress.phase = 'install'
function Invoke-SetupProcess([string]$Exe, [string]$Arguments, [string]$InputText='', [switch]$Elevate, [int]$TimeoutSeconds=1800) { return @{code=1;output='Error code: Wsl/Service/CreateInstance/CreateVm/HCS/0x80370102'} }
try { Start-HostSetup; throw 'Expected failure' } catch { Assert ($_.Exception.Message -match 'Ubuntu installation did not finish.*Virtualization is turned off') 'The helper reports the specific cause.' }
Write-Output 'PASS: fresh setup, reboot, existing environments, permission cancellation, download retry, initialization recovery, identity verification, resume quoting, WSL error explanations.'
