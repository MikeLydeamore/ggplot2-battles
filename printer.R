files <- list.files(
  path = "challenges-code",
  pattern = "\\.R$",
  full.names = TRUE
)

for (fname in files) {
  name <- sub("\\.R$", "", basename(fname))

  source(fname)
    
  cowplot::save_plot(
    filename = paste0("challenges-images/", name, ".png"),
    plot = last_plot(),
    base_aspect_ratio = 1.75
  )
}

files <- list.files("challenges-images", pattern = "\\.png$", full.names = FALSE)
jsonlite::write_json(files, "challenges-images/manifest.json")