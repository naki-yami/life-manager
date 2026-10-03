# Life Manager 同步服务：开机自启（Windows 计划任务）
#
# 用法（**以管理员身份**打开 PowerShell，否则注册计划任务会被拒）：
#     powershell -ExecutionPolicy Bypass -File src\server\install-autostart.ps1
# 卸载：
#     powershell -ExecutionPolicy Bypass -File src\server\install-autostart.ps1 -Remove
#
# 这个脚本只做一件事：让服务在开机后自己起来，并且在崩溃后重启。
# 它不改服务的配置（config.json 要你自己填，尤其是 mirrorDir）。
#
# 本文件存为 **UTF-8 with BOM**，不要改成无 BOM。
# 原因：Windows PowerShell 5.1（本机默认 shell）读无 BOM 的 UTF-8 会按 ANSI(936) 解，
# 中文字符串变乱码、引号配对被搞坏 —— 实测报 "Missing closing '}'"，脚本直接跑不了。
# 加 BOM 之后 5.1 与 PowerShell 7 都按 UTF-8 读，两边都正常。

[CmdletBinding()]
param(
  [switch]$Remove,
  [string]$TaskName = 'LifeManagerSyncServer'
)

$ErrorActionPreference = 'Stop'

# 仓库根目录 = 本脚本所在目录的上两级（src/server -> 仓库根）
$serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $serverDir)
$entry = Join-Path $serverDir 'main.ts'

if (-not (Test-Path $entry)) {
  throw "找不到服务入口：$entry"
}

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "已卸载计划任务：$TaskName"
  } else {
    Write-Host "没有这个计划任务：$TaskName（无需卸载）"
  }
  return
}

# 找 node：优先 PATH，找不到就给一句能懂的话，而不是让计划任务以后静默失败
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw '没找到 node。请先安装 Node.js 22.6 以上版本（服务端直接跑 .ts，需要类型擦除），再运行本脚本。'
}

Write-Host "node      : $($node.Source)"
Write-Host "工作目录  : $repoRoot"
Write-Host "服务入口  : $entry"

$action = New-ScheduledTaskAction `
  -Execute $node.Source `
  -Argument "`"$entry`"" `
  -WorkingDirectory $repoRoot

# 登录后启动（不是「开机」—— 服务要的是用户会话里的 node，且不需要管理员常驻）
$trigger = New-ScheduledTaskTrigger -AtLogOn

# 崩了自动重启：3 次，每次隔 1 分钟
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host "计划任务已存在，先覆盖：$TaskName"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Life Manager 本机同步服务（见 docs/adr/0002）。日志在计划任务的历史记录里。' | Out-Null

Write-Host ''
Write-Host "已注册计划任务：$TaskName"
Write-Host '下次登录会自动启动。现在想立刻起来的话，两条路：'
Write-Host "  1) 双击 src\server\start-sync-server.bat（能看到日志，推荐）"
Write-Host "  2) Start-ScheduledTask -TaskName $TaskName（看不到日志）"
Write-Host ''
Write-Host '提醒：服务是无人值守跑的，所以 config.json 里的 host 保持 127.0.0.1、'
Write-Host 'mirrorDir 指向另一块盘或同步盘目录（同卷会在启动日志里告警）。'
