#!/usr/bin/env python3

"""
Phase 2 聚类：使用 HDBSCAN
用法: python3 phase2-hdbscan.py <work_dir> <date> <min_cluster_size> [metric]
"""

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Sequence, cast

import hdbscan
import numpy as np
import numpy.typing as npt
from sklearn.preprocessing import normalize

EmbeddingArray = npt.NDArray[np.float32]
LabelArray = npt.NDArray[np.int64]


def load_items(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return cast(List[Dict[str, Any]], data["items"])


def uniform_sampling(
    items: List[Dict[str, Any]], max_per_publisher: int = 3
) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = defaultdict(int)
    sampled: List[Dict[str, Any]] = []

    for item in items:
        publisher = cast(str, item["source"]["publisher"])
        if counts[publisher] < max_per_publisher:
            sampled.append(item)
            counts[publisher] += 1
    return sampled


def run_hdbscan(
    embeddings: EmbeddingArray, min_cluster_size: int = 3, metric: str = "euclidean"
) -> LabelArray:
    if metric == "cosine":
        embeddings = cast(
            EmbeddingArray,
            normalize(embeddings).astype(np.float32, copy=False),
        )
        metric_name = "euclidean"
    else:
        metric_name = metric

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=2,
        metric=metric_name,
        allow_single_cluster=False,
        cluster_selection_epsilon=0.05,
        cluster_selection_method="leaf",
        gen_min_span_tree=False,
    )

    labels = clusterer.fit_predict(embeddings)
    return cast(
        LabelArray,
        np.asarray(labels, dtype=np.int64),
    )


def main() -> None:
    if len(sys.argv) < 4:
        print("Usage: phase2-hdbscan.py <work_dir> <date> <min_cluster_size> [metric]")
        sys.exit(1)

    work_dir = Path(sys.argv[1])
    date = sys.argv[2]
    min_cluster_size = int(sys.argv[3])
    metric = sys.argv[4] if len(sys.argv) > 4 else "euclidean"

    input_path = work_dir / "03-items-with-embeddings.json"
    output_path = work_dir / "04-clusters-hdbscan.json"

    items = load_items(input_path)

    # 过滤掉没有 embedding 的 items
    items_with_embedding = [item for item in items if item.get("summaryEmbedding") and len(item["summaryEmbedding"]) > 0]

    if len(items_with_embedding) < min_cluster_size:
        # 如果有 embedding 的 items 太少，返回空结果
        result = {
            "date": date,
            "stats": {
                "sampled_items": len(items_with_embedding),
                "clusters": 0,
                "noise_items": len(items_with_embedding),
            },
            "clusters": [],
            "noise_items": items_with_embedding,
        }
        with output_path.open("w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(json.dumps({
            "clusters": 0,
            "noise": len(items_with_embedding),
            "sampled": len(items_with_embedding),
            "output": str(output_path),
        }))
        return

    sampled_items = uniform_sampling(items_with_embedding, max_per_publisher=3)

    embeddings_list: List[Sequence[float]] = [
        cast(Sequence[float], item["summaryEmbedding"]) for item in sampled_items
    ]
    embeddings = cast(
        EmbeddingArray,
        np.asarray(embeddings_list, dtype=np.float32),
    )

    labels = run_hdbscan(embeddings, min_cluster_size=min_cluster_size, metric=metric)

    clusters: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    noise_items: List[Dict[str, Any]] = []

    for idx, label in enumerate(labels):
        item = sampled_items[idx]
        if label == -1:
            noise_items.append(item)
        else:
            clusters[int(label)].append(item)

    result = {
        "date": date,
        "stats": {
            "sampled_items": len(sampled_items),
            "clusters": len(clusters),
            "noise_items": len(noise_items),
        },
        "clusters": [
            {
                "cluster_id": int(label),
                "items": cluster_items,
            }
            for label, cluster_items in clusters.items()
        ],
        "noise_items": noise_items,
    }

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(
        json.dumps(
            {
                "clusters": len(clusters),
                "noise": len(noise_items),
                "sampled": len(sampled_items),
                "output": str(output_path),
            }
        )
    )


if __name__ == "__main__":
    main()
