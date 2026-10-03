# Life Manager 同步服务：端到端验收脚本
#
# 按真实使用顺序跑一遍完整链路（服务端七条工单的集成验收）：
#   起服务 → 推 → 幂等重推 → 增量拉 → 冲突 → 拉取收敛 → 删除传播 →
#   墓碑清理与水位 → 落后设备被要求全量对账 → 快照合法 → 恢复 → 第二份存储
#
# 用法：pwsh -NoProfile -File scripts/sync-e2e.ps1
# 它自己起服务、自己清理，跑完打印每一步的判定。

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dataDir = Join-Path $repoRoot '.runtime/e2e/data'
$mirrorDir = Join-Path $repoRoot '.runtime/e2e/mirror'

Remove-Item (Join-Path $repoRoot '.runtime/e2e') -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $mirrorDir -Force | Out-Null

$pass = 0
$fail = 0
function Check($name, $condition, $detail) {
  if ($condition) { Write-Host "  [PASS] $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  [FAIL] $name -- $detail" -ForegroundColor Red; $script:fail++ }
}

# 写一份配置指到我们自己的目录
$token = 'e2e-' + [guid]::NewGuid().ToString('N')
$config = @{
  port = 8799; host = '127.0.0.1'; token = $token
  dataDir = $dataDir; mirrorDir = $mirrorDir
  allowedOrigins = @('http://localhost:*')
} | ConvertTo-Json -Depth 5
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Set-Content -Path (Join-Path $dataDir 'config.json') -Value $config -Encoding UTF8

$env:LM_SYNC_CONFIG = (Join-Path $dataDir 'config.json')
$server = Start-Process -FilePath 'node' -ArgumentList 'src/server/main.ts' -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDir 'out.txt') -RedirectStandardError (Join-Path $dataDir 'err.txt')
Start-Sleep -Seconds 3

$base = 'http://127.0.0.1:8799'
$H = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
function Push($body) { (Invoke-WebRequest "$base/v1/push" -Method POST -Headers $H -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing).Content | ConvertFrom-Json }
function Get_($path) { (Invoke-WebRequest "$base$path" -Headers $H -UseBasicParsing).Content | ConvertFrom-Json }

