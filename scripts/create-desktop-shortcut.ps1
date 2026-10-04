# 创建「Life Manager」桌面快捷方式。
#
# 为什么要有这个脚本：`启动说明.md` 一直写着「双击桌面上的『Life Manager』快捷方式」，
# 但那个快捷方式**从来没有被创建过** —— 仓库里没有任何代码会写 .lnk。于是照说明去找
# 必然找不到，用户看到的只是「打不开」。
#
# 为什么逻辑在 .ps1 而不是 .bat：本仓库有一条实测过的规矩 —— **.bat 必须纯 ASCII**
# （cmd 在 936 代码页下解析 UTF-8 中文会崩在 `if (...)` 的引号上，报
# `. was unexpected at this time.`）。而这个脚本必须写出中文文件名
# 「启动 Life Manager.bat」，所以它只能在 .ps1 里（UTF-8 **带 BOM**，5.1 才认）。
# 与之配套的 .bat 只做一件事：调这个脚本。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot          # 仓库根
$launcher = Join-Path $root '启动 Life Manager.bat'
$icon = Join-Path $root 'public\icons\icon-192.png'

if (-not (Test-Path $launcher)) {
    Write-Host "  [X] 找不到启动器：$launcher"
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Life Manager.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Life Manager —— 本地优先的生活与工作管理应用'
if (Test-Path $icon) { $shortcut.IconLocation = $icon }
$shortcut.Save()

if (Test-Path $lnkPath) {
    Write-Host "  [OK] 已创建：$lnkPath"
    Write-Host "       目标：$launcher"
    Write-Host "       回桌面双击「Life Manager」即可启动（会自动起服务并打开浏览器）。"
    exit 0
}

Write-Host '  [X] 创建失败。手动办法：右键「启动 Life Manager.bat」→ 发送到 → 桌面快捷方式'
exit 1
