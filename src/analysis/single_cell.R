#!/usr/bin/env Rscript

# exploratory clustering of the atlas's single-cell run profiles
# the source matrix contains TMM logCPM values, not raw cell-level counts
# clusters and cell labels are thus only profile-level and need review

suppressPackageStartupMessages({
  library(Seurat)
  library(Matrix)
  library(ggplot2)
  library(readr)
  library(dplyr)
})

# optional arguments, defaults provided below

args <- commandArgs(trailingOnly = TRUE)
arg_value <- function(flag, default) {
  i <- match(flag, args)
  if (is.na(i)) return(default)
  if (i == length(args)) stop("Missing value for ", flag)
  args[[i + 1L]]
}

expression_path <- arg_value("--expression", "data/raw/Paipu_deduplicated_expression.tsv")
metadata_path <- arg_value("--metadata", "data/raw/Paipu_deduplicated_metadata.tsv")
output_dir <- arg_value("--output-dir", "data/analysis/single-cell-r")
resolution <- as.numeric(arg_value("--resolution", "0.6"))
seed <- as.integer(arg_value("--seed", "1"))
if (!is.finite(resolution) || resolution <= 0) stop("--resolution must be positive")
set.seed(seed)

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

# filter metadata
metadata <- read_tsv(metadata_path) |>
  as.data.frame()
# metadata <- read.delim(metadata_path, check.names = FALSE, stringsAsFactors = FALSE,
#                        na.strings = c("", "NA"))
if (!all(c("run_accession", "single_bulk") %in% names(metadata))) {
  stop("Metadata needs run_accession and single_bulk columns")
}
metadata <- dplyr::filter(metadata, single_bulk == "single-cell")
# is_single <- metadata$single_bulk == "single-cell"
# metadata <- metadata[which(is_single %in% TRUE), , drop = FALSE]
# metadata <- metadata[!duplicated(metadata$run_accession) & !is.na(metadata$run_accession), , drop = FALSE]

header <- names(read.delim(expression_path, nrows = 0, check.names = FALSE))
if (length(header) < 4L || header[[1L]] != "Genes") {
  stop("Expression TSV must start with Genes and contain at least three profiles")
}
profile_ids <- intersect(header[-1L], metadata$run_accession)
if (length(profile_ids) < 3L) stop("Fewer than three single-cell profiles match the expression matrix")
expression <- read.delim(expression_path, check.names = FALSE, row.names = 1,
                         colClasses = c("character", rep("numeric", length(header) - 1L)),
                         na.strings = c("", "NA"))
expression <- as.matrix(expression[, profile_ids, drop = FALSE])
rownames(expression) <- make.unique(rownames(expression))
expression[!is.finite(expression)] <- 0
if (any(expression < 0)) {
  # the positive counts layer is a Seurat container requirement only
  # original logCPM matrix is restored as the data layer before analysis
  linear <- 2^pmax(expression, -30)
} else {
  linear <- expression
}
keep <- apply(expression, 1L, stats::var) > 0
expression <- expression[keep, , drop = FALSE]
linear <- linear[keep, , drop = FALSE]
if (nrow(expression) < 3L) stop("Fewer than three variable genes remain")

meta <- metadata[match(profile_ids, metadata$run_accession), , drop = FALSE]
rownames(meta) <- profile_ids
object <- CreateSeuratObject(counts = Matrix(linear, sparse = TRUE), meta.data = meta,
                             min.cells = 0, min.features = 0, assay = "RNA")
object[["RNA"]]$data <- expression
object <- FindVariableFeatures(object, selection.method = "vst",
                               nfeatures = min(2000L, nrow(expression)), verbose = FALSE)