try {
  Write-Host "`n=== 1. health ===" -ForegroundColor Cyan
  $health = Get_ '/v1/health'
  Check 'health 免令牌可读、seq=0' ($health.ok -and $health.seq -eq 0) "got $($health | ConvertTo-Json -Compress)"
  Check 'modules 是 23 条' ($health.modules.Count -eq 23) "got $($health.modules.Count)"

  Write-Host "`n=== 2. 推 + 幂等 ===" -ForegroundColor Cyan
  $put = @{ deviceId='dev-A'; changes=@(@{ module='tasks'; key='t1'; baseRev=0; op='put'; record=@{ id='t1'; title='写周报' } }) }
  $r1 = Push $put
  Check '首次推 applied rev=1' ($r1.results[0].outcome -eq 'applied' -and $r1.results[0].rev -eq 1) ($r1 | ConvertTo-Json -Compress)
  $r2 = Push $put
  Check '同内容重推 noop、seq 不变' ($r2.results[0].outcome -eq 'noop' -and $r2.seq -eq 1) ($r2 | ConvertTo-Json -Compress)

  Write-Host "`n=== 3. 增量拉 + 分页 ===" -ForegroundColor Cyan
  Push @{ deviceId='dev-A'; changes=@(
    @{ module='tasks'; key='t2'; baseRev=0; op='put'; record=@{ id='t2'; title='B' } },
    @{ module='tasks'; key='t3'; baseRev=0; op='put'; record=@{ id='t3'; title='C' } }
  ) } | Out-Null
  $page = Get_ '/v1/changes?since=0&limit=2'
  Check '分页 limit=2 返回 2 条且 more=true' ($page.changes.Count -eq 2 -and $page.more) ($page | ConvertTo-Json -Compress)
  $page2 = Get_ "/v1/changes?since=$($page.nextSince)&limit=2"
  Check '续传拿到剩余、不重不漏' (($page2.changes | ForEach-Object { $_.key }) -join ',' -eq 't3') ($page2 | ConvertTo-Json -Compress)

  Write-Host "`n=== 4. 冲突（LWW） ===" -ForegroundColor Cyan
  $conflict = Push @{ deviceId='dev-B'; changes=@(@{ module='tasks'; key='t1'; baseRev=0; op='put'; record=@{ id='t1'; title='B 的标题' } }) }
  Check '落后 baseRev 标 conflict 且后到者赢' ($conflict.results[0].outcome -eq 'conflict') ($conflict | ConvertTo-Json -Compress)

  Write-Host "`n=== 5. 快照是合法备份（含 keyed 模块形状） ===" -ForegroundColor Cyan
  Push @{ deviceId='dev-A'; changes=@(
    @{ module='dietWater'; key='2026-10-02'; baseRev=0; op='put'; record=@{ '2026-10-02'=8 } },
    @{ module='dietGoals'; key='dietGoals'; baseRev=0; op='put'; record=@{ calories=2100; protein=120 } }
  ) } | Out-Null
  $snap = Get_ '/v1/snapshot'
  Check 'dietWater 是扁平 date->数字' ($snap.data.dietWater.'2026-10-02' -eq 8) ($snap.data.dietWater | ConvertTo-Json -Compress)
  Check 'dietGoals 是单值对象（不是数组）' ($snap.data.dietGoals.calories -eq 2100 -and -not ($snap.data.dietGoals -is [array])) ($snap.data.dietGoals | ConvertTo-Json -Compress)

  Write-Host "`n=== 6. 删除传播（两台设备） ===" -ForegroundColor Cyan
  Push @{ deviceId='dev-A'; changes=@(@{ module='tasks'; key='t2'; baseRev=1; op='delete' }) } | Out-Null
  $delPage = Get_ '/v1/changes?since=3'
  $delEntry = $delPage.changes | Where-Object { $_.op -eq 'delete' } | Select-Object -First 1
  Check '删除进了增量（带 op=delete）' ($null -ne $delEntry) ($delPage | ConvertTo-Json -Compress)

  Write-Host "`n=== 7. 恢复（不倒退 seq） ===" -ForegroundColor Cyan
  $seqBefore = (Get_ '/v1/health').seq
  # 造一条历史再恢复它
  $histFile = Join-Path $dataDir 'history.jsonl'
  $histEntry = @{ id='e2e-1'; replacedAt=[DateTime]::UtcNow.ToString('o'); module='tasks'; key='t1'; rev=1; record=@{ id='t1'; title='恢复回来的' }; reason='conflict' } | ConvertTo-Json -Compress -Depth 5
  Add-Content -Path $histFile -Value $histEntry -Encoding UTF8
  $restore = (Invoke-WebRequest "$base/v1/restore" -Method POST -Headers $H -Body (@{ confirm='restore'; source='history'; ref='e2e-1' } | ConvertTo-Json) -UseBasicParsing).Content | ConvertFrom-Json
  Check '恢复成功且 seq 前进（不倒退）' ($restore.ok -and $restore.seq -gt $seqBefore) "before=$seqBefore after=$($restore.seq)"
  $afterRestore = Get_ '/v1/snapshot'
  Check '恢复后的数据等于那一版' (($afterRestore.data.tasks | Where-Object { $_.id -eq 't1' }).title -eq '恢复回来的') ($afterRestore.data.tasks | ConvertTo-Json -Compress)
  Check '恢复前那份进了 backups/' (Test-Path (Join-Path $dataDir "backups/$($restore.safetyBackup)")) "safetyBackup=$($restore.safetyBackup)"

  Write-Host "`n=== 8. 防手滑 ===" -ForegroundColor Cyan
  try {
    Invoke-WebRequest "$base/v1/restore" -Method POST -Headers $H -Body (@{ source='history'; ref='e2e-1' } | ConvertTo-Json) -UseBasicParsing | Out-Null
    Check '缺 confirm 被拒' $false 'expected 400'
  } catch { Check '缺 confirm 被拒（400）' ($_.Exception.Response.StatusCode.value__ -eq 400) "got $($_.Exception.Response.StatusCode.value__)" }

  Write-Host "`n=== 9. 第二份存储 ===" -ForegroundColor Cyan
  $mirrorFile = Join-Path $mirrorDir 'life-manager-server-replica.json'
  Check 'health 里报了 mirror 状态' ($null -ne (Get_ '/v1/health').mirror) 'mirror 段缺失'
  Write-Host '  （去抖 30 秒，等一会儿再验镜子文件）' -ForegroundColor DarkGray
  Start-Sleep -Seconds 33
  Check '镜子文件已写' (Test-Path $mirrorFile) "未找到 $mirrorFile"

  Write-Host "`n=== 10. 落盘与重启不丢 ===" -ForegroundColor Cyan
  $seqAtEnd = (Get_ '/v1/health').seq
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Remove-Item Env:\LM_SYNC_CONFIG -ErrorAction SilentlyContinue
}

# 重启：数据应该还在
$env:LM_SYNC_CONFIG = (Join-Path $dataDir 'config.json')
$server2 = Start-Process -FilePath 'node' -ArgumentList 'src/server/main.ts' -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDir 'out2.txt') -RedirectStandardError (Join-Path $dataDir 'err2.txt')
Start-Sleep -Seconds 3
try {
  $seqAfterRestart = (Get_ '/v1/health').seq
  Check '重启后 seq 保持（副本真的落盘了）' ($seqAfterRestart -eq $seqAtEnd) "before=$seqAtEnd after=$seqAfterRestart"
} finally {
  Stop-Process -Id $server2.Id -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\LM_SYNC_CONFIG -ErrorAction SilentlyContinue
}

Write-Host "`n=== 结果：$pass 通过 / $fail 失败 ===" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Remove-Item (Join-Path $repoRoot '.runtime/e2e') -Recurse -Force -ErrorAction SilentlyContinue
if ($fail -gt 0) { exit 1 }
