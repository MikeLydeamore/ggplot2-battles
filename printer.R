files <- list.files(
  path = "challenges-code",
  pattern = "\\.R$",
  full.names = TRUE
)

extract_packages <- function(file) {
  lines <- readLines(file, warn = FALSE)
  lines <- sub("#.*$", "", lines)

  pattern <- paste0(
    "^\\s*(?:library|require|requireNamespace)\\s*\\(",
    "\\s*(?:package\\s*=\\s*)?",
    "[\"']?([A-Za-z][A-Za-z0-9._]*)[\"']?"
  )
  matches <- regexec(pattern, lines, perl = TRUE)
  captured <- regmatches(lines, matches)

  packages <- unlist(lapply(captured, function(match) {
    if (length(match) >= 2) {
      match[[2]]
    } else {
      character()
    }
  }), use.names = FALSE)

  sort(unique(packages[nzchar(packages)]))
}

extract_hashpipe_value <- function(lines, key, default = NA_character_) {
  pattern <- paste0("^#\\|\\s*", key, "\\s*:\\s*(.*)$")
  matched <- grep(pattern, lines, value = TRUE)
  if (length(matched) == 0) {
    return(default)
  }

  value <- sub(pattern, "\\1", matched[1])
  value <- trimws(value)
  value <- sub("^['\"](.*)['\"]$", "\\1", value)
  if (nzchar(value)) value else default
}

extract_hashpipe_values <- function(lines, key, default = character()) {
  value <- extract_hashpipe_value(lines, key)
  if (is.na(value) || !nzchar(value)) {
    return(default)
  }

  values <- unlist(strsplit(value, "\\s*,\\s*"), use.names = FALSE)
  values <- trimws(sub("^['\"](.*)['\"]$", "\\1", values))
  values[nzchar(values)]
}

extract_difficulty <- function(lines) {
  difficulty <- tolower(extract_hashpipe_value(lines, "difficulty", "intermediate"))
  if (difficulty %in% c("easy", "intermediate", "hard")) {
    difficulty
  } else {
    "intermediate"
  }
}

battles <- list()
for (fname in files) {
  name <- sub("\\.R$", "", basename(fname))
  file_content <- readLines(fname, warn = FALSE)
  packages <- extract_packages(fname)
  difficulty <- extract_difficulty(file_content)
  plot_types <- extract_hashpipe_values(file_content, "plot-types")

  source(fname)

  battle_title <- extract_hashpipe_value(file_content, "title", name)
  plot_var <- extract_hashpipe_value(file_content, "plot-variable")

  if (!is.na(plot_var)) {
    plot_obj <- get(plot_var)
  } else {
    plot_obj <- last_plot()
  }

  cowplot::save_plot(
    filename = paste0("challenges-images/", name, ".png"),
    plot = plot_obj,
    base_aspect_ratio = 1.75,
    bg = "white"
  )

  battles[[length(battles) + 1]] <- list(
    name = name,
    title = battle_title,
    image = paste0(name, ".png"),
    difficulty = difficulty,
    plotTypes = plot_types,
    packages = packages
  )
}

jsonlite::write_json(battles, "challenges-images/manifest.json", pretty = TRUE)
