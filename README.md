# 🌤️ Agrometerologia Vylor — Projeto de Dados Climáticos

> Dashboard interativo e análise estatística dos dados das estações **Arable** e **Davis** no Brasil.

**🔗 Dashboard online**: [https://mitrutrafael.github.io/climaticos/](https://mitrutrafael.github.io/climaticos/)

---

## 📋 Sobre o Projeto

O **Agrometerologia Vylor** é uma plataforma de visualização e análise de dados climáticos coletados por estações físicas **Arable** e **Davis** distribuídas pelo Brasil. O sistema consome a **Arable Cloud API** e a **WeatherLink v2 API**, consolida os dados em CSVs e publica um dashboard estático (GitHub Pages / Netlify).

---

## 🗄️ Arquitetura (ETL em Python)

```
        ┌─────────────────┐        ┌──────────────────┐
        │  Arable Cloud   │        │ WeatherLink v2    │
        │  API v2         │        │ (Davis)           │
        └────────┬────────┘        └─────────┬─────────┘
                 │  (ARABLE_API_KEY)         │ (DAVIS_API_KEY + SECRET)
                 ▼                           ▼
        ┌──────────────── cloning extract ───────────────┐
        │  src/climaticos/extract/arable.py             │
        │  src/climaticos/extract/davis.py              │
        └──────────────────────┬─────────────────────────┘
                               ▼
        ┌──────────────── transform ────────────────────┐
        │  units.py  → °F→°C, in→mm, mph→m/s, VPD         │
        │  daily.py  → agregação diária por estação      │
        └──────────────────────┬─────────────────────────┘
                               ▼
        ┌────────────────── load ───────────────────────┐
        │  csv_loader.py → upsert (history + janela)     │
        │                  escrita atômica              │
        └──────────────────────┬─────────────────────────┘
                               ▼
        ┌────────── dados_climaticos_brasil.csv ────────┐
        │          dados_davis_brasil.csv               │
        └──────────────────────┬────────────────────────┘
                               ▼
        ┌──────────────── Dashboard (estático) ─────────┐
        │  index.html + app.js + style.css → CSVs        │
        └────────────────────────────────────────────────┘
```

O pipeline segue o padrão **extract → transform → load**, com os CSVs servindo de
"contrato" entre a coleta (Python) e a visualização (browser). Nenhuma chave de API
é exposta no frontend.

### Módulos

| Módulo | Responsabilidade |
|--------|------------------|
| `src/climaticos/config.py` | Configuração via variáveis de ambiente + catálogo de estações |
| `src/climaticos/extract/base.py` | Cliente HTTP resiliente (retry + backoff exponencial + timeout) |
| `src/climaticos/extract/arable.py` | Extração Arable Cloud (dados diários) |
| `src/climaticos/extract/davis.py` | Extração WeatherLink v2 (fatias diárias por estação) |
| `src/climaticos/transform/units.py` | Conversões de unidades e cálculo de VPD |
| `src/climaticos/transform/daily.py` | Agregação diária dos registros brutos Davis |
| `src/climaticos/load/csv_loader.py` | Upsert com histórico + escrita atômica |
| `src/climaticos/pipeline.py` | Orquestração do fluxo completo |
| `main.py` | CLI de ponto de entrada |

---

## 🏭 Estações Monitoradas (Brasil)

### Arable

| Dispositivo | Site | Cidade | UF | Status |
|-------------|------|--------|----|--------|
| D009893 | BO Fatima do Sul | Fatima do Sul | MS | ✅ Ativa |
| D009889 | BF Toledo Area 2 | Toledo | PR | ✅ Ativa |
| D009881 | BH Indianopolis | Indianópolis | MG | ✅ Ativa |
| D006582 | BW Mogi Mirim | Mogi Mirim | SP | ✅ Ativa |
| D006917 | BC Planaltina | Planaltina | DF | ✅ Ativa |
| D006926 | PC Sao Luiz Gonzaga | São Luiz Gonzaga | RS | ⚠️ Inativa (bateria) |
| D006642 | BL Ponta Grossa | Ponta Grossa | PR | ✅ Ativa |
| D009895 | PC Cruz Alta | Cruz Alta | RS | ⚠️ Inativa (bateria) |
| D009878 | BM Sorriso | Sorriso | MT | ✅ Ativa |
| D009876 | Corteva GPB BL | Ponta Grossa | PR | ✅ Ativa |

### Davis (WeatherLink)

| Dispositivo | Site | Cidade | UF | Status |
|-------------|------|--------|----|--------|
| DV13917 | Corteva Passo Fundo | Passo Fundo | RS | ✅ Ativa |
| DV16450 | Corteva Guarapuava | Guarapuava | PR | ✅ Ativa |
| DV18648 | Corteva Ponta Grossa | Ponta Grossa | PR | ✅ Ativa |
| DV59252 | Corteva Toledo | Toledo | PR | ✅ Ativa |

> O catálogo de estações fica em `src/climaticos/config.py`. Para incluir/excluir uma
> estação, edite apenas esse arquivo.

---

## 📊 Variáveis Climáticas

| Variável | Unidade | Descrição |
|----------|---------|-----------|
| `tair_mean` | °C | Temperatura média diária |
| `tair_max` | °C | Temperatura máxima diária |
| `tair_min` | °C | Temperatura mínima diária |
| `rh_mean` | % | Umidade relativa média |
| `precip` | mm | Precipitação total diária |
| `et` | mm/dia | Evapotranspiração de referência (ETo) |
| `wind_speed` | m/s | Velocidade média do vento |
| `wind_dir` | — | Direção predominante do vento |
| `vpd` | kPa | Déficit de Pressão de Vapor |
| `swdw` | W/m² | Radiação solar incidente |
| `ndvi` | — | Índice de Vegetação por Diferença Normalizada |

---

## 🚀 Como Usar (Pipeline ETL)

### 1. Configurar credenciais

```powershell
$env:ARABLE_API_KEY   = "sua chave"
$env:DAVIS_API_KEY    = "sua chave"
$env:DAVIS_API_SECRET = "seu segredo"
```

Ou copie `.env.example` para `.env` e preencha (o script não lê `.env` por padrão;
use as variáveis de ambiente do sistema ou do CI).

### 2. Instalar dependências

```bash
pip install -r requirements.txt
```

### 3. Executar

```bash
# Últimos 30 dias (padrão, preserva o histórico)
python main.py

# Período explícito
python main.py --start 2026-07-01 --end 2026-09-17

# Apenas uma fonte
python main.py --arable-only
python main.py --davis-only

# Log detalhado
python main.py --log-level DEBUG
```

> O pipeline **preserva o histórico** existente: baixa apenas a janela solicitada
> (padrão: últimos 30 dias) e faz *upsert* por `device + date`. Para rebaixar todo o
> histórico, delete o CSV e rode com o período completo.

---

## 🤖 Automação (GitHub Actions)

| Workflow | Gatilho | Ação |
|----------|---------|------|
| `atualizar-dados.yml` | 06:00 UTC diário + manual | Roda o ETL e faz commit/push dos CSVs |
| `deploy-pages.yml` | push no `main` | Publica o site no GitHub Pages |
| `ci.yml` | push/PR | Lint (ruff) + testes (pytest) |

### Secrets obrigatórios no GitHub

- `ARABLE_API_KEY`
- `DAVIS_API_KEY`
- `DAVIS_API_SECRET`

Configure em **Settings → Secrets and variables → Actions**.

---

## 🧪 Testes

```bash
pip install -e ".[dev]"
ruff check src tests main.py
pytest
```

---

## 🔑 APIs

- **Arable Cloud v2**: `https://api.arable.cloud/api/v2/` · `Authorization: Apikey <chave>`
- **WeatherLink v2**: `https://api.weatherlink.com/v2/` · chave via query + `X-Api-Secret`

---

## 📈 Funcionalidades do Dashboard

- **Filtros dinâmicos**: por estação, estado (UF) e período de datas
- **KPIs**: Temperatura, Umidade, Precipitação, ETo, Vento, VPD, Radiação, NDVI
- **7 gráficos interativos** (temperatura, precipitação, UR, ETo, VPD, radiação, vento)
- **Tabela resumo**: estatísticas agregadas por estação

---

## 🛠️ Tecnologias

| Tecnologia | Uso |
|-----------|-----|
| Python 3.11+ | Pipeline ETL (requests + pandas) |
| HTML5 + CSS3 | Dashboard (estrutura e estilo) |
| JavaScript | Lógica de filtros e gráficos |
| Chart.js 4.4 | Visualizações interativas |
| PapaParse 5.4 | Parse de CSV no browser |
| GitHub Actions | Automação, testes e deploy |
| Netlify / GitHub Pages | Hospedagem estática |

---

*Projeto desenvolvido com dados reais das estações Arable · Brasil · 2026*