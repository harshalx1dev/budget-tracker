import Link from "next/link";
import { ArrowRight, Bot, CalendarClock, CloudOff, FileUp, Gift, ShieldCheck, Zap } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";

// Signed-in visitors never see this page: proxy.ts sends them to /app. It is static and holds no personal data.
const FEATURES = [
  { Icon: Zap, title: "Add it in a line", text: "Type “chai 20 cash” or “swiggy 450 upi yesterday”. Amounts, accounts and days are read for you, and it works offline." },
  { Icon: FileUp, title: "Import your statements", text: "Drop in a CSV or PDF from your bank. Lines you already added are matched, repeats are skipped, and it learns your categories." },
  { Icon: CalendarClock, title: "EMIs and bills that change", text: "Track EMIs with rate or amount changes, SIPs, rent and a salary that lands on the last day, moving back when it falls on a Sunday." },
  { Icon: ShieldCheck, title: "Safe to spend", text: "See what is truly free until your next payday after bills, goals and a buffer you choose, plus a six-month forecast." },
  { Icon: Gift, title: "A wishlist that knows when", text: "Save what you want with links and EMI options. It works out what you can afford now and what to wait for." },
  { Icon: Bot, title: "Your own AI and agent", text: "Optional. Bring your own Gemini key, or connect any MCP agent with a token you can revoke. Both are off until you turn them on." },
];

const STEPS = [
  ["Capture", "A line, a statement or an agent. Whatever is least effort that day."],
  ["Plan", "Budgets, goals, recurring items and EMIs build the picture of the next months."],
  ["Decide", "Safe to spend today, and a clear answer on what you can buy and when."],
];

export default function Landing() {
  return (
    <div className="land">
      <div className="land__bg" aria-hidden="true"><span className="orb orb--a" /><span className="orb orb--b" /><span className="rosette rosette--a" /><span className="rosette rosette--b" /><span className="rosette rosette--c" /></div>
      <header className="land__bar container">
        <Link href="/" className="wordmark" aria-label={`${BRAND.name}, home`}><LogoMark size={28} /><Wordmark /></Link>
        <nav className="land__nav" aria-label="Site">
          <a href="#features" className="pill">Features</a>
          <Link href="/login" className="pill">Sign in</Link>
          <Link href="/signup" className="btn btn--primary">Get started</Link>
          <ThemeToggle />
        </nav>
      </header>

      <main>
        <section className="hero container">
          <div className="hero__copy">
            <h1>{BRAND.tagline}</h1>
            <p className="lead">{BRAND.name} follows your money the way you actually live: cash and UPI, EMIs that change, and a salary on the last day of the month.</p>
            <div className="hero__cta">
              <Link href="/signup" className="btn btn--primary btn--lg">Create your account <ArrowRight size={18} aria-hidden /></Link>
              <Link href="/login" className="btn btn--secondary btn--lg">Sign in</Link>
            </div>
          </div>

          <figure className="hero__card well well--cloth" aria-label="Sample of the safe-to-spend view">
            <figcaption className="label">Sample data</figcaption>
            <p className="label">Safe to spend until payday</p>
            <p className="figure figure--hero">₹18,400</p>
            <p className="label">About ₹2,300 a day for 8 days</p>
            <ul className="hero__rows">
              <li><span>Phone EMI</span><span className="num">₹11,156 on the 4th</span></li>
              <li><span>SIP</span><span className="num">₹3,000 on the 1st</span></li>
              <li><span>Salary</span><span className="num amt" data-kind="income">On the last day</span></li>
            </ul>
          </figure>
        </section>

        <section id="features" className="land__section container" aria-labelledby="features-h">
          <h2 id="features-h" className="land__h">Everything you need to see ahead</h2>
          <div className="features">
            {FEATURES.map(({ Icon, title, text }) => (
              <article key={title} className="feature well">
                <span className="feature__icon"><Icon size={20} aria-hidden /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land__section container" aria-labelledby="how-h">
          <h2 id="how-h" className="land__h">Capture, plan, decide</h2>
          <ol className="steps">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="step">
                <span className="step__n figure figure--s">{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="land__section container" aria-labelledby="own-h">
          <div className="band well well--cloth">
            <CloudOff size={22} aria-hidden />
            <h2 id="own-h">Your data stays yours</h2>
            <p>Export everything as CSV or JSON any time. AI is optional and uses your own key. Agent access is read-only unless you allow more, and you can revoke it in one click.</p>
            <div className="hero__cta">
              <Link href="/signup" className="btn btn--primary btn--lg">Get started <ArrowRight size={18} aria-hidden /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="land__foot container">
        <Link href="/" className="wordmark" aria-label={`${BRAND.name}, home`}><LogoMark size={22} /><Wordmark /></Link>
        <span className="label">{BRAND.description}</span>
      </footer>
    </div>
  );
}
