# ============================================================
# atualizar_davis.ps1
# Baixa os dados diÃ¡rios das estaÃ§Ãµes Davis (WeatherLink v2)
# e gera dados_davis_brasil.csv no mesmo formato do Arable
# (mÃ©trico: Â°C, ToMm, m/s, kPa).
#
# Uso:
#   $env:DAVIS_API_KEY   = "<sua chave>"
#   $env:DAVIS_API_SECRET = "<seu segredo>"
#   powershell -ExecutionPolicy Bypass -File atualizar_davis.ps1
#
# O segredo NÃƒO deve ser commitado no repositÃ³rio.
# ============================================================

[CmdletBinding()]
param(
  [string]$StartDate = ((Get-Date).AddDays(-30)).ToString('yyyy-MM-dd'),
  [string]$EndDate   = (Get-Date).ToString('yyyy-MM-dd'),
  [string]$OutFile   = 'dados_davis_brasil.csv'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$API_KEY   = $env:DAVIS_API_KEY
$API_SECRET = $env:DAVIS_API_SECRET
if (-not $API_KEY -or -not $API_SECRET) {
  Write-Error 'Defina as variÃ¡veis de ambiente DAVIS_API_KEY e DAVIS_API_SECRET antes de rodar.'
}

$BASE = 'https://api.weatherlink.com/v2'

# EstaÃ§Ãµes Davis no Brasil com histÃ³rico (assinatura Pro)
$STATIONS = @(
  @{ id = 13917; device = 'DV13917'; site = 'Corteva Passo Fundo';  city = 'Passo Fundo';  state = 'RS'; lat = -28.12846;  lon = -52.30285  },
  @{ id = 16450; device = 'DV16450'; site = 'Corteva Guarapuava';   city = 'Guarapuava';   state = 'PR'; lat = -25.58853;  lon = -51.49284  },
  @{ id = 18648; device = 'DV18648'; site = 'Corteva Ponta Grossa'; city = 'Ponta Grossa'; state = 'PR'; lat = -25.26254;  lon = -50.095493 },
  @{ id = 59252; device = 'DV59252'; site = 'Corteva Toledo';       city = 'Toledo';       state = 'PR'; lat = -24.67118;  lon = -53.76017  }
)

function Get-Historic($stationId, $sinceEpoch, $endEpoch) {
  $url = "$BASE/historic/${stationId}?api-key=${API_KEY}&start-timestamp=$sinceEpoch&end-timestamp=$endEpoch"
  $headers = @{ 'X-Api-Secret' = $API_SECRET }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    } catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Seconds 1
    }
  }
}

function To-Utc([long]$epoch) { return [datetimeoffset]::FromUnixTimeSeconds($epoch).UtcDateTime }

function DegTo-Compass([double]$deg) {
  if ([double]::IsNaN($deg) -or $deg -lt 0) { return '' }
  $dirs = @('N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW')
  $idx = [int][Math]::Floor((($deg % 360) + 11.25) / 22.5) % 16
  return $dirs[$idx]
}

function ToDegC([double]$f) { if ($null -eq $f) { return $null }; return [Math]::Round(($f - 32) * 5 / 9, 1) }
function ToMm([double]$in) { if ($null -eq $in) { return $null }; return [Math]::Round($in * 25.4, 1) }
function ToMs([double]$mph) { if ($null -eq $mph) { return $null }; return [Math]::Round($mph * 0.44704, 2) }
function Calc-Vpd([double]$tC, [double]$rh) {
  if ($null -eq $tC -or $null -eq $rh) { return $null }
  $es = 0.6108 * [Math]::Exp(17.27 * $tC / ($tC + 237.3))
  $ea = $es * ($rh / 100)
  return [Math]::Round($es - $ea, 2)
}
function Round1($v) { if ($null -eq $v) { return $null }; return [Math]::Round($v, 1) }
function Avg($arr) {
  $arr = @($arr | Where-Object { $_ -ne $null })
  if ($arr.Count -eq 0) { return $null }
  return ($arr | Measure-Object -Average).Average
}

