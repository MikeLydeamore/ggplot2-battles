#| title: "Mapping Australia"
#| difficulty: "intermediate"
#| plot-types: "map"
#| dataset-name: "aus_map"
#| colours: "`scale_fill_viridis_d()`"
#| description: "An introduction to drawing spatial plots in `ggplot2` using `sf`. The data is coming from the `ozmaps` package which provides shapefiles for Australian states and territories. Pay careful attention to the map and which states are to be drawn"

library(ggplot2)
library(dplyr)
library(sf)
library(ozmaps)

aus_map <- ozmaps::ozmap_data("states")
aus_map$NAME <- as.factor(aus_map$NAME)
aus_map_tmp <- aus_map
aus_map_tmp$opacity <- factor(ifelse(aus_map_tmp$NAME == "Tasmania", 0, 1))

p <-ggplot(aus_map_tmp) + geom_sf(aes(fill = NAME, alpha = opacity, colour=opacity)) + 
    theme_void() +
    scale_fill_viridis_d(drop = FALSE) +
    scale_colour_manual(values = c("0" = "white", "1" = "black"), guide = "none") +
    scale_alpha_manual(values = c("0" = 0, "1" = 1), guide = "none") +
    labs(fill = "State")

print(p)
