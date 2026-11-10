# Backend smoke test for the endpoints the redesigned frontend relies on.
# Usage (backend running on :5000):  pwsh scripts/smoke-api.ps1
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000/api'
$rand = Get-Random -Maximum 99999
$reg = Invoke-RestMethod "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{
  name = 'Smoke Tester'; username = "smoke$rand"; email = "smoke$rand@tiresias.dev"; password = 'Str0ng!Pass'
} | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($reg.token)" }
function J($o) { $o | ConvertTo-Json -Depth 6 -Compress }

Invoke-RestMethod "$base/topics" -Method Post -Headers $h -ContentType 'application/json' -Body (J @{ title = 'Quantum Physics' }) | Out-Null
Invoke-RestMethod "$base/topics" -Method Post -Headers $h -ContentType 'application/json' -Body (J @{ title = 'Quantum Physics' }) | Out-Null
$topics = Invoke-RestMethod "$base/topics?q=quantum" -Headers $h
"topics (deduped by slug): $($topics.data.pagination.total)"

$g = Invoke-RestMethod "$base/graphs" -Method Post -Headers $h -ContentType 'application/json' -Body (J @{
  title = 'Quantum Physics'; generatedBy = 'wikipedia'
  nodes = @(@{ id = 'root'; label = 'Quantum Physics'; depth = 0 }, @{ id = 'n1'; label = 'Wave function'; depth = 1; metadata = @{ parent = 'root' } })
  edges = @(@{ id = 'e1'; source = 'root'; target = 'n1'; type = 'subtopic' })
  layout = @{ positions = @{ root = @{ x = 0; y = 0 } }; physics = $true }
})
$gid = $g.data._id
$u = Invoke-RestMethod "$base/graphs/$gid" -Method Put -Headers $h -ContentType 'application/json' -Body (J @{
  owner = '000000000000000000000000'
  nodes = @(@{ id = 'root'; label = 'Quantum Physics' }, @{ id = 'n1'; label = 'Wave function' }, @{ id = 'n2'; label = 'Entanglement' })
  layout = @{ positions = @{ root = @{ x = 10; y = 20 } }; pinned = @('root') }
})
"layout persisted: pinned=$($u.data.layout.pinned) x=$($u.data.layout.positions.root.x); owner unchanged: $($u.data.owner -ne '000000000000000000000000'); nodes=$($u.data.nodes.Count)"
Invoke-RestMethod "$base/graphs/$gid/expand/n1" -Method Post -Headers $h | Out-Null

$p = Invoke-RestMethod "$base/ai/learning-path" -Method Post -Headers $h -ContentType 'application/json' -Body (J @{ topic = 'Quantum Physics' })
$pid_ = $p.data._id
$p2 = Invoke-RestMethod "$base/paths/$pid_/milestones" -Method Post -Headers $h -ContentType 'application/json' -Body (J @{ title = 'Entanglement'; description = 'from graph' })
$p3 = Invoke-RestMethod "$base/paths/$pid_/milestones/0" -Method Patch -Headers $h -ContentType 'application/json' -Body (J @{ status = 'completed' })
"path milestones=$($p2.data.milestones.Count) completion=$($p3.data.completionPercentage)%"
$paths = Invoke-RestMethod "$base/paths" -Headers $h
"paths listed: $($paths.data.items.Count)"

$a = Invoke-RestMethod "$base/ai/ask" -Method Post -Headers $h -ContentType 'application/json' -Body (J @{ question = 'Explain entanglement simply'; graphId = $gid })
"ask provider=$($a.data.provider) grounded graph=$($a.data.context.graph)"

$me = Invoke-RestMethod "$base/analytics/me" -Headers $h
"analytics/me totals: $(J $me.data.totals)"
$act = Invoke-RestMethod "$base/analytics/me/activity?limit=5" -Headers $h
"my activity: $($act.data.pagination.total) events, latest=$($act.data.items[0].activityType)"
Invoke-RestMethod "$base/graphs/$gid" -Method Delete -Headers $h | Out-Null
"graph deleted OK"
