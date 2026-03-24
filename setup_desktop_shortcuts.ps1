# setup_desktop_shortcuts.ps1
# Run once from PowerShell to create a Lorevox folder on your Desktop
# with shortcuts for each script.
#
# Usage (from PowerShell):
#   powershell -ExecutionPolicy Bypass -File C:\Users\chris\lorevox\setup_desktop_shortcuts.ps1

$repoRoot = "C:\Users\chris\lorevox"
$desktop  = [Environment]::GetFolderPath("Desktop")
$folder   = "$desktop\Lorevox"

New-Item -ItemType Directory -Force -Path $folder | Out-Null

$wsh = New-Object -ComObject WScript.Shell

$shortcuts = @(
    @{ Name = "1 - Start Lorevox";  Target = "$repoRoot\start_lorevox.bat"  },
    @{ Name = "2 - Logs";           Target = "$repoRoot\logs_lorevox.bat"    },
    @{ Name = "3 - Reload API";     Target = "$repoRoot\reload_api.bat"      },
    @{ Name = "4 - Stop Lorevox";   Target = "$repoRoot\stop_lorevox.bat"    },
    @{ Name = "5 - Status";         Target = "$repoRoot\status_lorevox.bat"  }
)

foreach ($s in $shortcuts) {
    $lnk = $wsh.CreateShortcut("$folder\$($s.Name).lnk")
    $lnk.TargetPath      = $s.Target
    $lnk.WorkingDirectory = $repoRoot
    $lnk.WindowStyle     = 1
    $lnk.Save()
}

Write-Host ""
Write-Host "Done. Lorevox folder created at: $folder"
Write-Host ""
Write-Host "Shortcuts:"
foreach ($s in $shortcuts) { Write-Host "  $($s.Name)" }
Write-Host ""
