
$enc = New-Object System.Text.UTF8Encoding($false)
$html = [System.IO.File]::ReadAllText("C:\Users\CHRISTIAN\Desktop\HEURES TAF\index.html", $enc)
$js   = [System.IO.File]::ReadAllText("C:\Users\CHRISTIAN\Desktop\HEURES TAF\app_v4.js", $enc)

$marker = '<script src="app_v4.js"></script>'
$inlined = '<script>' + [System.Environment]::NewLine + $js + [System.Environment]::NewLine + '</script>'

if ($html.Contains($marker)) {
    $result = $html.Replace($marker, $inlined)
    [System.IO.File]::WriteAllText("C:\Users\CHRISTIAN\Desktop\HEURES TAF\POINTAGE_APP.html", $result, $enc)
    $size = (Get-Item "C:\Users\CHRISTIAN\Desktop\HEURES TAF\POINTAGE_APP.html").Length
    Write-Host "SUCCES! Fichier cree: POINTAGE_APP.html ($size octets)"
} else {
    Write-Host "ERREUR: balise script non trouvee dans index.html"
    Write-Host "Contenu cherche: $marker"
}
