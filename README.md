# 🌤️ Estacoes Arable Brazil — Projeto de Dados Climáticos

> Dashboard interativo e análise estatística dos dados das estações **Arable** no Brasil.

**🔗 Dashboard online**: [https://mitrutrafael.github.io/climaticos/](https://mitrutrafael.github.io/climaticos/)

---

## 📋 Sobre o Projeto

O **Estacoes Arable Brazil** é uma plataforma de visualização e análise de dados climáticos coletados pelas estações físicas Arable distribuídas pelo Brasil. O sistema consome a **Arable Cloud API** e apresenta os dados de forma interativa para suporte à tomada de decisões agronômicas.

---

## 🏭 Estações Monitoradas (Brasil)

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

> As estações Davis são incluídas no dashboard a partir do CSV `dados_davis_brasil.csv`,
> gerado pelo script `atualizar_davis.ps1` (WeatherLink v2 API). Requer assinatura **Pro** para histórico.

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

## 🗂️ Estrutura do Projeto

```
climaticos/
├── index.html                    # Dashboard principal
├── style.css                     # Estilo premium (dark mode)
├── app.js                        # Lógica do dashboard (Chart.js + PapaParse)
├── dados_climaticos_brasil.csv   # Dados Arable (Jul–Set 2026 · 632 registros)
├── dados_davis_brasil.csv        # Dados Davis/WeatherLink (Jul–Set 2026 · 300 registros)
├── atualizar_davis.ps1           # Script para baixar/atualizar dados Davis (requer chave API)
├── analise_climatica_arable.R    # Script R de análise estatística
├── RELATORIO_CLIMATICO.md        # Relatório técnico
└── README.md                     # Este arquivo
```

---

## 🚀 Como Usar

### Dashboard Web

```bash
# Sirva o diretório como servidor HTTP local
cd c:\Antigravity\climaticos

# Python (recomendado):
python -m http.server 8080

# Ou Node.js (npx):
npx -y serve .
```

Acesse: [http://localhost:8080](http://localhost:8080)

> ⚠️ O dashboard **precisa ser servido via HTTP** (não funciona com `file://`) para carregar o CSV via fetch.

### Script R

```r
# No RStudio ou terminal R, execute:
setwd("c:/Antigravity/climaticos")
source("analise_climatica_arable.R")
```

---

## 📡 Atualizar Dados Davis (WeatherLink)

```powershell
$env:DAVIS_API_KEY   = "sua chave v2"
$env:DAVIS_API_SECRET = "seu segredo v2"
powershell -ExecutionPolicy Bypass -File atualizar_davis.ps1 -StartDate 2026-07-01 -EndDate 2026-09-17
```

> ⚠️ O segredo da API **não deve** ser commitado no repositório. Após gerar o CSV, faça `git add` + `git push` para atualizar o dashboard no GitHub Pages.

---

## 📈 Funcionalidades do Dashboard

- **Filtros dinâmicos**: por estação, estado (UF) e período de datas
- **KPIs em tempo real**: Temperatura, Umidade, Precipitação, ETo, Vento, VPD
- **7 gráficos interativos**:
  - Temperatura diária (Máx/Média/Mín)
  - Precipitação diária (barras)
  - Umidade Relativa (série temporal)
  - Evapotranspiração ETo (série temporal)
  - VPD — Déficit de Pressão de Vapor
  - Comparativo de temperatura por estação
  - Velocidade do vento por estação
- **Tabela resumo**: estatísticas agregadas por estação

---

## 🔑 API Arable

- **Endpoint base**: `https://api.arable.cloud/api/v2/`
- **Autenticação**: `Authorization: Apikey <api_key>`
- **Dados diários**: `/data/daily?device=<ID>&start_time=<DATE>&end_time=<DATE>`
- **Lista de dispositivos**: `/devices?limit=100&page=<N>`
- **Esquema de dados**: `/schemas/daily`

---

## 📅 Período dos Dados

- **Início**: 2026-07-01
- **Fim**: 2026-09-17
- **Total de registros**: 632
- **Resolução**: Diária (média/agregado 24h)

---

## 🛠️ Tecnologias

| Tecnologia | Uso |
|-----------|-----|
| HTML5 + CSS3 | Dashboard (estrutura e estilo) |
| JavaScript | Lógica de filtros e gráficos |
| [Chart.js 4.4](https://chartjs.org) | Visualizações interativas |
| [PapaParse 5.4](https://papaparse.com) | Parse de CSV no browser |
| R + ggplot2 | Análise estatística |
| [Arable Cloud API v2](https://api.arable.cloud) | Dados climáticos |

---

*Projeto desenvolvido com dados reais das estações Arable · Brasil · 2026*
