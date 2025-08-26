#| title: "Circle with gaps"
#| dataset-name: "wealth"
#| colours: "`green`"
#| description: "A circular barplot displays bars around a circle instead of on a line. Here, there is also a gap at the end of the barplot you will have to create. Also think about how to make a big gap in the middle of the barplot. Inspired from the [R Graph Gallery #297](https://r-graph-gallery.com/297-circular-barplot-with-groups.html)"
library(ggplot2)

wealth <- data.frame(
  individual=paste( "Mister ", seq(1,60), sep=""),
  wealth=c(64L, 58L, 96L, 30L, 29L, 62L, 37L, 30L, 67L, 87L, 68L, 41L, 
    88L, 73L, 94L, 32L, 30L, 95L, 23L, 60L, 94L, 60L, 88L, 10L, 90L, 
    18L, 57L, 75L, 11L, 46L, 53L, 73L, 73L, 42L, 16L, 53L, 41L, 31L, 
    42L, 49L, 25L, 49L, 84L, 29L, 77L, 10L, 90L, 71L, 94L, 45L, 25L, 
    94L, 20L, 44L, 17L, 28L, 79L, 15L, 45L, 51L)
)
 
empty_bar <- 10
 
# Add lines to the initial dataset
to_add <- matrix(NA, empty_bar, ncol(wealth))
colnames(to_add) <- colnames(wealth)
wealth <- rbind(wealth, to_add)
wealth$id <- seq(1, nrow(wealth))
 
# Get the name and the y position of each label
label_data <- wealth
number_of_bar <- nrow(label_data)
angle <- 90 - 360 * (label_data$id-0.5) /number_of_bar     # I substract 0.5 because the letter must have the angle of the center of the bars. Not extreme right(1) or extreme left (0)
label_data$hjust <- ifelse( angle < -90, 1, 0)
label_data$angle <- ifelse(angle < -90, angle+180, angle)
 
# Make the plot
p <- ggplot(wealth, aes(x=as.factor(id), y=wealth)) +       # Note that id is a factor. If x is numeric, there is some space between the first bar
  geom_bar(stat="identity", fill=alpha("green", 0.3)) +
  ylim(-100,120) +
  theme_minimal() +
  theme(
    axis.text = element_blank(),
    axis.title = element_blank(),
    panel.grid = element_blank(),
    plot.background = element_rect(fill = "white", color = NA)
  ) +
  coord_polar(start = 0) + 
  geom_text(data=label_data, aes(x=id, y=wealth+10, label=individual, hjust=hjust), color="black", size=1.5, angle= label_data$angle, inherit.aes = FALSE ) 
 
print(p)
