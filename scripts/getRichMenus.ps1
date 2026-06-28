# LINE リッチメニューID取得スクリプト
# 実行方法: PowerShellでこのファイルのあるフォルダで
#   .\scripts\getRichMenus.ps1

$token = Read-Host "チャネルアクセストークンを入力してください"

$headers = @{
    "Authorization" = "Bearer $token"
}

$response = Invoke-RestMethod -Uri "https://api.line.me/v2/bot/richmenu/list" -Headers $headers -Method GET

Write-Host ""
Write-Host "=== リッチメニュー一覧 ===" -ForegroundColor Green
foreach ($menu in $response.richmenus) {
    Write-Host ""
    Write-Host "名前: $($menu.name)" -ForegroundColor Yellow
    Write-Host "ID:   $($menu.richMenuId)" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "上のIDをRenderの環境変数に設定してください:" -ForegroundColor Green
Write-Host "  DEFAULT_RICH_MENU_ID     → 「登録」メニューのID" -ForegroundColor White
Write-Host "  REGISTERED_RICH_MENU_ID  → 「Hozyo 登録後」メニューのID" -ForegroundColor White
