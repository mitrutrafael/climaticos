# ============================================================
# analise_climatica_arable.R
# Análise estatística dos dados climáticos — Estações Arable BR
# ============================================================

# ---- Pacotes ----
if (!requireNamespace("ggplot2", quietly=TRUE)) install.packages("ggplot2")
if (!requireNamespace("dplyr",   quietly=TRUE)) install.packages("dplyr")
if (!requireNamespace("tidyr",   quietly=TRUE)) install.packages("tidyr")
if (!requireNamespace("lubridate", quietly=TRUE)) install.packages("lubridate")

library(ggplot2)
library(dplyr)
library(tidyr)
library(lubridate)

theme_set(theme_dark() + theme(
  plot.background  = element_rect(fill="#111827", color=NA),
  panel.background = element_rect(fill="#1a2236", color=NA),
  panel.grid.major = element_line(color="rgba(255,255,255,0.07)", linewidth=0.4),
  text = element_text(color="#e8edf5"),
  axis.text = element_text(color="#8b9ab0"),
  legend.background = element_rect(fill="#111827", color=NA),
  plot.title = element_text(size=14, face="bold"),
  plot.subtitle = element_text(size=9, color="#8b9ab0")
))

# ---- Carregar dados ----
csv_path <- "dados_climaticos_brasil.csv"
df <- read.csv(csv_path, stringsAsFactors=FALSE)
df$date  <- as.Date(df$date)
df$month <- month(df$date, label=TRUE, abbr=TRUE)
df$week  <- floor_date(df$date, "week")

cat("=== Dados carregados ===\n")
cat(sprintf("Registros: %d | Estações: %d | Período: %s a %s\n",
  nrow(df), length(unique(df$device)),
  min(df$date), max(df$date)))

# ---- Estatísticas descritivas por estação ----
cat("\n=== Resumo por Estação ===\n")
resumo <- df %>%
  group_by(device, site, city, state) %>%
  summarise(
    n_dias     = n(),
    tmed_mean  = round(mean(tair_mean, na.rm=TRUE), 1),
    tmax_abs   = round(max(tair_max,   na.rm=TRUE), 1),
    tmin_abs   = round(min(tair_min,   na.rm=TRUE), 1),
    rh_mean    = round(mean(rh_mean,   na.rm=TRUE), 1),
    precip_tot = round(sum(precip,     na.rm=TRUE), 1),
    et_mean    = round(mean(et,        na.rm=TRUE), 2),
    wind_mean  = round(mean(wind_speed,na.rm=TRUE), 2),
    vpd_mean   = round(mean(vpd,       na.rm=TRUE), 2),
    .groups="drop"
  )
print(resumo)
write.csv(resumo, "resumo_por_estacao.csv", row.names=FALSE)

# ==================================================
# GRÁFICO 1 — Temperatura diária por estação
# ==================================================
p1 <- df %>%
  filter(!is.na(tair_mean)) %>%
  ggplot(aes(x=date)) +
  geom_ribbon(aes(ymin=tair_min, ymax=tair_max, fill=city), alpha=0.15) +
  geom_line(aes(y=tair_mean, color=city), linewidth=0.7) +
  facet_wrap(~paste0(city,"\n(",state,")"), ncol=4, scales="free_y") +
  scale_color_manual(values=c("#38bdf8","#818cf8","#34d399","#fb923c","#f472b6","#facc15","#a78bfa","#22d3ee")) +
  scale_fill_manual(values=c("#38bdf8","#818cf8","#34d399","#fb923c","#f472b6","#facc15","#a78bfa","#22d3ee")) +
  labs(title="Temperatura Diária por Estação (°C)",
       subtitle="Faixa: Mín–Máx | Linha: Temperatura Média",
       x=NULL, y="Temperatura (°C)", color=NULL, fill=NULL) +
  theme(legend.position="none", strip.text=element_text(size=8,color="#e8edf5"),
        strip.background=element_rect(fill="#0b0f19"))
ggsave("grafico_temperatura_estacoes.png", p1, width=14, height=8, dpi=150, bg="#111827")
cat("✔ grafico_temperatura_estacoes.png\n")

# ==================================================
# GRÁFICO 2 — Precipitação acumulada por estação
# ==================================================
p2 <- df %>%
  filter(!is.na(precip)) %>%
  group_by(city, state, week) %>%
  summarise(precip_sem = sum(precip, na.rm=TRUE), .groups="drop") %>%
  ggplot(aes(x=week, y=precip_sem, fill=city)) +
  geom_col(alpha=0.85) +
  facet_wrap(~paste0(city," (",state,")"), ncol=4, scales="free_y") +
  scale_fill_manual(values=c("#38bdf8","#818cf8","#34d399","#fb923c","#f472b6","#facc15","#a78bfa","#22d3ee")) +
  labs(title="Precipitação Semanal por Estação (mm)",
       x=NULL, y="Precipitação (mm)", fill=NULL) +
  theme(legend.position="none", strip.text=element_text(size=8,color="#e8edf5"),
        strip.background=element_rect(fill="#0b0f19"))
