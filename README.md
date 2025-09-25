# ggplot2 Battles

Interactive challenges to master data visualization with ggplot2. Practice your R skills with real datasets in a browser-based environment - no installation required!

## 🌐 Access the Site

Visit **[ggplotbattles.dev](https://ggplotbattles.dev)** to start battling!

## 📖 About

ggplot battles presents you with target plots created with ggplot2. Your mission: recreate them as closely as possible using R code directly in your browser. Each challenge includes:

- **Real datasets** including penguins, mpg, and more
- **Instant feedback** with similarity scoring  
- **Browser-based R environment** powered by [webR](https://docs.r-wasm.org/webr/latest/)
- **Multiple difficulty levels** for all skill ranges

## 🤝 Contributing New Challenges

We welcome contributions! Here's how to add a new challenge:

### 1. Create the Challenge File

Create a new `.R` file in the `challenges-code/` directory with the following structure:

```r
#| title: "Your Challenge Title"
#| dataset-name: "dataset_name"  
#| description: "Brief description of what the challenge teaches or focuses on"
#| colours: "none"  # or describe color scheme if relevant
#| plot-variable: "p"  # variable name that contains the final plot

library(ggplot2)
# Add other required libraries

# Load your dataset
data(your_dataset, package = "package_name")

# Your ggplot2 code here
p <- ggplot(your_dataset, aes(...)) +
  geom_...() +
  # ... rest of your plot code

# IMPORTANT: The plot must be printed!
print(p)
```

### 2. Hashpipe Syntax Requirements

Use these special comments at the top of your file:

- `#| title:` - Display name for the challenge
- `#| dataset-name:` - Name of the dataset (shown to users)
- `#| description:` - What the challenge teaches/focuses on
- `#| colours:` - Color information (use "none" if not applicable)  
- `#| plot-variable:` - Variable containing the final plot (optional, defaults to `last_plot()`)

### 3. Important Requirements

- **The plot must be printed** - Either use `print(p)` or just `p` on its own line
- **The file must be _entirely_ self-contained** - No external dependencies or files. It can be as long as you like, so feel free to include long data frames if needed.
- **Set white backgrounds** - Ensure plots have white backgrounds for consistency

### 4. Testing the generation of Images and Manifest

After adding your challenge file, run:

```r
source("printer.R")
```

This will:
- Generate a PNG image of your plot in `challenges-images/`
- Update the `manifest.json` with your challenge metadata

## 🛠 Technical Details

- **Frontend**: HTML, CSS, JavaScript with Bootstrap
- **R Environment**: [webR](https://docs.r-wasm.org/webr/latest/) for browser-based R
- **Plotting**: ggplot2 with various extension packages
- **Comparison**: Canvas-based image similarity scoring

## 🎨 Local Development

1. Clone the repository
2. Serve the files with a local web server (required for webR)
3. For new challenges, run `printer.R` to regenerate images and manifest

```bash
# Example with Python
python -m http.server 8000

# Example with Node.js
npx http-server
```

## 📄 License

Open source project for educational purposes.

## 👨‍💻 Created By

Made by [Michael Lydeamore](https://www.michaellydeamore.com)

Powered by [webR](https://docs.r-wasm.org/webr/latest/) and [ggplot2](https://ggplot2.tidyverse.org/)