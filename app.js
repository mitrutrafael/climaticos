/* =============================================
Agrometerologia Vylor — app.js
   Dashboard consome apenas os CSVs consolidados
   pelo pipeline ETL (GitHub Actions diário).
   Nenhuma chave de API é exposta no browser.
   ============================================= */

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // re-lê os CSVs a cada 30 min
const CSV_SOURCES = ['dados_climaticos_brasil.csv', 'dados_davis_brasil.csv'];

const PALETTE = ['#38bdf8','#818cf8','#34d399','#fb923c','#f472b6','#facc15','#a78bfa','#22d3ee'];
const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#8b9ab0', font: { size: 11, family: 'Inter' }, boxWidth: 12 } } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b9ab0', font: { size: 10 }, maxRotation: 45 } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b9ab0', font: { size: 10 } } }
  }
};

let rawData = [];
let filteredData = [];
let charts = {};
let refreshTimer = null;
let lastUpdate = null;
let filtersInitialized = false;

/* ==========================================
   CARGA DE DADOS — CSVs consolidados
   ========================================== */
function cachedUrl(file) {
  // Quebra o cache HTTP para buscar sempre a versão mais recente do CSV
  return file + '?t=' + encodeURIComponent(new Date().toISOString());
}

function parseCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: (e) => reject(e)
    });
  });
}

function normalize(row) {
  // Uniformiza tipos numéricos vindos do PapaParse (strings em alguns casos)
  ['tair_mean','tair_max','tair_min','rh_mean','precip','et','wind_speed','vpd','swdw','ndvi','lat','lon']
    .forEach(k => { if (row[k] !== '' && row[k] != null) { const n = Number(row[k]); row[k] = isNaN(n) ? null : n; } });
  return row;
}

async function loadFromCSV() {
  setLoadingState(true, 'Carregando dados consolidados...');
  try {
    const [arable, davis] = await Promise.all(
      CSV_SOURCES.map(source => parseCSV(cachedUrl(source)).then(rows => rows.map(normalize)))
    );
    rawData = [...arable, ...davis].filter(r => r.device && r.date);
    lastUpdate = new Date();
    setLoadingState(false);
    updateLastUpdateBadge();
    initFilters();
    applyFilters();
    showToast('📊 Dados carregados do pipeline ETL.');
    if (!rawData.length) throw new Error('CSVs sem registros');
  } catch (e) {
    console.error('Falha ao carregar CSVs:', e);
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.innerHTML =
        '<div style="text-align:center"><div style="font-size:2rem;margin-bottom:12px">⚠️</div><div>Não foi possível carregar os dados.<br>Verifique sua conexão ou execute o pipeline ETL.</div></div>';
    }
    setLoadingState(false);
  }
}