ggsave("grafico_precipitacao_estacoes.png", p2, width=14, height=8, dpi=150, bg="#111827")
cat("✔ grafico_precipitacao_estacoes.png\n")

# ==================================================
# GRÁFICO 3 — Comparativo Boxplot temperatura por estado
# ==================================================
p3 <- df %>%
  filter(!is.na(tair_mean)) %>%
  ggplot(aes(x=reorder(paste0(city,"\n(",state,")"), tair_mean, median), y=tair_mean, fill=state)) +
  geom_boxplot(alpha=0.8, outlier.color="#fb923c", outlier.size=1.5) +
  coord_flip() +
  scale_fill_manual(values=c("#38bdf8","#818cf8","#34d399","#fb923c","#f472b6","#facc15","#a78bfa","#22d3ee")) +
  labs(title="Distribuição de Temperatura Média por Estação",
       subtitle="Boxplot — Jul a Set 2026",
       x=NULL, y="Temperatura Média (°C)", fill="UF") +
  theme(legend.position="right")
ggsave("grafico_boxplot_temperatura.png", p3, width=12, height=6, dpi=150, bg="#111827")
cat("✔ grafico_boxplot_temperatura.png\n")

# ==================================================
# GRÁFICO 4 — ETo vs Temperatura (correlação)
# ==================================================
p4 <- df %>%
  filter(!is.na(tair_mean), !is.na(et), et > 0) %>%
  ggplot(aes(x=tair_mean, y=et, color=state)) +
  geom_point(alpha=0.6, size=1.5) +
  geom_smooth(method="lm", se=TRUE, aes(group=1), color="#38bdf8", fill="#38bdf820") +
  scale_color_manual(values=c("#38bdf8","#818cf8","#34d399","#fb923c","#f472b6","#facc15","#a78bfa","#22d3ee")) +
  labs(title="Relação entre Temperatura e Evapotranspiração",
       subtitle="Regressão linear · Dados diários Jul–Set 2026",
       x="Temperatura Média (°C)", y="ETo (mm/dia)", color="UF") +
  theme(legend.position="right")
ggsave("grafico_et_vs_temperatura.png", p4, width=10, height=6, dpi=150, bg="#111827")
cat("✔ grafico_et_vs_temperatura.png\n")

# ==================================================
# GRÁFICO 5 — Série temporal VPD
# ==================================================
p5 <- df %>%
  filter(!is.na(vpd)) %>%
  group_by(date) %>%
  summarise(vpd_med = mean(vpd, na.rm=TRUE), .groups="drop") %>%
  ggplot(aes(x=date, y=vpd_med)) +
  geom_area(fill="#facc1540", alpha=0.8) +
  geom_line(color="#facc15", linewidth=0.8) +
  geom_hline(yintercept=c(1,2), linetype="dashed", color="#8b9ab0", linewidth=0.4) +
  annotate("text", x=max(df$date)-5, y=1.05, label="VPD=1 kPa", color="#8b9ab0", size=3) +
  annotate("text", x=max(df$date)-5, y=2.05, label="VPD=2 kPa (estresse)", color="#fb923c", size=3) +
  labs(title="VPD Médio Geral — Estações Brasil",
       subtitle="Déficit de Pressão de Vapor · Média de todas as estações",
       x=NULL, y="VPD (kPa)")
ggsave("grafico_vpd_temporal.png", p5, width=12, height=5, dpi=150, bg="#111827")
cat("✔ grafico_vpd_temporal.png\n")

# ==================================================
# ANÁLISE ESTATÍSTICA — ANOVA temperatura entre estados
# ==================================================
cat("\n=== ANOVA — Temperatura Média entre Estados ===\n")
df_anova <- df %>% filter(!is.na(tair_mean), !is.na(state))
if (length(unique(df_anova$state)) >= 2) {
  mod <- aov(tair_mean ~ state, data=df_anova)
  print(summary(mod))
  cat("\nTukey HSD:\n")
  print(TukeyHSD(mod))
}

# ==================================================
# ANÁLISE — Correlação entre variáveis
# ==================================================
cat("\n=== Matriz de Correlação ===\n")
cor_vars <- df %>% select(tair_mean, tair_max, tair_min, rh_mean, precip, et, wind_speed, vpd) %>%
  filter(complete.cases(.))
cor_mat <- round(cor(cor_vars), 2)
print(cor_mat)
write.csv(cor_mat, "correlacao_variaveis.csv")

cat("\n=== Análise concluída! ===\n")
cat("Arquivos gerados:\n")
cat("  resumo_por_estacao.csv\n")
cat("  correlacao_variaveis.csv\n")
cat("  grafico_temperatura_estacoes.png\n")
cat("  grafico_precipitacao_estacoes.png\n")
cat("  grafico_boxplot_temperatura.png\n")
cat("  grafico_et_vs_temperatura.png\n")
cat("  grafico_vpd_temporal.png\n")
