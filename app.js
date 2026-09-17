/* =============================================
   Estacoes Arable Brazil — app.js
   Dados ao vivo via Arable Cloud API (CORS OK)
   Atualização automática a cada 30 minutos
   ============================================= */

const API_KEY  = 'fe8e9cf2-b5b8-4f0b-90e9-1163ada8a2f7';
const API_BASE = 'https://api.arable.cloud/api/v2';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const API_TIMEOUT_MS = 15000; // timeout por requisição à API

const BR_STATIONS = [
  { name:'D009893', site:'BO Fatima do Sul',    city:'Fatima do Sul',     state:'MS' },
  { name:'D009889', site:'BF Toledo Area 2',    city:'Toledo',             state:'PR' },
  { name:'D009881', site:'BH Indianopolis',      city:'Indianópolis',      state:'MG' },
  { name:'D006582', site:'BW Mogi Mirim',        city:'Mogi Mirim',        state:'SP' },
  { name:'D006917', site:'BC Planaltina',        city:'Planaltina',        state:'DF' },
  { name:'D006926', site:'PC Sao Luiz Gonzaga',  city:'São Luiz Gonzaga',  state:'RS' },
  { name:'D006642', site:'BL Ponta Grossa',      city:'Ponta Grossa',      state:'PR' },
  { name:'D009895', site:'PC Cruz Alta',         city:'Cruz Alta',         state:'RS' },
  { name:'D009878', site:'BM Sorriso',           city:'Sorriso',           state:'MT' },
  { name:'D009876', site:'Corteva GPB BL',       city:'Ponta Grossa',      state:'PR' },
];

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
let csvData = [];
let filteredData = [];
let charts = {};
let refreshTimer = null;
let lastUpdate = null;

function fetchWithTimeout(url, options = {}, ms = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/* ==========================================
   FETCH LIVE DATA — Arable API
   ========================================== */
async function fetchLiveData(startDate, endDate) {
  setLoadingState(true, 'Buscando dados ao vivo...');
  rawData = [];

const fetchPromises = BR_STATIONS.map(async (station) => {
    const url = `${API_BASE}/data/daily?device=${station.name}&start_time=${startDate}&end_time=${endDate}&limit=200`;
    try {
      const res = await fetchWithTimeout(url, {
        headers: { 'Authorization': `Apikey ${API_KEY}` }
      });
      if (!res.ok) return;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) return;

      return items.map(item => ({
        device:     station.name,
        site:       station.site,
        city:       station.city,
        state:      station.state,
        date:       (item.time || '').split('T')[0],
        tair_mean:  item.meant    ?? null,
        tair_max:   item.maxt    ?? null,
        tair_min:   item.mint    ?? null,
        rh_mean:    item.mean_rh != null ? Math.round(item.mean_rh * 1000) / 10 : null,
        precip:     item.precip  ?? null,
        et:         item.et      ?? null,
        wind_speed: item.wind_speed ?? null,
        wind_dir:   item.wind_direction ?? null,
        vpd:        item.vpd     ?? null,
        swdw:       item.swdw    ?? null,
        ndvi:       item.ndvi    ?? null,
        lat:        item.lat     ?? null,
        lon:        item.long    ?? null,
      }));
    } catch (e) {
      console.warn(`Erro ao buscar ${station.name}:`, e);
      return [];
    }
  });

const results = await Promise.all(fetchPromises);
  results.forEach(rows => { if (rows) rawData.push(...rows); });

  if (rawData.length === 0) {
    if (csvData.length) {
      // API indisponível/muitos dados: mantém a base local já carregada
      rawData = csvData;
      lastUpdate = null;
      setLoadingState(false);
      updateLastUpdateBadge();
      showToast('📁 API indisponível — usando dados da base local.');
      initFilters();
      applyFilters();
      return;
    }
    // Sem API e sem CSV: tenta carregar o CSV local
    await loadFromCSV();
    return;
  }

  lastUpdate = new Date();
  setLoadingState(false);
  updateLastUpdateBadge();
  initFilters();
  applyFilters();
}

