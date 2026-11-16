# Retrieval on held-out papers

| Model | Task | R@1 | R@5 | R@10 | MRR | n |
|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | title->abstract | 0.898 | 0.983 | 0.991 | 0.937 | 344 |
| all-MiniLM-L6-v2 | half->half | 0.764 | 0.892 | 0.924 | 0.822 | 343 |
| clm-neuro-minilm | title->abstract | 0.922 | 0.991 | 0.994 | 0.953 | 344 |
| clm-neuro-minilm | half->half | 0.889 | 0.985 | 0.991 | 0.930 | 343 |
| specter2_base | title->abstract | 0.622 | 0.858 | 0.919 | 0.729 | 344 |
| specter2_base | half->half | 0.656 | 0.822 | 0.883 | 0.736 | 343 |
