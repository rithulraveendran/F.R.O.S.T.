# ==============================================================================
# F.R.O.S.T. - Disable Incognito & InPrivate Mode (PowerShell Script)
# Run as Administrator
# ==============================================================================

Write-Host "Applying F.R.O.S.T. Incognito Lockdown Policies..." -ForegroundColor Cyan

$regPaths = @(
    "HKLM:\SOFTWARE\Policies\Google\Chrome",
    "HKCU:\SOFTWARE\Policies\Google\Chrome",
    "HKLM:\SOFTWARE\Policies\Microsoft\Edge",
    "HKCU:\SOFTWARE\Policies\Microsoft\Edge",
    "HKLM:\SOFTWARE\Policies\BraveSoftware\Brave",
    "HKCU:\SOFTWARE\Policies\BraveSoftware\Brave"
)

foreach ($path in $regPaths) {
    if (!(Test-Path $path)) {
        New-Item -Path $path -Force | Out-Null
    }
}

# Chrome & Brave: IncognitoModeAvailability = 1 (Disabled)
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Google\Chrome" -Name "IncognitoModeAvailability" -Value 1 -Type DWord
Set-ItemProperty -Path "HKCU:\SOFTWARE\Policies\Google\Chrome" -Name "IncognitoModeAvailability" -Value 1 -Type DWord
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\BraveSoftware\Brave" -Name "IncognitoModeAvailability" -Value 1 -Type DWord
Set-ItemProperty -Path "HKCU:\SOFTWARE\Policies\BraveSoftware\Brave" -Name "IncognitoModeAvailability" -Value 1 -Type DWord

# Edge: InPrivateModeAvailability = 1 (Disabled)
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Edge" -Name "InPrivateModeAvailability" -Value 1 -Type DWord
Set-ItemProperty -Path "HKCU:\SOFTWARE\Policies\Microsoft\Edge" -Name "InPrivateModeAvailability" -Value 1 -Type DWord

Write-Host "SUCCESS: Incognito and InPrivate browsing have been permanently disabled!" -ForegroundColor Green
Write-Host "Please restart all open browser windows for changes to take effect." -ForegroundColor Yellow

