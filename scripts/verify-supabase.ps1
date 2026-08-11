param(
  [string]$ProjectUrl = $env:PYTYPE_SUPABASE_URL,
  [string]$PublishableKey = $env:PYTYPE_SUPABASE_PUBLISHABLE_KEY
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectUrl) -or [string]::IsNullOrWhiteSpace($PublishableKey)) {
  throw 'Set PYTYPE_SUPABASE_URL and PYTYPE_SUPABASE_PUBLISHABLE_KEY first.'
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
  throw 'SUPABASE_ACCESS_TOKEN is required for isolated test cleanup.'
}
$projectUri = [Uri]$ProjectUrl
$projectRef = $projectUri.Host.Split('.')[0]
if ($projectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'ProjectUrl does not contain a valid Supabase project reference.'
}
if ($projectUri.Scheme -ne 'https' -or $projectUri.Host -ne "$projectRef.supabase.co" -or
    -not [string]::IsNullOrEmpty($projectUri.UserInfo) -or $projectUri.AbsolutePath -ne '/') {
  throw 'ProjectUrl must be the exact HTTPS origin https://<project-ref>.supabase.co.'
}

$sessions = @{
  a1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  a2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  a3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
  a4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
  a5 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
  a6 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
  a7 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'
  a8 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'
  b1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  b2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  b3 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
}

function Invoke-SupabaseRequest {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Token,
    $Body = $null,
    [hashtable]$ExtraHeaders = @{}
  )
  $headers = @{
    apikey = $PublishableKey
    Authorization = "Bearer $Token"
    Accept = 'application/json'
  }
  foreach ($entry in $ExtraHeaders.GetEnumerator()) { $headers[$entry.Key] = $entry.Value }
  $parameters = @{
    Uri = "$ProjectUrl/$Path"
    Method = $Method
    Headers = $headers
    SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Depth 8 -Compress
  }
  $response = Invoke-WebRequest @parameters
  $parsed = $null
  if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
    try { $parsed = $response.Content | ConvertFrom-Json } catch { $parsed = $response.Content }
  }
  return [PSCustomObject]@{ Status = [int]$response.StatusCode; Data = $parsed }
}

function Assert-Status {
  param($Response, [int[]]$Expected, [string]$Label)
  if ($Expected -notcontains $Response.Status) {
    throw "$Label returned HTTP $($Response.Status); expected $($Expected -join ', ')."
  }
}

function Invoke-ManagementSql {
  param([string]$Sql)
  $response = Invoke-WebRequest `
    -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $($env:SUPABASE_ACCESS_TOKEN)"; Accept = 'application/json' } `
    -ContentType 'application/json' `
    -Body (@{ query = $Sql } | ConvertTo-Json -Compress) `
    -SkipHttpErrorCheck
  if ([int]$response.StatusCode -notin @(200, 201)) {
    throw "Supabase Management SQL returned HTTP $([int]$response.StatusCode)."
  }
}

function New-AnonymousUser {
  $response = Invoke-SupabaseRequest -Method POST -Path 'auth/v1/signup' -Token $PublishableKey -Body @{}
  Assert-Status $response @(200) 'anonymous signup'
  if ($response.Data.user.id -notmatch '^[0-9a-f-]{36}$' -or [string]::IsNullOrWhiteSpace($response.Data.access_token)) {
    throw 'Anonymous signup response did not contain a valid minimal session.'
  }
  return [PSCustomObject]@{ Id = $response.Data.user.id; Token = $response.Data.access_token }
}

function New-RankingPayload {
  param(
    [string]$UserId,
    [string]$SessionId,
    [string]$PlayerName,
    [int]$Score,
    [decimal]$Accuracy,
    [decimal]$Cpm = 300,
    [int]$Problems = 20,
    [int]$Combo = 10,
    [int]$SurvivalMs = 240000,
    [string]$ContentVersion = '1.0.0'
  )
  return @{
    user_id = $UserId
    session_id = $SessionId
    player_name = $PlayerName
    score = $Score
    accuracy = $Accuracy
    cpm = $Cpm
    problems_solved = $Problems
    best_combo = $Combo
    survival_ms = $SurvivalMs
    game_mode = 'quick'
    content_version = $ContentVersion
    client_version = '1.0.0'
  }
}

