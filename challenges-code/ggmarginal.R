#| title: "Marginal Distributions"
#| dataset-name: "mpg"
#| description: "Introduction to the `ggMarginal` function. You'll need this to add the marginal distributions to the scatterplots. The dataset is pretty straightforward to spend your time understanding how the marginals and smoothing lines work!
#| colours: "none"
#| plot-variable: "p"

library(ggplot2)
library(ggExtra)
data(mpg, package = "ggplot2")

# Scatterplot
theme_set(theme_bw() + theme(panel.background = element_rect(fill = "white"))) # pre-set the bw theme.
mpg_select <- mpg[mpg$hwy >= 35 & mpg$cty > 27, ]
g <- ggplot(mpg, aes(cty, hwy)) +
    geom_count() +
    geom_smooth(method = "lm", se = F) +
    labs(x = "City MPG", y = "Highway MPG")

g <- g + theme(
    plot.background = element_rect(fill = "white", color = NA),
    panel.background = element_rect(fill = "white")
)

p <- ggMarginal(g, type = "histogram", fill = "white", bg = "white", xparams = list(fill = "white"),yparams = list(fill = "white"))

print(p)

p