Write-Host "Baixando dados Davis de $StartDate ate $EndDate ..."

$rows = [System.Collections.Generic.List[object]]::new()
$start = [datetime]::ParseExact($StartDate, 'yyyy-MM-dd', $null)
$end   = [datetime]::ParseExact($EndDate, 'yyyy-MM-dd', $null)

foreach ($st in $STATIONS) {
  Write-Host "  -> $($st.site) ($($st.state))"
  $records = [System.Collections.Generic.List[object]]::new()
  # API limita a janela a 86.400 s (24 h) por chamada
  $chunkDays = 1
  for ($d = $start; $d -lt $end; ) {
    $chunkEnd = $d.AddDays($chunkDays)
    if ($chunkEnd -gt $end) { $chunkEnd = $end }
    $since = [int64]::Parse(($d.ToUniversalTime().Subtract([datetime]'1970-01-01')).TotalSeconds)
    $until = [int64]::Parse(($chunkEnd.ToUniversalTime().Subtract([datetime]'1970-01-01')).TotalSeconds)
    try {
      $r = Get-Historic $st.id $since $until
      foreach ($sensor in $r.sensors) {
        foreach ($rec in $sensor.data) {
          $records.Add($rec)
        }
      }
    } catch {
      Write-Warning "Falha em $d para $($st.id): $($_.Exception.Message)"
    }
    $d = $chunkEnd
    Start-Sleep -Milliseconds 150
  }

  # Agrega por dia local (ts + tz_offset)
  $byDay = @{}
  foreach ($rec in $records) {
    $local = (To-Utc $rec.ts).AddSeconds([long]$rec.tz_offset)
    $day = $local.ToString('yyyy-MM-dd')
    if (-not $byDay.ContainsKey($day)) { $byDay[$day] = [System.Collections.Generic.List[object]]::new() }
    $byDay[$day].Add($rec)
  }

  foreach ($day in ($byDay.Keys | Sort-Object)) {
    $list = $byDay[$day]
    $tC     = Round1 (Avg ($list | ForEach-Object { ToDegC $_.temp_out }))
    $tMax   = Round1 (($list | ForEach-Object { ToDegC $_.temp_out_hi } | Measure-Object -Maximum).Maximum)
    $tMin   = Round1 (($list | ForEach-Object { ToDegC $_.temp_out_lo } | Measure-Object -Minimum).Minimum)
    $rh     = Round1 (Avg ($list | ForEach-Object { $_.hum_out }))
    $precip = Round1 (($list | ForEach-Object { $_.rainfall_mm } | Measure-Object -Sum).Sum)
    $et     = Round1 (($list | ForEach-Object { ToMm $_.et } | Measure-Object -Sum).Sum)
    $wind   = Round1 (Avg ($list | ForEach-Object { ToMs $_.wind_speed_avg }))
    $wdPrev = (0.0 + (($list | Where-Object { $null -ne $_.wind_dir_of_prevail } | Select-Object -First 1).wind_dir_of_prevail))
    if ($null -eq $wdPrev) { $wdPrev = '' } else { $wdPrev = DegTo-Compass $wdPrev }
    $swdw   = Round1 (Avg ($list | ForEach-Object { $_.solar_rad_avg }))
    $vpd    = Calc-Vpd (Avg ($list | ForEach-Object { ToDegC $_.temp_out })) (Avg ($list | ForEach-Object { $_.hum_out }))

    $rows.Add([pscustomobject]@{
      device      = $st.device
      site        = $st.site
      city        = $st.city
      state       = $st.state
      date        = $day
      tair_mean   = $tC
      tair_max    = $tMax
      tair_min    = $tMin
      rh_mean     = $rh
      precip      = $precip
      et          = $et
      wind_speed  = $wind
      wind_dir    = $wdPrev
      vpd         = $vpd
      swdw        = $swdw
      ndvi        = $null
      lat         = $st.lat
      lon         = $st.lon
    })
  }
}

$rows | Export-Csv -Path $OutFile -NoTypeInformation -Encoding UTF8
Write-Host "Pronto! $($rows.Count) registros gravados em $OutFile"