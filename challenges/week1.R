library(ggplot2)
library(palmerpenguins)

p <- ggplot(penguins, aes(x=bill_length_mm, y = bill_depth_mm, colour = species)) +
  geom_point() +
  labs(x="Bill length", y="Bill depth", colour="Species") +
  ggtitle("Length vs depth of penguins")

print(p)
