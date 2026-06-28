$token = Read-Host "LINE_CHANNEL_ACCESS_TOKENを入力"
$auth = "Bearer $token"

$defaultJson    = Get-Content "$PSScriptRoot\menu_default.json"    -Raw -Encoding UTF8
$registeredJson = Get-Content "$PSScriptRoot\menu_registered.json" -Raw -Encoding UTF8

$jsonBytes1 = [System.Text.Encoding]::UTF8.GetBytes($defaultJson)
$jsonBytes2 = [System.Text.Encoding]::UTF8.GetBytes($registeredJson)

$r1 = Invoke-RestMethod -Uri "https://api.line.me/v2/bot/richmenu" -Method POST -Headers @{Authorization=$auth;"Content-Type"="application/json"} -Body $jsonBytes1
$defaultId = $r1.richMenuId
Write-Host "DEFAULT: $defaultId"

$r2 = Invoke-RestMethod -Uri "https://api.line.me/v2/bot/richmenu" -Method POST -Headers @{Authorization=$auth;"Content-Type"="application/json"} -Body $jsonBytes2
$registeredId = $r2.richMenuId
Write-Host "REGISTERED: $registeredId"

$png = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==")
Invoke-RestMethod -Uri "https://api-data.line.me/v2/bot/richmenu/$defaultId/content"    -Method POST -Headers @{Authorization=$auth;"Content-Type"="image/png"} -Body $png | Out-Null
Invoke-RestMethod -Uri "https://api-data.line.me/v2/bot/richmenu/$registeredId/content" -Method POST -Headers @{Authorization=$auth;"Content-Type"="image/png"} -Body $png | Out-Null
Write-Host "画像OK"

Invoke-RestMethod -Uri "https://api.line.me/v2/bot/user/all/richmenu/$defaultId" -Method POST -Headers @{Authorization=$auth} | Out-Null
Write-Host "デフォルト設定OK"

"DEFAULT_RICH_MENU_ID=$defaultId`nREGISTERED_RICH_MENU_ID=$registeredId" | Out-File "$PSScriptRoot\..\richmenus.txt" -Encoding utf8

Write-Host ""
Write-Host "=== Renderに追加する環境変数 ===" -ForegroundColor Green
Write-Host "DEFAULT_RICH_MENU_ID     = $defaultId" -ForegroundColor Yellow
Write-Host "REGISTERED_RICH_MENU_ID  = $registeredId" -ForegroundColor Yellow
