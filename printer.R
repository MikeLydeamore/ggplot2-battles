files <- list.files(
  path = "challenges-code",
  pattern = "\\.R$",
  full.names = TRUE
)

battles <- list()
for (fname in files) {
  name <- sub("\\.R$", "", basename(fname))

  source(fname)
  file_content <- readLines(fname)
    
  # Extract plot variable from hashpipe comment
  plot_var_line <- grep("^#\\|\\s*plot-variable\\s*:", file_content, value = TRUE)

  # Extract title from hashpipe comment
  title_line <- grep("^#\\|\\s*title\\s*:", file_content, value = TRUE)
  battle_title <- if (length(title_line) > 0) {
    sub("^#\\|\\s*title\\s*:\\s*[\"']([^\"']+)[\"'].*$", "\\1", title_line[1])
  } else {
    name # fallback to filename if no title
  }

  if (length(plot_var_line) > 0) {
    # Extract the variable name using regex
    plot_var <- sub("^#\\|\\s*plot-variable\\s*:\\s*[\"']([^\"']+)[\"'].*$", "\\1", plot_var_line[1])
    plot_obj <- get(plot_var)
  } else {
    plot_obj <- last_plot()
  }

  cowplot::save_plot(
    filename = paste0("challenges-images/", name, ".png"),
    plot = plot_obj,
    base_aspect_ratio = 1.75
  )

  battles[[length(battles) + 1]] <- list(
    name = name,
    title = battle_title,
    image = paste0(name, ".png")
  )
}

jsonlite::write_json(battles, "challenges-images/manifest.json", pretty = TRUE)