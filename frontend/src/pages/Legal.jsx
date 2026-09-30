import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const updated = '15 July 2026'
const contact = 'rkdevanda65@gmail.com'

function Shell({ title, children }) {
  useEffect(() => {
    document.title = `${title} · Crickrida`
  }, [title])

  return (
    <main className="min-h-screen bg-[#0C1210] text-[#F3F4EE] px-5 py-10 sm:px-8">
      <article className="max-w-3xl mx-auto rounded-2xl border border-[#22302B] bg-[#121a17] p-6 sm:p-10 shadow-2xl">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-accent-brand text-sm mb-8 hover:underline">
          ← Back to Crickrida
        </Link>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-2">{title}</h1>
        <p className="text-text-muted text-sm mb-9">Last updated: {updated}</p>
        <div className="legal-copy space-y-7 text-text-secondary leading-7">{children}</div>
      </article>
    </main>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-heading font-semibold text-text-primary mb-2">{title}</h2>
      {children}
    </section>
  )
}

export function PrivacyPolicy() {
  return (
    <Shell title="Privacy Policy">
      <p>
        Crickrida provides free cricket statistics, analytics, and tools for creating shareable stat cards. You do not need an account to use any of it.
        This policy explains what information Crickrida processes and the choices available to you.
      </p>

      <Section title="Information we process">
        <ul className="list-disc pl-6 space-y-2">
          <li><strong className="text-text-primary">No visitor accounts:</strong> the public site and app need no sign-up. Sign-in exists only for site administrators.</li>
          <li><strong className="text-text-primary">Legacy accounts:</strong> if you created an account before public accounts were retired, we keep its name, email address, sign-in provider, encrypted password and sessions until you delete it.</li>
          <li><strong className="text-text-primary">Content you create:</strong> stat cards and captions made in the Studio are generated in your browser or app; they are not stored on our servers.</li>
          <li><strong className="text-text-primary">Technical requests:</strong> standard server logs may temporarily include request time, route, device/browser information, and network address for reliability and security.</li>
        </ul>
      </Section>

      <Section title="How information is used">
        <p>We use information to deliver the analytics and tools you request, secure the service, diagnose failures, and improve reliability. Crickrida does not sell personal information or use third-party advertising trackers.</p>
      </Section>

      <Section title="Service providers and sharing">
        <p>Data is shared only with providers needed to run the service, such as hosting and (for administrators) Google sign-in. These providers process information on our behalf under their own security and privacy obligations. Public cricket facts and statistics are not personal data.</p>
      </Section>

      <Section title="Photos and device permissions">
        <p>The mobile app requests photo-library access only when you choose to save a generated stat card. Sharing uses the operating system share sheet. Crickrida does not access your location, contacts, microphone, or camera.</p>
      </Section>

      <Section title="Retention and deletion">
        <p>Expired sessions and temporary generated files are removed or overwritten during normal operation. If you have a legacy account, you can permanently delete it and its account-linked records; see the <Link to="/account-deletion" className="text-accent-brand hover:underline">account deletion page</Link>.</p>
      </Section>

      <Section title="Security and your choices">
        <p>Crickrida uses encrypted HTTPS connections and stores mobile session credentials in the operating system’s secure storage. No method is completely risk-free. Every public feature works without an account.</p>
      </Section>

      <Section title="Children">
        <p>Crickrida is a general-audience sports analytics product and is not directed to children under 13. If you believe a child has provided personal information, contact us so it can be removed.</p>
      </Section>

      <Section title="Contact">
        <p>For privacy questions, email <a className="text-accent-brand hover:underline" href={`mailto:${contact}`}>{contact}</a>.</p>
      </Section>
    </Shell>
  )
}

export function TermsOfUse() {
  return (
    <Shell title="Terms of Use">
      <p>By using Crickrida, you agree to these terms. If you do not agree, do not use the service.</p>

      <Section title="The service">
        <p>Crickrida provides free historical cricket data, statistical analysis, and creative tools. No account is needed. Features may change as the product and underlying data improve.</p>
      </Section>


      <Section title="Acceptable use">
        <p>Do not use Crickrida to break laws, attack systems, scrape the service at abusive volume, publish unlawful or harmful content, impersonate others, or infringe intellectual-property rights. We may restrict abusive access to protect users and the service.</p>
      </Section>

      <Section title="Statistics">
        <p>Statistics are provided for information and entertainment. They may contain errors or omissions and should be independently verified before use in journalism, wagering, financial decisions, or other high-stakes contexts. Crickrida does not provide betting advice.</p>
      </Section>

      <Section title="Your content">
        <p>You retain rights to text and designs you create. You grant Crickrida the limited permission needed to process that content and deliver the feature you requested. You are responsible for ensuring you have the right to publish or share your output.</p>
      </Section>

      <Section title="Availability and liability">
        <p>The service is provided “as is” and “as available” to the extent permitted by law. We do not promise uninterrupted availability or perfect accuracy. To the maximum extent permitted by law, Crickrida is not liable for indirect or consequential losses arising from use of the service.</p>
      </Section>

      <Section title="Independent product">
        <p>Crickrida is an independent cricket analytics product. It is not affiliated with, endorsed by, or sponsored by the Board of Control for Cricket in India, the Indian Premier League, participating franchises, or players. Names and statistics are used descriptively.</p>
      </Section>

      <Section title="Contact">
        <p>Questions about these terms can be sent to <a className="text-accent-brand hover:underline" href={`mailto:${contact}`}>{contact}</a>.</p>
      </Section>
    </Shell>
  )
}

export function AccountDeletion() {
  const subject = encodeURIComponent('Crickrida account deletion request')
  const body = encodeURIComponent('Please delete my Crickrida account associated with this email address.\n\nAccount email: ')
  return (
    <Shell title="Delete Your Crickrida Account">
      <p>Crickrida no longer offers visitor accounts — every feature is free without signing up. If you created an account before accounts were retired, you can have it and its account-linked data permanently deleted.</p>
      <Section title="Request deletion">
        <p>Email us from the address associated with your account. We may ask you to verify ownership before deletion. Older versions of the mobile app can also delete an account from More → Account → Delete account.</p>
        <a
          className="inline-flex mt-4 rounded-xl bg-accent-brand text-[#0C1210] font-semibold px-5 py-3 hover:brightness-110"
          href={`mailto:${contact}?subject=${subject}&body=${body}`}
        >
          Request account deletion
        </a>
      </Section>
      <Section title="What is deleted">
        <p>Your profile, sessions, and account-linked usage records are deleted. Public cricket data is not tied to your account. Files already saved to your device or content you previously shared outside Crickrida remain under your control.</p>
      </Section>
    </Shell>
  )
}
