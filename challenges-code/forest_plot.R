#| title: "Forest Plot"
#| difficulty: "intermediate"
#| plot-types: "forest plot, interval"
#| dataset-name: "hazard_ratio"
#| description: "Log hazard ratios of various treatments for a disease, where negative values are protective."
#| colours: "`scale_color_viridis_c(end = 0.9)`"

library(ggplot2)

hazard_ratio <-
  structure(
    list(
      treatment = c("drug-0", "drug-1", "drug-2", "drug-3", 
                    "drug-4", "drug-5", "drug-6", "drug-7", "drug-8", "drug-9"), 
      estimate = c(-1.07758328124311, -0.0673791229983594, -0.131222672477039, 
                   -0.177516254743032, -0.557561518611797, -0.326188793194129, 
                   0.0774681894156513, 0.0446103018158888, -0.663460635641247, 
                   0.0982800205104637),
      conf.low = c(-1.40821094432096, -0.538587314374759, 
                   -0.693668556086683, -0.857711283648174, -1.16622060338404, 
                   -0.645244903652244, -0.393443467907644, -0.299837395750747, 
                   -1.0529477801427, -0.273705841823253),
      conf.high = c(-0.74695561816527, 
                    0.40382906837804, 0.431223211132606, 0.50267877416211, 0.0510975661604512, 
                    -0.00713268273601528, 0.548379846738946, 0.389057999382524, 
                    -0.273973491139792, 0.470265882844181),
      p.value = c(1.68152742241014e-10, 
                  0.779278286507906, 0.647474328599551, 0.608995113127569, 
                  0.0725863370465562, 0.0450936208087966, 0.747128865265434, 
                  0.799619211582648, 0.000841883565496329, 0.604577144843726
      )
    ),
    row.names = c(NA, -10L),
    class = "data.frame"
  )

p <-
  hazard_ratio |>
  ggplot(aes(treatment, estimate, col = -log10(p.value))) +
  scale_color_viridis_c(end = 0.9, breaks = seq(0, 10, by = 2.5)) +
  geom_hline(yintercept = 0, lty = 2, alpha = 0.5) +
  geom_point(shape = 15) +
  geom_segment(aes(xend = treatment, y = conf.low, yend = conf.high)) +
  coord_flip() +
  labs(
    y = 'Log hazard ratio',
    x = 'Treatment',
    colour = '-log10(p-value)'
  )

print(p)
