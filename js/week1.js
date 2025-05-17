await webR.installPackages(['ggplot2', 'palmerpenguins']);
const capture = await shelter.captureR(`

library(ggplot2)
library(palmerpenguins)

p <- ggplot(penguins, aes(x=bill_length_mm, y = bill_depth_mm, colour = species)) +
  geom_point() +
  labs(x="Bill length", y="Bill depth", colour="Species") +
  ggtitle("Length vs depth of penguins")

print(p)
`, {
  captureGraphics: {
    width: 350,
    height: 200
  }
});

// Draw the first (and only) captured image to the page
if (capture.images.length > 0) {
const img = capture.images[0];
const canvas = document.getElementById("canvas-base");
canvas.style.display = 'block';
canvas.getContext("2d").drawImage(img, 0, 0);
}

shelter.purge();