$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\Psycodelic\Desktop\Psycodelic Mosca.lnk")
$Shortcut.TargetPath = "C:\Users\Psycodelic\workspace\fly-brain-web\iniciar_mosca.bat"
$Shortcut.IconLocation = "C:\Users\Psycodelic\workspace\ly-brain-web\fly_icon.ico,0"
$Shortcut.WorkingDirectory = "C:\Users\Psycodelic\workspace\fly-brain-web"
$Shortcut.Description = "PsycodelicMosca - Mosca y Cerebro 3D"
$Shortcut.Save()
Write-Host "OK"
