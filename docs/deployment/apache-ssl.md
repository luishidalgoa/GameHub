# Apache reverse proxy + SSL

Apache terminates HTTPS and proxies to the container on `127.0.0.1:3001`. The
vhost templates live in `apache2/` and are installed by `./deploy.sh apache_setup`.

## What `apache_setup` does

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl
sudo cp apache2/gamehub.conf        /etc/apache2/sites-available/
sudo cp apache2/gamehub-le-ssl.conf /etc/apache2/sites-available/
sudo a2ensite gamehub.conf gamehub-le-ssl.conf
sudo a2dissite 000-default.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d "$DOMAIN" --redirect --keep-until-expiring …
```

## HTTPS vhost essentials (`apache2/gamehub-le-ssl.conf`)

- **Proxy** to the container:
  ```apache
  ProxyPreserveHost On
  ProxyPass        / http://127.0.0.1:3001/
  ProxyPassReverse / http://127.0.0.1:3001/
  RequestHeader set X-Real-IP         "%{REMOTE_ADDR}s"
  RequestHeader set X-Forwarded-Proto "https"
  ProxyTimeout 3600                      # large ROM downloads
  ```
  `X-Real-IP` is what the app uses for IP-based admin access, LAN checks and
  the traffic dashboard — keep it set.

- **WebSocket upgrade** (Next.js HMR in dev):
  ```apache
  RewriteCond %{HTTP:Upgrade} websocket [NC]
  RewriteRule ^/(.*) ws://127.0.0.1:3001/$1 [P,L]
  ```

- **SSE buffering disabled** for the scanner stream so progress events arrive live:
  ```apache
  <Location /api/scanner/stream>
    SetEnv proxy-initial-not-buffered 1
    SetEnv proxy-sendchunks 1
  </Location>
  ```

- **Upload size** for cover images: `LimitRequestBody 52428800` (50 MB).

- **Security headers**: `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options
  nosniff`, `Referrer-Policy no-referrer`.

  > ⚠️ The `Referrer-Policy no-referrer` header is why **embedded YouTube
  > trailers fail with "Error 153" in production but not on localhost**: YouTube
  > needs the origin as referrer. The app works around this by setting
  > `referrerPolicy="strict-origin-when-cross-origin"` on the embed iframe itself
  > (element-level policy overrides the document policy), so no Apache change is
  > required. If you ever add other embeds, set the same iframe attribute.

## Gotchas

- After SSL, ensure the app builds its absolute URLs from HTTPS — set
  `NEXT_PUBLIC_APP_URL=https://<your-domain>` (and/or the `app_url` setting).
- The Switch shop (`/api/shop`) is **LAN-only by design**; it's reached directly
  on the LAN IP + host port (`:3001`), not through the public HTTPS domain. See
  [../features/switch-shop.md](../features/switch-shop.md).
