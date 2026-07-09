#| title: "Australian Mathematics Uptake"
#| difficulty: "intermediate"
#| plot-types: "bar chart"
#| dataset-name: "math_participation"
#| colours: "`c('darkorange','purple')`"
#| description: "This dataset shows the participation rates in higher and intermediate mathematics in Australia from 2010 to 2023. Data is from the Australian Mathematical Sciences Institute (AMSI) [Year 12 Mathematics Report Card](https://amsi.org.au/wp-content/uploads/2025/07/year-12-participation-2025-july.pdf). There is a lot of subtlety to this plot you'll need to reproduce. Particular attention to text size and axis limits will be crucial."

library(ggplot2)
library(tidyr)
library(dplyr)


math_participation <- data.frame(
  year = 2010:2023,
  higher_mathematics = c(
    10.9, 10.3, 10.2, 10.3, 10.6, 10.1, 10.0,
    10.0, 10.1, 10.1, 9.2, 8.9, 9.0, 8.4
  ),
  intermediate_mathematics = c(
    21.5, 21.3, 21.0, 20.4, 20.6, 20.2, 20.5,
    20.6, 21.1, 20.5, 17.6, 17.8, 17.7, 16.8
  )
)

pivoted <- pivot_longer(
  math_participation,
  cols = c(higher_mathematics, intermediate_mathematics),
  names_to = "subject",
  values_to = "percentage"
) |>
  mutate(
    subject = factor(subject, levels = c("higher_mathematics", "intermediate_mathematics"),
                     labels = c("Higher Mathematics", "Intermediate Mathematics"))
  )

amsi_rates <- ggplot(pivoted, aes(x=factor(year), y=percentage, fill=subject)) +
  geom_bar(stat="identity", position = "dodge") +
  labs(y = "Participation rate") +
  theme_bw() +
  theme(axis.title.x = element_blank(), legend.position = "bottom", legend.title = element_blank()) +
  scale_fill_manual(values = c("darkorange", "purple")) +
  scale_y_continuous(expand = c(0,0)) +
  expand_limits(y = 23) +
  geom_text(aes(label = sprintf("%.1f", percentage)), position = position_dodge(width = 0.9), vjust = -0.5, size = 2)

print(amsi_rates)