async function loadFromCSV() {
  console.warn('API falhou, tentando CSV local...');
  setLoadingState(true, 'Carregando CSV local...');
  return new Promise((resolve) => {
    Papa.parse('dados_climaticos_brasil.csv', {
      download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
      complete(result) {
        csvData = result.data;
        rawData = csvData;
        lastUpdate = null; // indica dados locais
        setLoadingState(false);
        updateLastUpdateBadge();
        initFilters();
        applyFilters();
        resolve();
      },
      error() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
          overlay.innerHTML =
            '<div style="text-align:center"><div style="font-size:2rem;margin-bottom:12px">⚠️</div><div>Sem conexão com a API e sem CSV local.<br>Verifique sua conexão.</div></div>';
        }
        setLoadingState(false);
        resolve();
      }
    });
  });
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
      document.getElementById('loadingMsg').textContent = msg;
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
    badge.title = 'Última atualização: ' + lastUpdate.toLocaleString('pt-BR');
    badge.style.borderColor = 'var(--accent3)';
    badge.style.color = 'var(--accent3)';
  } else {
    badge.textContent = '📁 Dados locais';
    badge.style.borderColor = 'var(--accent4)';
    badge.style.color = 'var(--accent4)';
  }
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const startDate = document.getElementById('startDate').value;
    const endDate   = document.getElementById('endDate').value;
    fetchLiveData(startDate, endDate);
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
let filtersInitialized = false;

function initFilters() {
  if (filtersInitialized) return;
  filtersInitialized = true;

  const stations = [...new Set(rawData.map(r => r.device))].sort();
  const states   = [...new Set(rawData.map(r => r.state))].sort();
  const dates    = rawData.map(r => r.date).filter(Boolean).sort();

  const stSel = document.getElementById('stationFilter');
  const existingDevices = [...stSel.options].map(o => o.value);
  stations.forEach(s => {
    if (!existingDevices.includes(s)) {
      const label = rawData.find(r => r.device === s);
      stSel.add(new Option(`${s} · ${label.city}`, s));
    }
  });

  const statesSel = document.getElementById('stateFilter');
  const existingStates = [...statesSel.options].map(o => o.value);
  states.forEach(s => { if (!existingStates.includes(s)) statesSel.add(new Option(s, s)); });

  if (!document.getElementById('startDate').value && dates.length) {
    document.getElementById('startDate').value = dates[0];
    document.getElementById('endDate').value   = dates[dates.length - 1];
  }

  document.getElementById('applyFilter').addEventListener('click', applyFilters);
  document.getElementById('resetFilter').addEventListener('click', () => {
    stSel.value = 'all';
    statesSel.value = 'all';
    document.getElementById('startDate').value = dates[0];
    document.getElementById('endDate').value   = dates[dates.length - 1];
    applyFilters();
  });
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const s = document.getElementById('startDate').value;
    const e = document.getElementById('endDate').value;
    filtersInitialized = false;
    fetchLiveData(s, e);
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
function fmt(v, dec=1) { return v != null && !isNaN(v) ? Number(v).toFixed(dec) : '—'; }

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
  renderWindChart(); renderTable();
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

function renderCompareChart() {
  const stations = [...new Set(filteredData.map(r => r.device))].sort();
  const labels   = stations.map(s => { const i = filteredData.find(r=>r.device===s); return `${s}\n${i.city}`; });
  const means    = stations.map(s => avg(filteredData.filter(r=>r.device===s),'tair_mean'));
  makeBarChart('chartCompare', labels, [{ label:'T. Média (°C)', data:means,
    backgroundColor: stations.map((_,i)=>PALETTE[i%PALETTE.length]+'99'),
    borderColor: stations.map((_,i)=>PALETTE[i%PALETTE.length]), borderWidth:1.5, borderRadius:6 }]);
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
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${s}</td><td>${info.site}</td><td>${info.city}</td><td>${info.state}</td>
      <td>${fmt(avg(d,'tair_mean'))}</td><td>${fmt(mx)}</td><td>${fmt(mn)}</td>
      <td>${fmt(avg(d,'rh_mean'),0)}</td><td>${fmt(sum(d,'precip'),1)}</td>
      <td>${fmt(avg(d,'et'))}</td><td>${fmt(avg(d,'wind_speed'))}</td><td>${fmt(avg(d,'vpd'))}</td>`;
    tbody.appendChild(row);
  });
}

/* ==========================================
   BOOT
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Calcular intervalo padrão: últimos 60 dias
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 60);
  const fmt8601 = d => d.toISOString().split('T')[0];

  document.getElementById('startDate').value = fmt8601(start);
  document.getElementById('endDate').value   = fmt8601(today);

  // 1) Carrega a base local primeiro (rápido e confiável)
  loadFromCSV().then(() => {
    // 2) Tenta atualizar com a API ao vivo em segundo plano
    const s = document.getElementById('startDate').value;
    const e = document.getElementById('endDate').value;
    fetchLiveData(s, e);
  });

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
