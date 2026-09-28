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

/* ==========================================
   UNIDADES DE TEMPERATURA E PARÂMETROS DE GDU
   ========================================== */
const TEMP_UNITS = { C: '°C', F: '°F' };
const TEMP_UNIT_KEY = 'climaticos:tempUnit';

const GDU_BASE_OPTIONS = [
  { v: 10, tag: 'Milho / Soja' },
  { v: 5,  tag: 'Trigo / Inverno' },
  { v: 12, tag: 'Feijão / Arroz' },
  { v: 15, tag: 'Cana / Algodão' },
  { v: 8,  tag: 'Girassol' }
];
const GDU_CAP_OPTIONS = [
  { v: 30,   tag: 'Milho (DuPont)' },
  { v: 32,   tag: 'Teto alto' },
  { v: 26,   tag: 'Teto baixo' },
  { v: null, tag: 'Sem teto (clássico)' }
];
const GDU_DEFAULT_BASE = 10; // 50 °F — milho
const GDU_DEFAULT_CAP = 30;  // 86 °F — milho
const GDU_CAP_NONE = 'none';

let tempUnit = 'C';
try {
  if (localStorage.getItem(TEMP_UNIT_KEY) === 'F') tempUnit = 'F';
} catch (e) { /* storage indisponível: mantém °C */ }

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
  const gduCapSel = document.getElementById('gduCap');
  const tempUnitSel = document.getElementById('tempUnit');
  if (gduBaseSel) gduBaseSel.addEventListener('change', renderGDUDependents);
  if (gduCapSel) gduCapSel.addEventListener('change', renderGDUDependents);
  if (tempUnitSel) tempUnitSel.addEventListener('change', () => {
    tempUnit = tempUnitSel.value === 'F' ? 'F' : 'C';
    try { localStorage.setItem(TEMP_UNIT_KEY, tempUnit); } catch (e) { /* ignora */ }
    applyTempUnit();
    updateKPIs();
    renderAll();
  });

  document.getElementById('applyFilter').addEventListener('click', applyFilters);
  document.getElementById('resetFilter').addEventListener('click', () => {
    stSel.value = 'all';
    statesSel.value = 'all';
    if (gduBaseSel) gduBaseSel.value = String(GDU_DEFAULT_BASE);
    if (gduCapSel) gduCapSel.value = String(GDU_DEFAULT_CAP);
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

function toNum(v) { return (v == null || v === '' || isNaN(v)) ? null : Number(v); }

function tempUnitLabel() { return TEMP_UNITS[tempUnit] || TEMP_UNITS.C; }
function altUnitLabel() { return tempUnit === 'F' ? TEMP_UNITS.C : TEMP_UNITS.F; }
function cToF(c) { return c * 9 / 5 + 32; }
function toUnit(c) { const n = toNum(c); return n == null ? null : (tempUnit === 'F' ? cToF(n) : n); }
function gduToAltUnit(g) { return g * 9 / 5; }

function getTBase() {
  const el = document.getElementById('gduBase');
  if (!el) return GDU_DEFAULT_BASE;
  const v = parseFloat(el.value);
  return isNaN(v) ? GDU_DEFAULT_BASE : v;
}

function getTCap() {
  const el = document.getElementById('gduCap');
  if (!el || el.value === GDU_CAP_NONE) return null;
  const v = parseFloat(el.value);
  return isNaN(v) ? GDU_DEFAULT_CAP : v;
}

function gduBasisLabel() {
  const base = getTBase();
  const cap = getTCap();
  const u = tempUnitLabel();
  const baseTxt = `Base ${fmt(toUnit(base), 0)} ${u}`;
  return cap == null ? `${baseTxt} · Sem teto` : `${baseTxt} · Teto ${fmt(toUnit(cap), 0)} ${u}`;
}

/* Graus-Dia de Desenvolvimento — Soma Térmica (Gilmore & Rogers, 1958;
   DuPont Pioneer, Corn Growth and Development).

     GDD = ((Tmín. + Tmáx.) / 2) − Tbase

   Tmín. é a temperatura diária mínima, ou Tbase se for inferior a Tbase.
   Tmáx. é a temperatura diária máxima, ou Tteto se for superior a Tteto.
   Para o milho: Tbase = 50 °F (10 °C) e Tteto = 86 °F (30 °C) — abaixo de
   50 °F ou acima de 86 °F há pouco ou nenhum crescimento.

   Retorna °C·dia. O equivalente em °F·dia é o resultado × 9/5. */
function calcGDU(row, tBase = getTBase(), tCap = getTCap()) {
  let tMin = toNum(row.tair_min);
  let tMax = toNum(row.tair_max);
  if (tMin == null || tMax == null) {
    tMin = toNum(row.tair_mean);
    tMax = tMin;
  }
  if (tMin == null) return null;
  const lo = Math.max(tMin, tBase);
  const hi = tCap == null ? tMax : Math.min(tMax, tCap);
  return Math.max(0, (lo + hi) / 2 - tBase);
}

function dailyMeanGDU(data, tBase, tCap) {
  return getDateLabels(data).map(dt => {
    const gdus = data.filter(r => r.date === dt).map(r => calcGDU(r, tBase, tCap)).filter(v => v != null);
    return gdus.length ? gdus.reduce((a, b) => a + b, 0) / gdus.length : 0;
  });
}

function renderGDUDependents() {
  updateKPIs();
  renderGDUChart();
  renderTable();
}

function updateKPIs() {
  const d = filteredData;
  const stations = [...new Set(d.map(r => r.device))];
  const u = tempUnitLabel();
  document.getElementById('totalStations').textContent = `${stations.length} Estações`;
  document.getElementById('totalRecords').textContent  = `${d.length} Registros`;

  document.getElementById('kpi-temp-val').textContent   = fmt(toUnit(avg(d,'tair_mean'))) + ' ' + u;
  document.getElementById('kpi-temp-range').textContent = `Máx ${fmt(toUnit(maxVal(d,'tair_max')))} · Mín ${fmt(toUnit(minVal(d,'tair_min')))} ${u}`;
  document.getElementById('kpi-rh-val').textContent     = fmt(avg(d,'rh_mean'),0) + ' %';
  document.getElementById('kpi-precip-val').textContent = fmt(sum(d,'precip'),0) + ' mm';
  document.getElementById('kpi-et-val').textContent     = fmt(avg(d,'et')) + ' mm/dia';
  document.getElementById('kpi-wind-val').textContent   = fmt(avg(d,'wind_speed')) + ' m/s';
  document.getElementById('kpi-vpd-val').textContent    = fmt(avg(d,'vpd')) + ' kPa';
  document.getElementById('kpi-swdw-val').textContent   = fmt(avg(d,'swdw')) + ' MJ/m²';
  document.getElementById('kpi-ndvi-val').textContent   = fmt(avg(d,'ndvi'),2);

  // GDU — Soma térmica, sempre exibida nas duas unidades
  const tBase = getTBase();
  const tCap = getTCap();
  const dailyGDUs = dailyMeanGDU(d, tBase, tCap);
  const totalGDU = dailyGDUs.reduce((a, b) => a + b, 0);
  const avgGDU = dailyGDUs.length ? totalGDU / dailyGDUs.length : 0;
  const altGDU = tempUnit === 'F' ? totalGDU : gduToAltUnit(totalGDU);
  const isSingleStation = document.getElementById('stationFilter') && document.getElementById('stationFilter').value !== 'all';

  const gduValEl = document.getElementById('kpi-gdu-val');
  const gduAltEl = document.getElementById('kpi-gdu-alt');
  const gduSubEl = document.getElementById('kpi-gdu-sub');
  if (gduValEl) gduValEl.textContent = fmt(totalGDU, 0) + ' ' + u + '·dia';
  if (gduAltEl) gduAltEl.textContent = '≡ ' + fmt(altGDU, 0) + ' ' + altUnitLabel() + '·dia';
  if (gduSubEl) {
    gduSubEl.textContent = `${gduBasisLabel()} · Média ${fmt(avgGDU, 1)}/dia${isSingleStation ? '' : ' (Reg.)'}`;
  }
}

/* Rótulos estáticos que dependem da unidade de temperatura */
function findOption(id, value) {
  const el = document.getElementById(id);
  return el ? [...el.options].find(o => o.value === value) : null;
}

function applyTempUnit() {
  const u = tempUnitLabel();
  const tempUnitSel = document.getElementById('tempUnit');
  if (tempUnitSel) tempUnitSel.value = tempUnit;

  GDU_BASE_OPTIONS.forEach(o => {
    const opt = findOption('gduBase', String(o.v));
    if (opt) opt.textContent = `${fmt(toUnit(o.v), 0)} ${u} · ${o.tag}`;
  });
  GDU_CAP_OPTIONS.forEach(o => {
    const opt = findOption('gduCap', o.v == null ? GDU_CAP_NONE : String(o.v));
    if (opt) opt.textContent = o.v == null ? o.tag : `${fmt(toUnit(o.v), 0)} ${u} · ${o.tag}`;
  });

  const labels = {
    chartTempTitle: `🌡️ Temperatura Diária (${u})`,
    chartCompareSub: `Temperatura média (${u})`,
    thTempMean: `T. Média (${u})`,
    thTempMax: `T. Max (${u})`,
    thTempMin: `T. Min (${u})`,
    thGDU: `GDU Acum. (${u}·dia)`
  };
  Object.entries(labels).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
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
  const u = tempUnitLabel();
  const inUnit = key => aggregateByDate(filteredData, key).map(v => toUnit(v));
  makeLineChart('chartTemp', labels, [
    { label: `T. Máx (${u})`, data: inUnit('tair_max'), borderColor: '#fb923c', tension:0.3, fill:false, pointRadius:0 },
    { label: `T. Média (${u})`, data: inUnit('tair_mean'), borderColor: '#38bdf8', tension:0.3, fill:false, pointRadius:0 },
    { label: `T. Mín (${u})`, data: inUnit('tair_min'), borderColor: '#818cf8', backgroundColor:'rgba(129,140,248,0.08)', tension:0.3, fill:'-1', pointRadius:0 },
  ], u);
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
  const means    = stations.map(s => toUnit(avg(filteredData.filter(r=>r.device===s),'tair_mean')));
  makeBarChart('chartCompare', labels, [{ label:`T. Média (${tempUnitLabel()})`, data:means,
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
  const tCap = getTCap();
  const u = tempUnitLabel();
  const daily = dailyMeanGDU(filteredData, tBase, tCap);
  const basis = gduBasisLabel();

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
          label: `GDU Diário (${basis})`,
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
          title: { display: true, text: `GDU / dia (${u}·dia)`, color: '#8b9ab0', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8b9ab0', font: { size: 10 } }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: `GDU Acumulado (${u}·dia)`, color: '#34d399', font: { size: 10 } },
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
    const tCap = getTCap();
    const gduStation = d.map(r => calcGDU(r, tBase, tCap)).filter(v => v != null).reduce((a,b) => a+b, 0);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${s}</td><td>${info.site}</td><td>${info.city}</td><td>${info.state}</td>
      <td>${fmt(toUnit(avg(d,'tair_mean')))}</td><td>${fmt(toUnit(mx))}</td><td>${fmt(toUnit(mn))}</td>
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

  applyTempUnit();
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