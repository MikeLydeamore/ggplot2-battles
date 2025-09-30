#| title: "Combo Plots"
#| dataset-name: "spreads"
#| description: "Trying to plot summaries people understand with more complex plots that show the full distribution. You'll need to combine your geoms and stats to succeed."
#| colours: "`c('gray30','gray15')`"

library(ggplot2)
library(dplyr)

set.seed(42)

n <- 200
spreads <- tibble::tibble(
    Group = factor(rep(c("A", "B", "C"), each = n)),
    Value = c(
        rnorm(n, mean = 0, sd = 1.0), # A: Normal(0,1)
        rnorm(n, mean = 2, sd = 1.5), # B: Normal(2,1.5)
        rexp(n, rate = 1) + 1 # C: Exponential shifted right
    )
)

p <- ggplot(spreads, aes(x = Group, y = Value, fill = Group)) +
    # Violin shows full distribution
    geom_violin(trim = FALSE, alpha = 0.6, linewidth = 0.3, color = "gray30") +
    # Boxplot inside (hide outliers so they don't overplot jitter)
    geom_boxplot(width = 0.15, outlier.shape = NA, alpha = 0.9, color = "gray15") +
    # Optional: overlay a small random jitter of raw points
    geom_jitter(width = 0.07, alpha = 0.25, size = 1.2) +
    # Optional: show the mean with a point
    stat_summary(fun = mean, geom = "point", shape = 23, size = 2.8, fill = "white") +
    # Clean theme
    theme_minimal(base_size = 13) +
    theme(
        legend.position = "none",
        panel.grid.minor = element_blank()
    ) +
    labs(
        x = NULL, y = "Value"
    )

print(p)