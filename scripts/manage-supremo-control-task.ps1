<#
  @module scripts/manage-supremo-control-task
  @description Installa i broker minimi elevati usati dalla Console privata per aprire e chiudere Supremo.
#>
param(
  [ValidateSet('install', 'remove', 'open', 'close', 'run', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$openTaskName = 'NexusNXS Open Supremo'
$closeTaskName = 'NexusNXS Close Supremo'

function Resolve-TrustedSupremoExecutable {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Supremo\Supremo.exe'),
    (Join-Path $env:ProgramFiles 'Supremo\Supremo.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
  $candidate = $candidates | Select-Object -First 1
  if (-not $candidate) { throw 'Supremo non e installato in Program Files.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $candidate
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Nanosystems S\.r\.l\.') {
    throw 'La firma digitale di Supremo non e valida o non appartiene al produttore atteso.'
  }
  return (Resolve-Path -LiteralPath $candidate).Path
}

if ($Action -eq 'install') {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'L installazione del broker Supremo richiede una conferma amministratore una tantum.'
  }
  $supremoExecutable = Resolve-TrustedSupremoExecutable
  $openTaskAction = New-ScheduledTaskAction -Execute $supremoExecutable
  $closeTaskAction = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\taskkill.exe" -Argument '/IM Supremo.exe /T /F'
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -Hidden
  Register-ScheduledTask -TaskName $openTaskName -Action $openTaskAction -Principal $taskPrincipal -Settings $settings `
    -Description 'NexusNXS: apre esclusivamente il client Supremo firmato nella sessione utente con privilegi elevati.' -Force | Out-Null
  Register-ScheduledTask -TaskName $closeTaskName -Action $closeTaskAction -Principal $taskPrincipal -Settings $settings `
    -Description 'NexusNXS: chiude esclusivamente Supremo dopo una richiesta autenticata della Console privata.' -Force | Out-Null
  Write-Output 'Broker Supremo di apertura e chiusura installati.'
  exit 0
}

if ($Action -eq 'remove') {
  Unregister-ScheduledTask -TaskName $openTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $closeTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output 'Broker Supremo rimossi.'
  exit 0
}

if ($Action -eq 'status') {
  $openTask = Get-ScheduledTask -TaskName $openTaskName -ErrorAction SilentlyContinue
  $closeTask = Get-ScheduledTask -TaskName $closeTaskName -ErrorAction SilentlyContinue
  if (-not $openTask -or -not $closeTask) { Write-Output 'not-installed'; exit 1 }
  Write-Output "installed:open=$($openTask.State);close=$($closeTask.State)"
  exit 0
}

$effectiveAction = if ($Action -eq 'run') { 'close' } else { $Action }
$taskName = if ($effectiveAction -eq 'open') { $openTaskName } else { $closeTaskName }
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) { throw 'Broker Supremo non installato.' }
Start-ScheduledTask -TaskName $taskName
Write-Output "Comando Supremo '$effectiveAction' avviato."
