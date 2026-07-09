#| title: "Wages Model"
#| difficulty: "hard"
#| plot-types: "line chart, model"
#| dataset-name: "wages_fct, wages_fe_d"
#| description: "A linear mixed effects model of wages depending on experience and grade, with random intercepts and slopes for individuals. Visualise the individual wage trajectories along with the fixed effects lines for each grade. The `wages_fct` dataset has the raw data, while `wages_fe_d` has the fixed effects predictions for each grade."
#| colours: "`scale_colour_discrete_divergingx(palette = 'Zissou 1')`"

library(dplyr)
library(brolgar)
library(lme4)
library(ggplot2)
library(colorspace)

wages_fct <- wages |>
  select(id, ln_wages, xp, high_grade) |>
  mutate(high_grade = factor(high_grade))


wages_fit <- lmer(ln_wages~xp + high_grade + (xp|id), data=wages_fct)
wages_fe <- summary(wages_fit)$coefficients
wages_fe_d <- tibble(xp = rep(seq(0, 13, 1), 7),
     high_grade = rep(c(6, 7, 8, 9, 10, 11, 12), rep(14, 7))) |>
  mutate(ln_wages = case_when(
    high_grade == 6 ~ wages_fe[1,1] + wages_fe[2,1]*xp,
    high_grade == 7 ~ wages_fe[1,1] + wages_fe[3,1] + wages_fe[2,1]*xp,
    high_grade == 8 ~ wages_fe[1,1] + wages_fe[4,1]  + wages_fe[2,1]*xp,
    high_grade == 9 ~ wages_fe[1,1] + wages_fe[5,1]  + wages_fe[2,1]*xp,
    high_grade == 10 ~ wages_fe[1,1] + wages_fe[6,1]  + wages_fe[2,1]*xp,
    high_grade == 11 ~ wages_fe[1,1] + wages_fe[7,1]  + wages_fe[2,1]*xp,
    high_grade == 12 ~ wages_fe[1,1] + wages_fe[8,1]  + wages_fe[2,1]*xp)
  ) |>
  mutate(high_grade = factor(high_grade))


p <- ggplot() + 
  geom_line(data=wages_fct, aes(x=xp, y=ln_wages, group=id), alpha=0.1) +
  geom_line(data=wages_fe_d, aes(x=xp, 
                y=ln_wages, 
                colour=high_grade, 
                group=high_grade)) +
  scale_colour_discrete_divergingx(palette = "Zissou 1") +
  labs(x="Experience (years)", y="Wages (ln)", colour="Grade") +
  theme_bw()

print(p)