$userA = $null
$userB = $null
$cleanupCompleted = $false
$summary = [ordered]@{}
try {
  $userA = New-AnonymousUser
  $userB = New-AnonymousUser

  $payloadA1 = New-RankingPayload $userA.Id $sessions.a1 'RLS_A_0811' 1000 99
  $unauthInsert = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $PublishableKey $payloadA1
  Assert-Status $unauthInsert @(401, 403) 'unauthenticated insert'
  $summary.unauthenticatedInsertDenied = $true

  $ownInsert = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $userA.Token $payloadA1 @{ Prefer = 'return=minimal' }
  Assert-Status $ownInsert @(201) 'own insert'
  $summary.ownInsertAllowed = $true

  $otherPayload = New-RankingPayload $userB.Id $sessions.a3 'RLS_A_0811' 1001 99
  $otherInsert = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $userA.Token $otherPayload
  Assert-Status $otherInsert @(401, 403) 'other-user insert'
  $summary.otherUserInsertDenied = $true

  $update = Invoke-SupabaseRequest PATCH "rest/v1/ranking_entries?session_id=eq.$($sessions.a1)" $userA.Token @{ score = 9999 }
  Assert-Status $update @(401, 403) 'client update'
  $delete = Invoke-SupabaseRequest DELETE "rest/v1/ranking_entries?session_id=eq.$($sessions.a1)" $userA.Token
  Assert-Status $delete @(401, 403) 'client delete'
  $summary.updateDeleteDenied = $true

  $invalidCases = @(
    (New-RankingPayload $userA.Id $sessions.a4 'RLS_A_0811' -1 99),
    (New-RankingPayload $userA.Id $sessions.a5 'RLS_A_0811' 100 101),
    (New-RankingPayload $userA.Id $sessions.a6 'RLS_A_0811' 100 99 251),
    (New-RankingPayload $userA.Id $sessions.a7 'RLS_A_0811' 100 99 60 20 10 9999),
    (New-RankingPayload $userA.Id $sessions.a8 'bad name!' 100 99),
    (New-RankingPayload $userA.Id ([guid]::NewGuid().ToString()) 'RLS_A_0811' 100 99 60 0),
    (New-RankingPayload $userA.Id ([guid]::NewGuid().ToString()) 'RLS_A_0811' 100 99 60 20 41)
  )
  $invalidMode = New-RankingPayload $userA.Id ([guid]::NewGuid().ToString()) 'RLS_A_0811' 100 99
  $invalidMode.game_mode = 'daily'
  $invalidContentVersion = New-RankingPayload $userA.Id ([guid]::NewGuid().ToString()) 'RLS_A_0811' 100 99
  $invalidContentVersion.content_version = 'bad version'
  $invalidClientVersion = New-RankingPayload $userA.Id ([guid]::NewGuid().ToString()) 'RLS_A_0811' 100 99
  $invalidClientVersion.client_version = 'bad version'
  $invalidCases += @($invalidMode, $invalidContentVersion, $invalidClientVersion)
  foreach ($invalid in $invalidCases) {
    $invalidResponse = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $userA.Token $invalid
    Assert-Status $invalidResponse @(400) 'out-of-range insert'
  }
  $createdAtPayload = New-RankingPayload $userA.Id ([guid]::NewGuid().ToString()) 'RLS_A_0811' 100 99
  $createdAtPayload.created_at = '2000-01-01T00:00:00Z'
  $createdAtInsert = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $userA.Token $createdAtPayload
  Assert-Status $createdAtInsert @(401, 403) 'client-created timestamp insert'
  $summary.rangeAndProtectedColumnConstraints = $invalidCases.Count + 1

  $duplicate = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $userA.Token $payloadA1
  Assert-Status $duplicate @(409) 'duplicate session insert'
  $summary.duplicateDenied = $true

  $payloadA2 = New-RankingPayload $userA.Id $sessions.a2 'RLS_A_0811' 1200 99 65 24 12
  $payloadB1 = New-RankingPayload $userB.Id $sessions.b1 'RLS_B_0811' 1200 98 70 25 14
  $payloadB2 = New-RankingPayload $userB.Id $sessions.b2 'RLS_B_0811' 1300 97 55 21 9
  $payloadWrongVersion = New-RankingPayload $userB.Id $sessions.b3 'RLS_B_0811' 9999 100 100 40 40 240000 '0.9.0'
  foreach ($entry in @(
    @{ Token = $userA.Token; Payload = $payloadA2 },
    @{ Token = $userB.Token; Payload = $payloadB1 },
    @{ Token = $userB.Token; Payload = $payloadB2 },
    @{ Token = $userB.Token; Payload = $payloadWrongVersion }
  )) {
    $insert = Invoke-SupabaseRequest POST 'rest/v1/ranking_entries' $entry.Token $entry.Payload @{ Prefer = 'return=minimal' }
    Assert-Status $insert @(201) 'ranking setup insert'
  }

  $backdateSql = "update public.ranking_entries set created_at = now() - interval '2 days' where user_id = '$($userB.Id)'::uuid and session_id = '$($sessions.b2)'::uuid;"
  Invoke-ManagementSql $backdateSql

  $global = Invoke-SupabaseRequest POST 'rest/v1/rpc/get_global_ranking' $PublishableKey @{ p_content_version = '1.0.0'; p_limit = 100 }
  Assert-Status $global @(200) 'Global ranking RPC'
  if ($global.Data.Count -ne 2 -or $global.Data[0].score -ne 1300 -or $global.Data[1].score -ne 1200) {
    throw 'Global ranking did not deduplicate users or apply score ordering.'
  }
  $today = Invoke-SupabaseRequest POST 'rest/v1/rpc/get_today_ranking' $PublishableKey @{ p_content_version = '1.0.0'; p_limit = 100 }
  Assert-Status $today @(200) 'Today ranking RPC'
  if ($today.Data.Count -ne 2 -or $today.Data[0].player_name -ne 'RLS_A_0811' -or $today.Data[1].player_name -ne 'RLS_B_0811') {
    throw 'Today ranking did not apply UTC filtering and tie ordering.'
  }
  $summary.globalTodayFilterAndSort = $true

  $myBestA = Invoke-SupabaseRequest POST 'rest/v1/rpc/get_my_best' $userA.Token @{ p_content_version = '1.0.0' }
  Assert-Status $myBestA @(200) 'My Best RPC'
  if ($myBestA.Data.Count -ne 1 -or $myBestA.Data[0].score -ne 1200 -or $myBestA.Data[0].rank -ne 2) {
    throw 'My Best did not return the authenticated user global best.'
  }
  $myRankA = Invoke-SupabaseRequest POST 'rest/v1/rpc/get_my_rank' $userA.Token @{ p_session_id = $sessions.a2; p_content_version = '1.0.0' }
  Assert-Status $myRankA @(200) 'My Rank RPC'
  if ($myRankA.Data.Count -ne 1 -or $myRankA.Data[0].rank -ne 2) {
    throw 'My Rank did not return the authenticated session rank.'
  }
  $summary.myBestAndMyRank = $true

  $rawSelect = Invoke-SupabaseRequest GET 'rest/v1/ranking_entries?select=*' $PublishableKey
  Assert-Status $rawSelect @(401, 403) 'raw identifier-bearing SELECT'
  $summary.rawIdentifiersHidden = $true
}
finally {
  $userIds = @($userA, $userB) | Where-Object { $null -ne $_ } | ForEach-Object { "'$($_.Id)'::uuid" }
  if ($userIds.Count -gt 0) {
    $cleanupSql = "delete from auth.users where id in ($($userIds -join ', '));"
    Invoke-ManagementSql $cleanupSql
  }
  $cleanupCompleted = $true
}

$summary.cleanupCompleted = $cleanupCompleted
$summary | ConvertTo-Json
