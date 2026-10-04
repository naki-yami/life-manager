# 创建「Life Manager」桌面快捷方式。
#
# 为什么要有这个脚本：`启动说明.md` 一直写着「双击桌面上的『Life Manager』快捷方式」，
# 但那个快捷方式**从来没有被创建过** —— 仓库里没有任何代码会写 .lnk。于是照说明去找
# 必然找不到，用户看到的只是「打不开」。
#
# 为什么逻辑在 .ps1 而不是 .bat：本仓库有一条实测过的规矩 —— **.bat 必须纯 ASCII**
# （cmd 在 936 代码页下解析 UTF-8 中文会崩在 `if (...)` 的引号上，报
# `. was unexpected at this time.`）。而这个脚本必须写出中文文件名，所以它只能在
# .ps1 里（UTF-8 **带 BOM**，5.1 才认）。配套的 .bat 只做一件事：调这个脚本。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot          # 仓库根
$launcher = Join-Path $root '启动 Life Manager.vbs'
$icon = Join-Path $root 'public\icons\life-manager.ico'

if (-not (Test-Path $launcher)) {
    Write-Host "  [X] 找不到启动器：$launcher"
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Life Manager.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)

# 目标用 wscript.exe 跑 .vbs，而不是直接指向 .vbs —— 显式给 wscript 才是确定的
# 「无窗口执行」，不会受「打开方式」关联的影响。
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shortcut.TargetPath = $wscript
$shortcut.Arguments = '"' + $launcher + '"'
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Life Manager —— 本地优先的生活与工作管理应用'

# 图标必须是 .ico：**Windows 快捷方式不接受 .png** —— 给了会静默退回默认空白图标
# （实测 System.Drawing.Icon('...png') 直接抛 "must be a picture that can be used as a Icon"，
# 而 WScript.Shell 连抛都不抛，只是不显示）。这正是「快捷方式白白的很丑」的原因。
# ico 由 `python scripts/make-icon.py` 从 PWA 图标生成，含 10 档尺寸。
if (Test-Path $icon) {
    $shortcut.IconLocation = "$icon,0"
} else {
    Write-Host "  [!] 找不到图标 $icon —— 快捷方式会是默认白图标。"
    Write-Host "      可以用 python scripts/make-icon.py 生成一份。"
}

$shortcut.Save()

if (Test-Path $lnkPath) {
    Write-Host "  [OK] 已创建：$lnkPath"
    Write-Host "       目标：wscript.exe `"$launcher`""
    if (Test-Path $icon) {
        Write-Host "       图标：$icon"
    } else {
        Write-Host '       图标：（缺 .ico，会显示默认白图标）'
    }
    Write-Host ''
    Write-Host '       双击「Life Manager」启动：不弹终端窗口，浏览器自动打开。'
    Write-Host '       停止服务：双击「停止 Life Manager.vbs」。'
    exit 0
}

Write-Host '  [X] 创建失败。手动办法：右键「启动 Life Manager.vbs」→ 发送到 → 桌面快捷方式'
exit 1
