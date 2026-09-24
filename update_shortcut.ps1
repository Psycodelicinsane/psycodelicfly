$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\Psycodelic\Desktop\Psycodelic Mosca.lnk")
$Shortcut.TargetPath = "C:\Users\Psycodelic\workspace\fly-brain-web\iniciar_mosca.bat"
$Shortcut.IconLocation = "C:\Users\Psycodelic\workspace\fly-brain-web\fly_icon.ico,0"
$Shortcut.WorkingDirectory = "C:\Users\Psycodelic\workspace\fly-brain-web"
$Shortcut.Description = "PsycodelicMosca - Cerebro de la Mosca 3D"
$Shortcut.Save()
Write-Host "Shortcut updated successfully"
