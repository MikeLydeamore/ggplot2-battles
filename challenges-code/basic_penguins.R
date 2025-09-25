#| title: "Penguin Scatters"
#| dataset-name: "palmerpenguins::penguins"
#| description: "The `palmerpenguins` dataset is one of the most famous in modern R programming. Data were collected and made available by [Dr. Kristen Gorman](https://www.uaf.edu/cfos/people/faculty/detail/kristen-gorman.php) and the [Palmer Station, Antarctica LTER](https://pallter.marine.rutgers.edu/), a member of the [Long Term Ecological Research Network](https://lternet.edu/). The original data is available [here](https://allisonhorst.github.io/palmerpenguins/)."

library(ggplot2)
library(palmerpenguins)

p <- ggplot(penguins, aes(x=bill_length_mm, y = bill_depth_mm, colour = species)) +
  geom_point() +
  labs(x="Bill length", y="Bill depth", colour="Species") +
  ggtitle("Length vs depth of penguins")

print(p)
