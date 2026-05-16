import { Shield } from 'lucide-react'

export const metadata = { title: 'Privacy Policy — GameHub' }

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8 text-sm leading-relaxed">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        </div>
        <p className="text-muted-foreground">
          This policy explains what data GameHub collects, why, and your rights under
          the <strong className="text-foreground">General Data Protection Regulation (GDPR)</strong> and
          the <strong className="text-foreground">ePrivacy Directive</strong>.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2">Last updated: May 2026</p>
      </div>

      <hr className="border-border" />

      {/* 1. Who we are */}
      <section>
        <h2 className="font-semibold text-base mb-2">1. Data Controller</h2>
        <p className="text-muted-foreground">
          This GameHub instance is operated by the site owner as a private, self-hosted
          service. It is not operated by a company, and no personal data is shared with
          or sold to any third party, except where explicitly stated below.
        </p>
      </section>

      {/* 2. Cookies */}
      <section>
        <h2 className="font-semibold text-base mb-3">2. Cookies & Local Storage</h2>
        <div className="space-y-3">
          <CookieRow
            name="gamehub_session"
            type="Strictly necessary"
            purpose="Maintains your admin session. Set only after successful login."
            retention="30 days"
            basis="Legitimate interest (security)"
            canReject={false}
          />
          <CookieRow
            name="gh_consent_v1"
            type="Strictly necessary"
            purpose="Stores your cookie preference (accept / necessary only). Stored in localStorage."
            retention="Persistent (until you clear browser data)"
            basis="Legitimate interest (remembering your preference)"
            canReject={false}
          />
          <CookieRow
            name="gh_visited"
            type="Analytics"
            purpose="Prevents counting the same browser session as multiple visits. Stored in sessionStorage, cleared when you close the tab."
            retention="Session only"
            basis="Consent"
            canReject={true}
          />
        </div>
      </section>

      {/* 3. Server-side data */}
      <section>
        <h2 className="font-semibold text-base mb-3">3. Server-Side Data Collection</h2>
        <p className="text-muted-foreground mb-4">
          The following data is logged server-side when you interact with GameHub.
          This is equivalent to a standard web server access log and is processed under
          the basis of <strong className="text-foreground">legitimate interest</strong> (security,
          abuse prevention, operational monitoring).
        </p>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Data point</th>
                <th className="text-left px-4 py-2.5 hidden sm:table-cell">Why</th>
                <th className="text-left px-4 py-2.5">Retention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <DataRow d="IP address" why="Security, rate limiting, abuse prevention" ret="7 days (request log)" />
              <DataRow d="Request path & method" why="Usage analytics, error detection" ret="7 days" />
              <DataRow d="HTTP status code" why="Error monitoring" ret="7 days" />
              <DataRow d="Response time" why="Performance monitoring" ret="7 days" />
              <DataRow d="User-Agent string" why="Device / browser analytics" ret="7 days" />
              <DataRow d="Country, city, ISP (geo-lookup)" why="Understand geographic usage" ret="24 h cache, then re-fetched" />
              <DataRow d="Search query" why="Improve library search" ret="30 days (search log)" />
              <DataRow d="File downloaded, file size" why="Usage analytics, rate limiting" ret="90 days (download log)" />
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Third parties */}
      <section>
        <h2 className="font-semibold text-base mb-3">4. Third-Party Services</h2>
        <div className="space-y-3">
          <ThirdParty
            name="ip-api.com"
            purpose="Resolves IP addresses to country, city and ISP for the admin traffic dashboard."
            data="Your IP address is sent to ip-api.com for each new unique visitor. Results are cached for 24 hours to minimise lookups."
            privacy="https://ip-api.com/docs/legal"
          />
          <ThirdParty
            name="RAWG.io (optional)"
            purpose="Fetches game metadata (titles, covers, descriptions) for the admin CMS."
            data="Game title search queries are sent to RAWG. No personal data is transmitted."
            privacy="https://rawg.io/privacy"
          />
          <ThirdParty
            name="Ad shortener (optional)"
            purpose="Shortens download URLs to pass through an ad-supported link shortener."
            data="The direct download URL (containing no personal data) is sent to the configured shortener. Visitors who click the shortened link are subject to that service's own privacy policy."
            privacy={null}
          />
        </div>
      </section>

      {/* 5. Your rights */}
      <section>
        <h2 className="font-semibold text-base mb-3">5. Your Rights (GDPR)</h2>
        <ul className="space-y-2 text-muted-foreground list-none">
          {[
            ['Right of access', 'You can ask what data is held about your IP / session.'],
            ['Right to erasure', 'You can request deletion of your request logs, search logs and geo-cache entry.'],
            ['Right to object', 'You can object to analytics processing by selecting "Necessary only" in the cookie banner.'],
            ['Right to withdraw consent', 'Clear the gh_consent_v1 key from your browser\'s localStorage at any time to reset your choice.'],
          ].map(([right, desc]) => (
            <li key={right} className="flex gap-2">
              <span className="text-primary mt-0.5 flex-shrink-0">›</span>
              <span><strong className="text-foreground">{right}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-4">
          To exercise any right, contact the site owner directly.
        </p>
      </section>

      {/* 6. Data security */}
      <section>
        <h2 className="font-semibold text-base mb-2">6. Data Security</h2>
        <p className="text-muted-foreground">
          All data is stored locally in an SQLite database on the server. Admin access
          is protected by a password-based session. The session cookie is marked
          <code className="text-xs bg-secondary px-1 py-0.5 rounded mx-1">HttpOnly</code> and
          <code className="text-xs bg-secondary px-1 py-0.5 rounded mx-1">SameSite=Lax</code>.
          No data is transmitted to external parties beyond the services listed in section 4.
        </p>
      </section>

      {/* 7. Changes */}
      <section>
        <h2 className="font-semibold text-base mb-2">7. Changes to This Policy</h2>
        <p className="text-muted-foreground">
          If this policy changes materially, the "Last updated" date above will be revised.
          Continued use of GameHub after a policy change constitutes acceptance of the
          updated terms.
        </p>
      </section>

    </div>
  )
}

function CookieRow({
  name, type, purpose, retention, basis, canReject,
}: {
  name: string; type: string; purpose: string; retention: string; basis: string; canReject: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <code className="text-xs font-mono text-primary">{name}</code>
        <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${
          canReject
            ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
            : 'border-green-500/40 text-green-400 bg-green-500/10'
        }`}>
          {type}
        </span>
      </div>
      <p className="text-muted-foreground text-xs mb-2">{purpose}</p>
      <div className="flex gap-4 text-xs text-muted-foreground/70">
        <span>Retention: {retention}</span>
        <span>Basis: {basis}</span>
      </div>
    </div>
  )
}

function DataRow({ d, why, ret }: { d: string; why: string; ret: string }) {
  return (
    <tr className="hover:bg-accent/10">
      <td className="px-4 py-2.5 font-medium">{d}</td>
      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{why}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{ret}</td>
    </tr>
  )
}

function ThirdParty({
  name, purpose, data, privacy,
}: {
  name: string; purpose: string; data: string; privacy: string | null
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-medium">{name}</span>
        {privacy && (
          <a
            href={privacy}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Their privacy policy →
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{purpose}</p>
      <p className="text-xs text-muted-foreground/70 italic">{data}</p>
    </div>
  )
}
