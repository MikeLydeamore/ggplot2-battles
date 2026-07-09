#!/bin/bash

# Paths
CODE_DIR="challenges-code"
TARGET_DIR="challenges"
TEMPLATE="template.html"  # Change this to your actual file

install_missing_challenge_packages() {
  Rscript --vanilla - "$CODE_DIR" <<'RSCRIPT'
args <- commandArgs(trailingOnly = TRUE)
code_dir <- args[[1]]
files <- list.files(code_dir, pattern = "\\.R$", full.names = TRUE)

if (!length(files)) {
  message("No challenge R files found.")
  quit(status = 0)
}

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

  unlist(lapply(captured, function(match) {
    if (length(match) >= 2) {
      match[[2]]
    } else {
      character()
    }
  }), use.names = FALSE)
}

packages <- unique(unlist(lapply(files, extract_packages), use.names = FALSE))
packages <- sort(packages[nzchar(packages)])

if (!length(packages)) {
  message("No challenge packages found.")
  quit(status = 0)
}

installed <- rownames(installed.packages())
missing <- setdiff(packages, installed)

message("Challenge packages: ", paste(packages, collapse = ", "))

if (!length(missing)) {
  message("All challenge packages already installed.")
  quit(status = 0)
}

repos <- getOption("repos")
if (is.null(repos) || identical(unname(repos["CRAN"]), "@CRAN@")) {
  options(repos = c(CRAN = "https://cloud.r-project.org"))
}

message("Installing missing challenge packages: ", paste(missing, collapse = ", "))
install.packages(missing)

still_missing <- setdiff(missing, rownames(installed.packages()))
if (length(still_missing)) {
  stop("Failed to install challenge packages: ", paste(still_missing, collapse = ", "), call. = FALSE)
}
RSCRIPT
}

install_missing_challenge_packages || exit 1

# Loop through each .R file in challenges-code
for file in "$CODE_DIR"/*.R; do
  # Get the filename without extension
  filename=$(basename "$file" .R)

  # Extract the title from the hashpipe (format: #| title: "Title here")
  title=$(grep -m 1 '^#| title:' "$file" | sed 's/^#| title: "\(.*\)"$/\1/')
  
  # Use filename as fallback if no title found
  if [ -z "$title" ]; then
    title="$filename"
  fi

  # Create a matching subfolder in challenges/
  mkdir -p "$TARGET_DIR/$filename"

  # Copy the template file and replace the title
  sed "s|<title></title>|<title>$title - ggplot Battles</title>|" "$TEMPLATE" > "$TARGET_DIR/$filename/index.html"
done

Rscript printer.R
