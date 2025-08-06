#!/bin/bash

# Paths
CODE_DIR="challenges-code"
TARGET_DIR="challenges"
TEMPLATE="template.html"  # Change this to your actual file

# Loop through each .R file in challenges-code
for file in "$CODE_DIR"/*.R; do
  # Get the filename without extension
  filename=$(basename "$file" .R)

  # Create a matching subfolder in challenges/
  mkdir -p "$TARGET_DIR/$filename"

  # Copy the template file into it as index.html
  cp "$TEMPLATE" "$TARGET_DIR/$filename/index.html"
done
