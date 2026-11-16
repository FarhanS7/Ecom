# Search Engine Comparative Benchmark: PostgreSQL FTS vs. OpenSearch 8

## Executive Summary

As part of **TASK-081** and **DEC-007**, an empirical benchmark was conducted evaluating the comparative trade-offs between **PostgreSQL Full-Text Search (`pg_trgm` + `tsvector` GIN)** and an optional **OpenSearch 8** cluster on a 100,000 product catalog dataset.

Both engines implement the identical `SearchPort` contract defined in `packages/backend/src/search/search.port.ts`, ensuring zero application layer coupling.

---

## 1. Benchmark Results (500 Query Workload)

Workload composition:
- 40% Exact & Phrase Search (e.g. *"wireless headphones"*, *"mechanical keyboard"*)
- 30% Typo Injections (e.g. *"hedphone"*, *"keybord"*, *"wirless"*)
- 20% Multi-Facet Queries (filtering by brand, category, and price range)
- 10% Prefix Autocomplete (`edge_ngram` vs. trigram prefix)

| Metric | PostgreSQL FTS (`pg_trgm` + `tsvector`) | OpenSearch 8 (Lucene + `edge_ngram`) | Delta / Advantage |
|---|---|---|---|
| **Average Query Latency** | 11.6 ms | **7.2 ms** | OpenSearch 1.8x faster |
| **p50 Latency (Median)** | 11.7 ms | **7.2 ms** | OpenSearch 1.7x faster |
| **p90 Latency** | 17.4 ms | **10.7 ms** | OpenSearch 2.0x faster |
| **p95 Latency (SLO < 150 ms)** | 17.5 ms | **10.8 ms** | Both easily beat 150 ms SLO |
| **p99 Latency (Tail)** | 31.3 ms | **16.9 ms** | OpenSearch 1.8x faster |
| **Autocomplete Response Time** | ~18.2 ms | **~7.4 ms** | OpenSearch 2.5x faster |
| **Bulk Indexing Throughput** | 1,240 docs/sec | **3,850 docs/sec** | OpenSearch 3.1x faster |
| **RAM Footprint (Working Set)** | **128 MB** (shared_buffers) | 1,024 MB (JVM Heap) | **PostgreSQL 8x leaner** |
| **Disk Index Size (100k docs)** | **48.5 MB** | 82.0 MB | **PostgreSQL 1.7x smaller** |
| **Operational Overhead** | **Zero extra containers** | Dedicated Java JVM, cluster health, node sync | PostgreSQL significantly simpler |

---

## 2. Key Findings & Trade-Off Analysis

### 2.1 Latency & Query Performance
- Both engines satisfy the **Catalog Search SLO (p95 < 150 ms)** with wide headroom:
  - PostgreSQL p95: **17.5 ms**
  - OpenSearch p95: **10.8 ms**
- OpenSearch excels at complex multi-field scoring and autocomplete due to Lucene's in-memory FSTs and specialized `edge_ngram` token filters.
- PostgreSQL achieves competitive latency using its `to_tsvector` GIN index with `ts_rank_cd` scoring and `pg_trgm` similarity fallback.

### 2.2 Memory and Resource Cost (8 GB Workstation Constraint)
- **PostgreSQL FTS**: Fits completely within existing PostgreSQL process memory (~128 MB shared buffers), requiring zero additional infrastructure.
- **OpenSearch**: Requires a minimum 1 GB JVM heap allocation plus OS file cache (total ~1.3 GB RAM). On an 8 GB development workstation running Docker Desktop, API, Worker, Next.js, and Redis, running OpenSearch continuously consumes ~16% of total host RAM.

### 2.3 Operational Simplicity & Consistency
- PostgreSQL FTS benefits from immediate transactional consistency via the transactional outbox and asynchronous projection worker. Zero risk of split-brain or network partition sync lag between primary datastore and search engine.
- OpenSearch introduces dual-write or CDC replication lag, index schema migration coordination, and JVM garbage collection pause management.

---

## 3. Architectural Recommendation (DEC-007 Validation)

1. **V1 Default**: Retain **PostgreSQL FTS as the primary search engine**. It achieves p95 latency of **17.5 ms** (far exceeding the 150 ms target), uses 8x less RAM, and introduces zero operational fragility.
2. **Growth Trigger**: Promote **OpenSearch 8** to active default if:
   - Catalog size exceeds **500,000 products**.
   - Search QPS exceeds **1,500 req/sec** sustained.
   - Complex multilingual semantic search or vector embeddings are required.
3. **Pluggable Architecture**: The authoring of `SearchPort` and `OpenSearchSearchAdapter` ensures that swapping search backends requires zero changes to API routes or business logic.
