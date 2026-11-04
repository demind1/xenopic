param([ValidateSet('Install','Uninstall')][string]$Action='Install')
$ErrorActionPreference='Stop'
$installDir=Join-Path $env:LOCALAPPDATA 'NightframeInstallerSmoke'
$appPath=Join-Path $installDir 'NIGHTFRAME Studio.exe'
if($Action -eq 'Install') {
  $installers=@(Get-ChildItem -Path 'release' -Filter '*.exe' -File)
  if($installers.Count -ne 1) { throw "Expected one NSIS installer, found $($installers.Count)" }
  $installer=$installers[0]
  $result=Start-Process -FilePath $installer.FullName -ArgumentList @('/S','/currentuser',"/D=$installDir") -Wait -PassThru
  if($result.ExitCode -ne 0) { throw "Installer failed: $($result.ExitCode)" }
  if(!(Test-Path -LiteralPath $appPath)) { throw "Installed application is missing: $appPath" }
  node scripts/verify-windows-package.mjs $installDir
  if($LASTEXITCODE -ne 0) { throw 'Installed bundled-media verification failed' }
  "NIGHTFRAME_PACKAGED_APP=$appPath" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "NIGHTFRAME_INSTALLER_NAME=$($installer.Name)" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  $hash=Get-FileHash -Algorithm SHA256 -LiteralPath $installer.FullName
  ($hash.Hash.ToLower() + "  " + $installer.Name) | Set-Content -LiteralPath ($installer.FullName + ".sha256") -Encoding ascii
  $hash | Format-List
  Write-Host "NSIS installation succeeded: $appPath"
} else {
  $uninstaller=Join-Path $installDir 'Uninstall NIGHTFRAME Studio.exe'
  if(Test-Path -LiteralPath $uninstaller) {
    $result=Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
    if($result.ExitCode -ne 0) { throw "Uninstaller failed: $($result.ExitCode)" }
    for($attempt=0;$attempt -lt 30 -and (Test-Path -LiteralPath $appPath);$attempt++) { Start-Sleep -Seconds 1 }
    if(Test-Path -LiteralPath $appPath) { throw 'Uninstaller did not remove the executable' }
    Write-Host 'NSIS uninstallation succeeded'
  } elseif(Test-Path -LiteralPath $appPath) { throw 'Installed executable exists without an uninstaller' }
}
