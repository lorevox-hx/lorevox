# setup_desktop_shortcuts.ps1
# Run once from PowerShell to create a Lori folder on your Desktop
# with shortcuts for each Lorevox operation.
#
# Usage (from PowerShell):
#   powershell -ExecutionPolicy Bypass -File C:\Users\chris\lorevox\setup_desktop_shortcuts.ps1
#
# Or from inside the repo:
#   powershell -ExecutionPolicy Bypass -File .\setup_desktop_shortcuts.ps1

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop  = [Environment]::GetFolderPath("Desktop")
$folder   = "$desktop\Lori"

New-Item -ItemType Directory -Force -Path $folder | Out-Null

$wsh = New-Object -ComObject WScript.Shell

$shortcuts = @(
    @{ Name = "Start Lori";   Target = "$repoRoot\start_lorevox.bat"  },
    @{ Name = "Stop Lori";    Target = "$repoRoot\stop_lorevox.bat"   },
    @{ Name = "Reload API";   Target = "$repoRoot\reload_api.bat"     },
    @{ Name = "Status";       Target = "$repoRoot\status_lorevox.bat" },
    @{ Name = "Logs";         Target = "$repoRoot\logs_lorevox.bat"   }
)

foreach ($s in $shortcuts) {
    $lnk = $wsh.CreateShortcut("$folder\$($s.Name).lnk")
    $lnk.TargetPath      = $s.Target
    $lnk.WorkingDirectory = $repoRoot
    $lnk.WindowStyle     = 1
    $lnk.Save()
}

Write-Host ""
Write-Host "Done. Lori folder created at: $folder"
Write-Host ""
Write-Host "Shortcuts:"
foreach ($s in $shortcuts) { Write-Host "  $($s.Name)" }
Write-Host ""
