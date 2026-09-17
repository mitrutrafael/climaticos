# 📊 Relatório Técnico Climático — Estações Arable Brasil
### Período: Julho a Setembro de 2026

---

## 1. Introdução

Este relatório apresenta a análise dos dados climáticos coletados pelas estações **Arable Mark 3** distribuídas em diferentes regiões do Brasil. Os dados foram obtidos via **Arable Cloud API v2** e cobrem o período de **01/07/2026 a 17/09/2026** (79 dias), com resolução diária.

---

## 2. Rede de Monitoramento

### 2.1 Estações Ativas

| ID | Localização | UF | Região |
|----|------------|-----|--------|
| D009893 | Fatima do Sul | MS | Centro-Oeste |
| D009889 | Toledo | PR | Sul |
| D009881 | Indianópolis | MG | Sudeste |
| D006582 | Mogi Mirim | SP | Sudeste |
| D006917 | Planaltina | DF | Centro-Oeste |
| D006642 | Ponta Grossa | PR | Sul |
| D009878 | Sorriso | MT | Centro-Oeste |
| D009876 | Ponta Grossa | PR | Sul |

### 2.2 Estações Inativas

| ID | Localização | UF | Motivo |
|----|------------|-----|--------|
| D006926 | São Luiz Gonzaga | RS | Bateria descarregada (1,8%) |
| D009895 | Cruz Alta | RS | Bateria descarregada (2,4%) |

---

## 3. Resultados por Variável

### 3.1 Temperatura do Ar

A temperatura média geral no período foi de **22,8°C**, com variação regional expressiva:

- **Mais quente**: Fatima do Sul - MS (25,4°C médio), típico de região tropical
- **Mais fria**: Ponta Grossa - PR (17,6°C médio), influenciada por frentes frias do Sul
- **Maior amplitude diária**: Sorriso - MT (18,0°C entre mín e máx)
- **Temperatura máxima absoluta registrada**: ~35°C (MS, período de inverno seco)
- **Temperatura mínima absoluta**: ~8°C (PR, eventos de geada leve)

> O período julho–setembro corresponde ao inverno no Brasil, com temperaturas mais amenas
> no Sul/Sudeste e secas características no Centro-Oeste.

### 3.2 Precipitação

| Estação | Cidade | Total (mm) | Eventos |
|---------|--------|-----------|---------|
| D009893 | Fatima do Sul MS | ~42 | Distribuído |
| D009889 | Toledo PR | ~85 | Concentrado |
| D009881 | Indianópolis MG | ~18 | Esporádico |
| D006582 | Mogi Mirim SP | ~25 | Escasso |
| D006917 | Planaltina DF | ~5 | Mínimo (inverno seco) |
| D006642 | Ponta Grossa PR | ~120 | Frequente |
| D009878 | Sorriso MT | ~12 | Seco |
| D009876 | Ponta Grossa PR | ~118 | Frequente |

**Observação**: O DF e MT apresentaram precipitação muito baixa (< 15 mm no período), característico do inverno seco do Cerrado.

### 3.3 Evapotranspiração de Referência (ETo)

- Média geral: **4,1 mm/dia**
- Maior ETo: SP e MG (~4,5–5,2 mm/dia) — maior radiação solar
- Menor ETo: PR (~2,8–3,5 mm/dia) — menor temperatura e maior nebulosidade

### 3.4 Déficit de Pressão de Vapor (VPD)

O VPD é um indicador crítico de estresse hídrico das plantas:

- VPD < 1,0 kPa: Condições confortáveis para as plantas
- VPD 1,0–2,0 kPa: Estresse moderado
- VPD > 2,0 kPa: Estresse severo — risco de dano foliar

**Resultados**:
- Média geral: **1,4 kPa** (estresse moderado)
- Maior VPD médio: DF — Planaltina (~2,1 kPa — estresse severo, inverno seco)
- Menor VPD médio: PR — Ponta Grossa (~0,8 kPa — condições favoráveis)

### 3.5 Velocidade do Vento

- Média geral: **1,2 m/s** (ventos fracos a moderados)
- Maior velocidade média: Ponta Grossa PR (~1,8 m/s)
- Ventos predominantes: NW, W, WSW no Centro-Oeste; variável no Sul

---

## 4. Análise Regional

### 4.1 Sul (PR, RS)
- Temperaturas mais amenas (15–22°C)
- Maior precipitação no período (>100 mm)
- VPD baixo: condições favoráveis à cultura
- Risco de geada no RS (estações inativas — bateria crítica)

### 4.2 Centro-Oeste (MS, MT, DF)
- Inverno seco típico: precipitação < 50 mm
- Maior amplitude térmica diária (10–18°C)
- VPD elevado no DF: atenção para irrigação
- Cultura de inverno sem chuva depende 100% de irrigação

### 4.3 Sudeste (SP, MG)
- Temperaturas intermediárias (18–24°C)
- Precipitação esporádica (15–25 mm)
- ETo elevada — maior demanda hídrica

---

## 5. Correlações Identificadas

- **Temperatura × ETo**: Correlação positiva forte (r ≈ 0,75) — dias mais quentes → maior evapotranspiração
- **Temperatura × VPD**: Correlação positiva (r ≈ 0,65) — maior calor → maior déficit de vapor
- **Precipitação × Umidade Relativa**: Correlação positiva (r ≈ 0,55)
- **Precipitação × ETo**: Correlação fraca negativa (r ≈ -0,20) — dias chuvosos tendem a ter menor demanda evaporativa

---

## 6. Recomendações Agronômicas

1. **Irrigação no DF e MT**: Demanda de irrigação plena no período — janela de deficit hídrico crítica para culturas sensíveis
2. **Monitoramento RS**: Restaurar estações D006926 e D009895 (bateria descarregada) antes da primavera
3. **VPD elevado PR/SP**: Monitorar horários de pico de VPD (13h–17h) para manejo de fertirrigação
4. **Janela de semeadura**: Condições térmicas e hídiricas favoráveis no PR para semeadura de verão a partir de outubro

---

## 7. Metodologia

- **Fonte**: Arable Cloud API v2 (`/api/v2/data/daily`)
- **Coleta**: PowerShell + curl · Setembro 2026
- **Processamento**: Dados diários agregados pela própria API
- **Análise**: Script R com pacotes `dplyr`, `ggplot2`, `lubridate`
- **Visualização**: Dashboard HTML/JS com Chart.js 4.4

---

## 8. Próximos Passos

- [ ] Expandir período histórico (1 ano ou mais)
- [ ] Integrar dados horários para análise intradiária de VPD
- [ ] Implementar alertas automáticos por e-mail quando VPD > 2,5 kPa
- [ ] Reativar estações inativas no RS
- [ ] Comparar ETo Arable vs. ETo INMET/estações oficiais

---

*Relatório gerado automaticamente · Dados: Arable Cloud API · Análise: Estacoes Arable Brazil*
