
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\Psycodelic\Desktop\Psycodelic Fly.lnk")
$Shortcut.TargetPath = "C:\Users\Psycodelic\workspace\fly-brain-web\psycodelicmosca.html"
$Shortcut.IconLocation = "C:\Users\Psycodelic\workspace\fly-brain-web\fly_icon.ico,0"
$Shortcut.WorkingDirectory = "C:\Users\Psycodelic\workspace\fly-brain-web"
$Shortcut.Description = "PsycodelicMosca - Versión HTML Autónoma"
$Shortcut.Save()
Write-Host "OK"
