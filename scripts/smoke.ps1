# End-to-end permission check against a RUNNING dev server.
# Prereqs: `npm run seed` done, `npm run dev` running.
# Usage:   powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
# Optional: pass -Base https://your-app.vercel.app to test a deployment.
param([string]$Base = "http://localhost:3000")

$script:fail = 0

function New-Session { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function Call($method, $path, $session, $body = $null) {
  $params = @{ Uri = "$Base$path"; Method = $method; WebSession = $session; UseBasicParsing = $true }
  if ($null -ne $body) {
    $params.Body = ($body | ConvertTo-Json -Depth 20 -Compress)
    $params.ContentType = "application/json"
  }
  try {
    $r = Invoke-WebRequest @params
    $json = $null
    if ($r.Content) { $json = $r.Content | ConvertFrom-Json }
    return @{ status = [int]$r.StatusCode; json = $json }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { return @{ status = [int]$resp.StatusCode; json = $null } }
    throw
  }
}

function Check($name, $actual, $expected) {
  if ($actual -eq $expected) { Write-Host "PASS  $name" -ForegroundColor Green }
  else { Write-Host "FAIL  $name (got $actual, expected $expected)" -ForegroundColor Red; $script:fail++ }
}

$anon = New-Session; $zubia = New-Session; $ashraf = New-Session; $syeda = New-Session

# --- identities ---
$users = (Call GET "/api/users" $anon).json.users
$zId = ($users | Where-Object { $_.name -eq "zubia" }).id
$aId = ($users | Where-Object { $_.name -eq "ashraf" }).id
$sId = ($users | Where-Object { $_.name -eq "syeda" }).id
if (-not ($zId -and $aId -and $sId)) { Write-Host "Seed users not found. Run: npm run seed" -ForegroundColor Red; exit 1 }

Check "anonymous list -> 401" (Call GET "/api/documents" $anon).status 401
Check "login zubia" (Call POST "/api/auth/login" $zubia @{ userId = $zId }).status 200
Check "login ashraf" (Call POST "/api/auth/login" $ashraf @{ userId = $aId }).status 200
Check "login syeda" (Call POST "/api/auth/login" $syeda @{ userId = $sId }).status 200

# --- create + edit ---
$c = Call POST "/api/documents" $zubia @{ title = "Smoke doc" }
Check "zubia creates doc -> 201" $c.status 201
$id = $c.json.document.id
$content = @{ type = "doc"; content = @(@{ type = "paragraph"; content = @(@{ type = "text"; text = "hello" }) }) }

$p = Call PATCH "/api/documents/$id" $zubia @{ content = $content; baseVersion = 1 }
Check "owner saves content -> 200" $p.status 200
Check "version incremented to 2" $p.json.document.version 2

# --- no access ---
Check "stranger (ashraf) GET -> 404" (Call GET "/api/documents/$id" $ashraf).status 404
Check "stranger (ashraf) PATCH -> 404" (Call PATCH "/api/documents/$id" $ashraf @{ title = "hack" }).status 404
Check "stranger (ashraf) DELETE -> 404" (Call DELETE "/api/documents/$id" $ashraf).status 404

# --- viewer ---
Check "owner shares as viewer -> 200" (Call POST "/api/documents/$id/shares" $zubia @{ userId = $aId; role = "viewer" }).status 200
Check "viewer GET -> 200" (Call GET "/api/documents/$id" $ashraf).status 200
Check "viewer PATCH content -> 403" (Call PATCH "/api/documents/$id" $ashraf @{ content = $content; baseVersion = 2 }).status 403
Check "viewer rename -> 403" (Call PATCH "/api/documents/$id" $ashraf @{ title = "x" }).status 403
Check "viewer DELETE -> 403" (Call DELETE "/api/documents/$id" $ashraf).status 403
Check "viewer share -> 403" (Call POST "/api/documents/$id/shares" $ashraf @{ userId = $sId; role = "viewer" }).status 403
$shared = (Call GET "/api/documents?scope=shared" $ashraf).json.documents
Check "doc appears in ashraf Shared with me" (@($shared | Where-Object { $_.id -eq $id }).Count) 1

# --- editor ---
Check "owner upgrades to editor -> 200" (Call POST "/api/documents/$id/shares" $zubia @{ userId = $aId; role = "editor" }).status 200
$e = Call PATCH "/api/documents/$id" $ashraf @{ content = $content; baseVersion = 2 }
Check "editor saves content -> 200" $e.status 200
Check "stale baseVersion -> 409" (Call PATCH "/api/documents/$id" $zubia @{ content = $content; baseVersion = 2 }).status 409
Check "editor DELETE -> 403" (Call DELETE "/api/documents/$id" $ashraf).status 403
Check "editor share -> 403" (Call POST "/api/documents/$id/shares" $ashraf @{ userId = $sId; role = "editor" }).status 403

# --- third user, bad input ---
Check "syeda GET -> 404" (Call GET "/api/documents/$id" $syeda).status 404
$bad = @{ type = "doc"; content = @(@{ type = "script" }) }
Check "unsupported content -> 400" (Call PATCH "/api/documents/$id" $zubia @{ content = $bad; baseVersion = 3 }).status 400
Check "invalid id -> 404" (Call GET "/api/documents/not-an-id" $zubia).status 404

# --- revoke ---
Check "owner revokes ashraf -> 200" (Call DELETE "/api/documents/$id/shares?userId=$aId" $zubia).status 200
Check "revoked GET -> 404" (Call GET "/api/documents/$id" $ashraf).status 404
Check "revoked PATCH -> 404" (Call PATCH "/api/documents/$id" $ashraf @{ title = "x" }).status 404

# --- cleanup ---
Check "owner DELETE -> 204" (Call DELETE "/api/documents/$id" $zubia).status 204
Check "deleted doc GET -> 404" (Call GET "/api/documents/$id" $zubia).status 404

Write-Host ""
if ($script:fail -eq 0) { Write-Host "ALL CHECKS PASSED" -ForegroundColor Green; exit 0 }
else { Write-Host "$($script:fail) CHECK(S) FAILED" -ForegroundColor Red; exit 1 }