object <- ScaleData(object, features = VariableFeatures(object), verbose = FALSE)
npcs <- min(30L, length(VariableFeatures(object)) - 1L, ncol(object) - 1L)
if (npcs < 2L) stop("Not enough profiles or variable genes for PCA")
object <- RunPCA(object, features = VariableFeatures(object), npcs = npcs, verbose = FALSE)
dims <- seq_len(min(20L, npcs))
object <- FindNeighbors(object, dims = dims, verbose = FALSE)
object <- FindClusters(object, resolution = resolution, random.seed = seed, verbose = FALSE)
object <- RunUMAP(object, dims = dims, seed.use = seed, verbose = FALSE)

# built-in broad mammalian marker panel; unsupported profiles stay Unassigned.
markers <- list(
  Immune = c("PTPRC", "CD3D", "CD3E", "MS4A1", "LYZ", "NKG7"),
  Epithelial = c("EPCAM", "KRT8", "KRT18", "KRT19", "KRT5", "KRT14"),
  Endothelial = c("PECAM1", "VWF", "KDR", "EMCN"),
  Fibroblast = c("COL1A1", "COL1A2", "DCN", "LUM", "COL3A1"),
  Neural = c("TUBB3", "RBFOX3", "SNAP25", "GFAP", "S100B"),
  Muscle = c("ACTA1", "MYH1", "MYH2", "DES", "ACTA2")
)
available <- lapply(markers, intersect, y = rownames(object))
available <- available[lengths(available) > 0L]
if (length(available)) {
  marker_genes <- unique(unlist(available, use.names = FALSE))
  marker_values <- expression[marker_genes, , drop = FALSE]
  # Scale all available markers here; Seurat's scale.data contains only HVGs.
  scaled <- t(scale(t(marker_values)))
  scaled[!is.finite(scaled)] <- 0
  scores <- vapply(available, function(genes) {
    colMeans(scaled[genes, , drop = FALSE])
  }, numeric(ncol(object)))
  if (is.null(dim(scores))) scores <- matrix(scores, ncol = 1L)
  colnames(scores) <- names(available)
  best <- max.col(scores, ties.method = "first")
  confidence <- scores[cbind(seq_len(nrow(scores)), best)]
  labels <- ifelse(confidence >= 0.25, colnames(scores)[best], "Unassigned")
} else {
  scores <- matrix(numeric(), nrow = ncol(object), ncol = 0L)
  labels <- rep("Unassigned", ncol(object))
}
object$predicted_cell_type <- labels

# FindAllMarkers provides exploratory cluster marker DE, not cohort-level DE.
cluster_markers <- FindAllMarkers(object, only.pos = TRUE, min.pct = 0.1,
                                 logfc.threshold = 0.1, verbose = FALSE)
write.csv(cluster_markers, file.path(output_dir, "cluster_markers.csv"), row.names = FALSE)
write.csv(data.frame(cell_id = colnames(object), cluster = Idents(object),
                     predicted_cell_type = labels),
          file.path(output_dir, "cell_annotations.csv"), row.names = FALSE)
score_table <- as.data.frame(scores, check.names = FALSE)
score_table$cell_id <- colnames(object)
score_table <- score_table[, c("cell_id", setdiff(names(score_table), "cell_id")), drop = FALSE]
write.csv(score_table, file.path(output_dir, "cell_type_scores.csv"), row.names = FALSE)
coordinates <- as.data.frame(Embeddings(object, "umap"))
coordinates$cell_id <- rownames(coordinates)
write.csv(coordinates, file.path(output_dir, "umap_coordinates.csv"), row.names = FALSE)
write.csv(object[[]], file.path(output_dir, "metadata_with_clusters.csv"))
saveRDS(object, file.path(output_dir, "single_cell_profiles.rds"))
plot <- DimPlot(object, reduction = "umap", group.by = "predicted_cell_type", label = TRUE) +
  ggtitle("Exploratory single-cell profile clusters")
ggsave(file.path(output_dir, "umap_cell_types.png"), plot, width = 9, height = 7, dpi = 160)
message("Analyzed ", ncol(object), " profiles and ", nrow(object), " genes. Results: ", output_dir)
