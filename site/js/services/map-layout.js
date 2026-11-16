// 2D layout and clusters for the paper map: precomputed by embed_corpus.py when available,
// otherwise PCA + k-means on this device. Cached on the index object.

import { kmeans, labelClusters, pca2 } from "../lib/search-core.js";

export function mapLayout(index) {
  if (index._layout) return index._layout;
  let points, labels, names, method;
  if (index.map?.points) {
    points = index.papers.map((p) => index.map.points[p.id]?.slice(0, 2) || [0.5, 0.5]);
    labels = index.papers.map((p) => index.map.points[p.id]?.[2] ?? 0);
    names = index.map.clusters;
    method = index.map.method?.toUpperCase();
  } else {
    points = pca2(index.vectors, index.dim);
    const k = Math.max(3, Math.min(8, Math.round(Math.sqrt(index.papers.length / 6))));
    labels = Array.from(kmeans(index.vectors, index.dim, k));
    names = labelClusters(index.papers.map((p) => p.title), labels, k);
    method = "PCA, computed on your device";
  }
  index._layout = { points, labels, names, method };
  return index._layout;
}
