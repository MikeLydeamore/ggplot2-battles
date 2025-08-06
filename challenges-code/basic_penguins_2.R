#| title: "Penguins"
#| dataset-name: "palmerpenguins::penguins"
#| colours: "`c('darkorange','purple','cyan4')`"
#| description: "The `palmerpenguins` dataset is one of the most famous in modern R programming. Data were collected and made available by [Dr. Kristen Gorman](https://www.uaf.edu/cfos/people/faculty/detail/kristen-gorman.php) and the [Palmer Station, Antarctica LTER](https://pallter.marine.rutgers.edu/), a member of the [Long Term Ecological Research Network](https://lternet.edu/). The original data is available [here](https://allisonhorst.github.io/palmerpenguins/)."

library(ggplot2)
library(palmerpenguins)

flipper_hist <- ggplot(data = penguins, aes(x = flipper_length_mm)) +
  geom_histogram(aes(fill = species), 
                 alpha = 0.5, 
                 position = "identity") +
  scale_fill_manual(values = c("darkorange","purple","cyan4")) +
  theme_minimal() +
  theme(plot.background = element_rect(fill = "white")) +
  labs(x = "Flipper length (mm)",
       y = "Frequency",
       title = "Penguin flipper lengths",
       fill = "Species")

print(flipper_hist)
