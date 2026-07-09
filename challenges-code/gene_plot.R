#| title: "Gene plot"
#| difficulty: "hard"
#| plot-types: "gene plot"
#| dataset-name: "gene_data"
#| description: "Plotting genes around the human gene GALNT9 with [gggenes](https://wilkox.org/gggenes/reference/index.html)"
#| stub: "gene_data |>\n  ggplot() +\n  geom_gene_arrow(\n    arrow_body_height = grid::unit(10, 'mm'),\n    arrowhead_height = grid::unit(15, 'mm')\n  )"

library(ggplot2)
library(dplyr)
library(gggenes)

gene_data <-
  structure(list(
    gene_name = c("DDX51", "ENSG00000255916", "ENSG00000256312", 
                  "ENSG00000256783", "ENSG00000256875", "ENSG00000257000", "ENSG00000274373", 
                  "ENSG00000274670", "ENSG00000276693", "ENSG00000277011", "ENSG00000286008", 
                  "ENSG00000291171", "ENSG00000294670", "ENSG00000296352", "ENSG00000299529", 
                  "ENSG00000299616", "ENSG00000300036", "ENSG00000301972", "ENSG00000303333", 
                  "ENSG00000308434", "ENSG00000308457", "ENSG00000309954", "EP400", 
                  "FBRSL1", "GALNT9", "GALNT9-AS1", "LINC02361", "NOC4L"), 
    sequnames = structure(c(1L, 
                            1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 
                            1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L), levels = "chr12", class = "factor"), 
    gene_type = c("protein_coding", "lncRNA", "lncRNA", "lncRNA", 
                  "lncRNA", "lncRNA", "lncRNA", "lncRNA", "lncRNA", "lncRNA", 
                  "lncRNA", "lncRNA", "lncRNA", "lncRNA", "lncRNA", "lncRNA", 
                  "lncRNA", "lncRNA", "lncRNA", "lncRNA", "lncRNA", "lncRNA", 
                  "protein_coding", "protein_coding", "protein_coding", "lncRNA", 
                  "lncRNA", "protein_coding"),
    start = c(575573, 768783, 613919, 
              896139, 901221, 516782, 863483, 522519, 608802, 721793, 783456, 
              523262, 869558, 930103, 876113, 812582, 867056, 914448, 553270, 
              772814, 783367, 885266, 388921, 928530, 635351, 714340, 625714, 
              583436), end = c(583298, 771413, 635535, 899003, 901835, 
                               519439, 864187, 522758, 609022, 723585, 784331, 570618, 870413, 
                               931524, 881571, 832479, 868388, 915406, 569940, 797019, 793471, 
                               906855, 519439, 1024167, 768568, 719879, 628707, 591447), 
    is_forward = c(FALSE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, 
                   FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, 
                   FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, 
                   TRUE, FALSE, TRUE)), 
    row.names = c(NA, -28L),
    class = "data.frame"
  )

p <-
  gene_data |>
  mutate(gene_type = if_else(
    gene_type == 'lncRNA',
    paste0(gene_type, if_else(is_forward, '(+)', '(-)')),
    gene_type
  )) |> 
  ggplot(
    aes(
      xmin = start,
      xmax = end, 
      y = gene_type
    )
  ) + 
  geom_gene_arrow(
    aes(
      xmin = start,
      xmax = end, 
      y = gene_type, 
      fill = gene_type,
      col = gene_type,
      forward = is_forward,
    ),
    alpha = 0.75,
    arrow_body_height = grid::unit(10, "mm"),
    arrowhead_height = grid::unit(15, "mm")
  ) +
  geom_gene_label(
    aes(label = gene_name)
  ) +
  theme(
    legend.position = 'none',
  ) +
  labs(
    title = 'GALNT9 locus',
    x = 'Chr12 Position (bp)',
    y = NULL
  )

print(p)