function setLoadingState(loading, msg = '') {
  let overlay = document.getElementById('loadingOverlay');
  if (loading) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(11,15,25,0.92);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;font-family:'Inter',sans-serif;color:#e8edf5;
        flex-direction:column;gap:16px;`;
      overlay.innerHTML = `
        <div class="spinner"></div>
        <div id="loadingMsg" style="font-size:0.9rem;color:#8b9ab0">${msg}</div>`;
      document.body.appendChild(overlay);
    } else {
      const msgEl = document.getElementById('loadingMsg');
      if (msgEl) msgEl.textContent = msg;
    }
  } else {
    if (overlay) overlay.remove();
  }
}

function updateLastUpdateBadge() {
  const badge = document.getElementById('lastUpdateBadge');
  if (!badge) return;
  if (lastUpdate) {
    badge.textContent = '↻ ' + lastUpdate.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    badge.title = 'Última atualização (CSVs): ' + lastUpdate.toLocaleString('pt-BR');
    badge.style.borderColor = 'var(--accent3)';
    badge.style.color = 'var(--accent3)';
  } else {
    badge.textContent = '—';
  }
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    // Filtros são reinicializados para capturar novas estações/datas
    filtersInitialized = false;
    loadFromCSV();
    showToast('🔄 Dados atualizados automaticamente!');
  }, REFRESH_INTERVAL_MS);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;background:#1a2236;
    border:1px solid var(--accent3);color:var(--text);
    padding:12px 20px;border-radius:10px;font-size:0.82rem;
    font-family:'Inter',sans-serif;z-index:9998;
    animation:fadeIn 0.3s ease;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ==========================================
   FILTERS
   ========================================== */
function fillOption(select, value) {
  const exists = [...select.options].some(o => o.value === value);
  if (!exists) select.add(new Option(value, value));
}

function initFilters() {
  if (filtersInitialized) return;
  filtersInitialized = true;

  const stations = [...new Set(rawData.map(r => r.device))].sort();
  const states   = [...new Set(rawData.map(r => r.state))].sort();
  const dates    = rawData.map(r => r.date).filter(Boolean).sort();

  const stSel = document.getElementById('stationFilter');
  stations.forEach(s => {
    const info = rawData.find(r => r.device === s);
    const label = info ? `${s} · ${info.city}` : s;
    fillOption(stSel, label);
    stSel.options[stSel.options.length - 1].value = s;
  });

  const statesSel = document.getElementById('stateFilter');
  states.forEach(s => fillOption(statesSel, s));

  if (!document.getElementById('startDate').value && dates.length) {
    document.getElementById('startDate').value = dates[0];
    document.getElementById('endDate').value   = dates[dates.length - 1];
  }

  const gduBaseSel = document.getElementById('gduBase');
  if (gduBaseSel) {
    gduBaseSel.addEventListener('change', () => {
      updateKPIs();
      renderGDUChart();
      renderTable();
    });
  }

  document.getElementById('applyFilter').addEventListener('click', applyFilters);
  document.getElementById('resetFilter').addEventListener('click', () => {
    stSel.value = 'all';
    statesSel.value = 'all';
    if (gduBaseSel) gduBaseSel.value = '10';
    document.getElementById('startDate').value = dates[0];
    document.getElementById('endDate').value   = dates[dates.length - 1];
    applyFilters();
  });
  document.getElementById('refreshBtn').addEventListener('click', () => {
    filtersInitialized = false;
    loadFromCSV();
    showToast('🔄 Buscando dados mais recentes...');
  });
}

function applyFilters() {
  const station   = document.getElementById('stationFilter').value;
  const state     = document.getElementById('stateFilter').value;
  const startDate = document.getElementById('startDate').value;
  const endDate   = document.getElementById('endDate').value;

  filteredData = rawData.filter(r => {
    if (station !== 'all' && r.device !== station) return false;
    if (state   !== 'all' && r.state   !== state)   return false;
    if (startDate && r.date < startDate) return false;
    if (endDate   && r.date > endDate)   return false;
    return true;
  });

  updateKPIs();
  renderAll();
}

/* ==========================================
   KPIs
   ========================================== */
function avg(arr, key) { const v = arr.map(r => r[key]).filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a,b) => a+b, 0)/v.length : null; }
function sum(arr, key) { return arr.map(r => r[key]).filter(x => x != null && !isNaN(x)).reduce((a,b) => a+b, 0); }
function maxVal(arr, key) { const v = arr.map(r => r[key]).filter(x => x != null && !isNaN(x)); return v.length ? Math.max(...v) : null; }
function minVal(arr, key) { const v = arr.map(r => r[key]).filter(x => x != null && !isNaN(x)); return v.length ? Math.min(...v) : null; }
function fmt(v, dec=1) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function getTBase() {
  const el = document.getElementById('gduBase');
  return el ? (parseFloat(el.value) || 10) : 10;
}

function calcRowGDU(row, tBase = 10) {
  let tMean = row.tair_mean;
  if (row.tair_max != null && row.tair_min != null) {
    tMean = (row.tair_max + row.tair_min) / 2;
  }
  if (tMean == null || isNaN(tMean)) return null;
  return Math.max(0, tMean - tBase);
}

function updateKPIs() {
  const d = filteredData;
  const stations = [...new Set(d.map(r => r.device))];
  document.getElementById('totalStations').textContent = `${stations.length} Estações`;
  document.getElementById('totalRecords').textContent  = `${d.length} Registros`;

  document.getElementById('kpi-temp-val').textContent   = fmt(avg(d,'tair_mean')) + ' °C';
  document.getElementById('kpi-temp-range').textContent = `Máx ${fmt(maxVal(d,'tair_max'))} · Mín ${fmt(minVal(d,'tair_min'))} °C`;
  document.getElementById('kpi-rh-val').textContent     = fmt(avg(d,'rh_mean'),0) + ' %';
  document.getElementById('kpi-precip-val').textContent = fmt(sum(d,'precip'),0) + ' mm';
  document.getElementById('kpi-et-val').textContent     = fmt(avg(d,'et')) + ' mm/dia';
  document.getElementById('kpi-wind-val').textContent   = fmt(avg(d,'wind_speed')) + ' m/s';
  document.getElementById('kpi-vpd-val').textContent    = fmt(avg(d,'vpd')) + ' kPa';
  document.getElementById('kpi-swdw-val').textContent   = fmt(avg(d,'swdw')) + ' MJ/m²';
  document.getElementById('kpi-ndvi-val').textContent   = fmt(avg(d,'ndvi'),2);

  // GDU (Graus-Dia de Desenvolvimento / Growing Degree Units)
  const tBase = getTBase();
  const dates = getDateLabels(d);
  const dailyMeanGDUs = dates.map(dt => {
    const dayRows = d.filter(r => r.date === dt);
    const gdus = dayRows.map(r => calcRowGDU(r, tBase)).filter(v => v != null);
    return gdus.length ? gdus.reduce((a,b) => a+b, 0) / gdus.length : 0;
  });
  const totalGDU = dailyMeanGDUs.reduce((a,b) => a+b, 0);
  const avgGDU = dates.length ? totalGDU / dates.length : 0;
  const isSingleStation = document.getElementById('stationFilter') && document.getElementById('stationFilter').value !== 'all';

  const gduValEl = document.getElementById('kpi-gdu-val');
  const gduSubEl = document.getElementById('kpi-gdu-sub');
  if (gduValEl) gduValEl.textContent = fmt(totalGDU, 0) + ' GDU';
  if (gduSubEl) {
    gduSubEl.textContent = `Média: ${fmt(avgGDU, 1)}/dia · Base ${tBase}°C${isSingleStation ? '' : ' (Reg.)'}`;
  }
}

/* ==========================================
   CHARTS
   ========================================== */
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); charts[id] = null; } }
function getDateLabels(data) { return [...new Set(data.map(r => r.date).filter(Boolean))].sort(); }
function aggregateByDate(data, key, fn='avg') {
  return getDateLabels(data).map(d => {
    const vals = data.filter(r => r.date === d).map(r => r[key]).filter(x => x != null && !isNaN(x));
    if (!vals.length) return null;
    return fn === 'sum' ? vals.reduce((a,b)=>a+b,0) : vals.reduce((a,b)=>a+b,0)/vals.length;
  });
}

function makeLineChart(id, labels, datasets, yLabel='') {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'line', data: { labels, datasets },
    options: {
      ...CHART_DEFAULTS,
      interaction: { mode: 'index', intersect: false },
      plugins: { ...CHART_DEFAULTS.plugins, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x,
          ticks: { ...CHART_DEFAULTS.scales.x.ticks, callback(v,i) {
            const skip = Math.ceil(labels.length / 15);
            return i % skip === 0 ? labels[i] : '';
          }}
        },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: !!yLabel, text: yLabel, color: '#8b9ab0', font:{size:10} } }
      }
    }
  });
}

function makeBarChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: { ...CHART_DEFAULTS } });
}

function renderAll() {
  renderTempChart(); renderPrecipChart(); renderRHChart();
  renderETChart(); renderVPDChart(); renderCompareChart();
  renderGDUChart(); renderWindChart(); renderSWDWChart(); renderTable();
}

function renderTempChart() {
  const labels = getDateLabels(filteredData);
  makeLineChart('chartTemp', labels, [
    { label: 'T. Máx', data: aggregateByDate(filteredData,'tair_max'), borderColor: '#fb923c', tension:0.3, fill:false, pointRadius:0 },
    { label: 'T. Média', data: aggregateByDate(filteredData,'tair_mean'), borderColor: '#38bdf8', tension:0.3, fill:false, pointRadius:0 },
    { label: 'T. Mín', data: aggregateByDate(filteredData,'tair_min'), borderColor: '#818cf8', backgroundColor:'rgba(129,140,248,0.08)', tension:0.3, fill:'-1', pointRadius:0 },
  ], '°C');
}

function renderPrecipChart() {
  const labels = getDateLabels(filteredData);
  const precip = aggregateByDate(filteredData, 'precip', 'sum');
  makeBarChart('chartPrecip', labels, [{ label:'Precipitação (mm)', data:precip,
    backgroundColor: precip.map(v => v > 0 ? 'rgba(56,189,248,0.75)' : 'rgba(56,189,248,0.15)'),
    borderColor:'#38bdf8', borderWidth:1, borderRadius:3 }]);
}

function renderRHChart() {
  const labels = getDateLabels(filteredData);
  makeLineChart('chartRH', labels, [{ label:'UR (%)', data:aggregateByDate(filteredData,'rh_mean'),
    borderColor:'#34d399', backgroundColor:'rgba(52,211,153,0.1)', fill:true, tension:0.3, pointRadius:0 }], '%');
}

function renderETChart() {
  const labels = getDateLabels(filteredData);
  makeLineChart('chartET', labels, [{ label:'ETo (mm/dia)', data:aggregateByDate(filteredData,'et'),
    borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,0.1)', fill:true, tension:0.3, pointRadius:0 }], 'mm/dia');
}

function renderVPDChart() {
  const labels = getDateLabels(filteredData);
  makeLineChart('chartVPD', labels, [{ label:'VPD (kPa)', data:aggregateByDate(filteredData,'vpd'),
    borderColor:'#facc15', backgroundColor:'rgba(250,204,21,0.1)', fill:true, tension:0.3, pointRadius:0 }], 'kPa');
}

function renderSWDWChart() {
  const labels = getDateLabels(filteredData);
  makeLineChart('chartSWDW', labels, [{ label:'Radiação Solar (MJ/m²)', data:aggregateByDate(filteredData,'swdw'),
    borderColor:'#fb923c', backgroundColor:'rgba(251,146,60,0.1)', fill:true, tension:0.3, pointRadius:0 }], 'MJ/m²');
}

function renderCompareChart() {
  const stations = [...new Set(filteredData.map(r => r.device))].sort();
  const labels   = stations.map(s => { const i = filteredData.find(r=>r.device===s); return `${s}\n${i.city}`; });
  const means    = stations.map(s => avg(filteredData.filter(r=>r.device===s),'tair_mean'));
  makeBarChart('chartCompare', labels, [{ label:'T. Média (°C)', data:means,
    backgroundColor: stations.map((_,i)=>PALETTE[i%PALETTE.length]+'99'),
    borderColor: stations.map((_,i)=>PALETTE[i%PALETTE.length]), borderWidth:1.5, borderRadius:6 }]);
}

function renderGDUChart() {
  destroyChart('chartGDU');
  const canvas = document.getElementById('chartGDU');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = getDateLabels(filteredData);
  const tBase = getTBase();

  const daily = labels.map(d => {
    const vals = filteredData.filter(r => r.date === d).map(r => calcRowGDU(r, tBase)).filter(x => x != null);
    return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
  });

  let runningSum = 0;
  const cumulative = daily.map(v => {
    runningSum += (v || 0);
    return Number(runningSum.toFixed(1));
  });

  charts['chartGDU'] = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: `GDU Diário (Base ${tBase}°C)`,
          data: daily.map(v => Number(v.toFixed(1))),
          backgroundColor: 'rgba(56, 189, 248, 0.4)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          borderRadius: 2,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'GDU Acumulado',
          data: cumulative,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.08)',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          ticks: {
            ...CHART_DEFAULTS.scales.x.ticks,
            callback(v, i) {
              const skip = Math.ceil(labels.length / 15);
              return i % skip === 0 ? labels[i] : '';
            }
          }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'GDU / dia', color: '#8b9ab0', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8b9ab0', font: { size: 10 } }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'GDU Acumulado', color: '#34d399', font: { size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { color: '#34d399', font: { size: 10 } }
        }
      }
    }
  });
}

function renderWindChart() {
  const labels   = getDateLabels(filteredData);
  const stations = [...new Set(filteredData.map(r => r.device))].sort();
  const datasets = stations.map((s,i) => {
    const sd = filteredData.filter(r=>r.device===s);
    return { label:`${s}·${sd[0].city}`, borderColor:PALETTE[i%PALETTE.length],
      backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:1.5,
      data: labels.map(d => { const v=sd.filter(r=>r.date===d).map(r=>r.wind_speed).filter(x=>x!=null); return v.length?v.reduce((a,b)=>a+b)/v.length:null; }) };
  });
  makeLineChart('chartWind', labels, datasets, 'm/s');
}

function renderTable() {
  const stations = [...new Set(filteredData.map(r => r.device))].sort();
  const tbody = document.getElementById('stationsTableBody');
  tbody.innerHTML = '';
  stations.forEach(s => {
    const d = filteredData.filter(r=>r.device===s);
    const info = d[0];
    const mx = maxVal(d,'tair_max');
    const mn = minVal(d,'tair_min');
    const tBase = getTBase();
    const gduStation = d.map(r => calcRowGDU(r, tBase)).filter(v => v != null).reduce((a,b) => a+b, 0);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${s}</td><td>${info.site}</td><td>${info.city}</td><td>${info.state}</td>
      <td>${fmt(avg(d,'tair_mean'))}</td><td>${fmt(mx)}</td><td>${fmt(mn)}</td>
      <td><strong>${fmt(gduStation, 0)}</strong></td>
      <td>${fmt(avg(d,'rh_mean'),0)}</td><td>${fmt(sum(d,'precip'),1)}</td>
      <td>${fmt(avg(d,'et'))}</td><td>${fmt(avg(d,'wind_speed'))}</td>
      <td>${info.wind_dir || '—'}</td><td>${fmt(avg(d,'vpd'))}</td>
      <td>${fmt(avg(d,'swdw'))}</td><td>${fmt(avg(d,'ndvi'),2)}</td>
      <td>${info.lat ? Number(info.lat).toFixed(4) : '—'}</td>
      <td>${info.lon ? Number(info.lon).toFixed(4) : '—'}</td>`;
    tbody.appendChild(row);
  });
}

/* ==========================================
   BOOT
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Intervalo padrão: últimos 48 meses (4 anos)
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 48);
  const fmt8601 = d => d.toISOString().split('T')[0];

  document.getElementById('startDate').value = fmt8601(start);
  document.getElementById('endDate').value   = fmt8601(today);

  loadFromCSV();
  scheduleAutoRefresh();
});

// CSS do spinner inline
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
  .spinner { width:48px;height:48px;border:4px solid rgba(56,189,248,0.2);
    border-top-color:#38bdf8;border-radius:50%;animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`;
document.head.appendChild(spinnerStyle);