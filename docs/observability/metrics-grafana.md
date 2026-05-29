# Metrics, Prometheus & Grafana

GameHub ships an **app-level Prometheus exporter** at `GET /api/metrics`. For
**host** metrics (CPU/RAM/disk of the Raspberry) run `node_exporter` separately
and scrape both. For raw **logs** in Grafana, use Loki + Promtail (out of scope
here; the app already logs to stdout / `docker logs`).

| Want | Tool | App work |
|---|---|---|
| App metrics (traffic, downloads, library) | `/api/metrics` → Prometheus → Grafana | built-in (this page) |
| Host metrics (Pi CPU/RAM/disk) | `node_exporter` → Prometheus | none (separate service) |
| Raw logs | Loki + Promtail → Grafana | none (reads `docker logs`) |

## `GET /api/metrics`

Source: `src/app/api/metrics/route.ts`. Standard Prometheus text exposition
(`text/plain; version=0.0.4`). Values are derived from the DB on each scrape.

### Access control

- If `METRICS_TOKEN` (env) or the `metrics_token` setting is set → requires
  `Authorization: Bearer <token>` (use Prometheus `bearer_token`).
- Otherwise → **LAN-only** (private IPs). Not behind the admin middleware.

### Exposed metrics

| Metric | Type | Description |
|---|---|---|
| `gamehub_up` | gauge | Always `1` (exporter reachable) |
| `gamehub_games{platform="…"}` | gauge | Visible games per platform |
| `gamehub_games_visible_total` | gauge | Total visible games |
| `gamehub_platforms` | gauge | Configured platforms |
| `gamehub_http_requests_total{status="…"}` | counter | HTTP requests by status code |
| `gamehub_http_request_duration_ms_avg` | gauge | Avg request latency, last hour (ms) |
| `gamehub_http_requests_today` | gauge | Requests since local midnight |
| `gamehub_unique_visitors_today` | gauge | Distinct client IPs since local midnight |
| `gamehub_active_visitors` | gauge | Distinct client IPs in the last 10 minutes |
| `gamehub_downloads_total` | counter | Download attempts (all time) |
| `gamehub_downloads_completed_total` | counter | Completed downloads (all time) |
| `gamehub_download_bytes_total` | counter | Bytes served for completed downloads |
| `gamehub_searches_total` | counter | Library searches (all time) |

> The `counter` metrics are derived from DB log tables. If you ever prune
> `RequestLog` / `DownloadLog`, the counters drop — Prometheus treats that as a
> counter reset and `rate()` handles it correctly.

## Prometheus scrape config

```yaml
scrape_configs:
  # GameHub app metrics
  - job_name: gamehub
    metrics_path: /api/metrics
    static_configs:
      - targets: ['<raspberry-lan-ip>:3001']   # host port from docker-compose
    # Only if METRICS_TOKEN / metrics_token is set:
    # authorization:
    #   type: Bearer
    #   credentials: '<your-token>'

  # Host metrics (install node_exporter on the Pi separately)
  - job_name: node
    static_configs:
      - targets: ['<raspberry-lan-ip>:9100']
```

Quick check:

```bash
curl http://<raspberry-lan-ip>:3001/api/metrics            # LAN
curl -H "Authorization: Bearer <token>" https://<domain>/api/metrics   # remote w/ token
```

## Grafana

1. Add a **Prometheus** data source pointing at your Prometheus server.
2. Build panels, e.g.:
   - Downloads rate: `rate(gamehub_downloads_total[5m])`
   - Bandwidth: `rate(gamehub_download_bytes_total[5m])`
   - Active visitors: `gamehub_active_visitors`
   - Error ratio: `sum(rate(gamehub_http_requests_total{status=~"5.."}[5m]))`
   - Library size: `gamehub_games` (by `platform` label)

## The built-in dashboard

`/admin/traffic` is a self-contained analytics dashboard (page views, latency,
live request log, download analytics, device/browser/console breakdowns, search
feed, rate-limit alerts, IP registry with geo). It reads the same DB log tables
directly and does not require Prometheus.
