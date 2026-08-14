import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { LandingHeader } from "@/components/LandingHeader";
import { CloserSearchBar } from "@/components/CloserSearchBar";

const CREDENTIALS = [
  <><b className="text-[#141414] font-semibold">15+ years</b> as an owner's representative, project manager, real estate consultant, and investor</>,
  <><b className="text-[#141414] font-semibold">Ran a Chicago real estate consulting practice</b> — advising private, nonprofit, and faith-based clients on acquisition, feasibility, and development</>,
  <><b className="text-[#141414] font-semibold">Delivered capital projects at every scale</b> — from $200M+ institutional expansions to national portfolios of 800+ facilities</>,
  <><b className="text-[#141414] font-semibold">Hands-on with the system</b> — zoning boards, planning departments, and city officials for permits, variances, and adaptive reuse</>,
  <><b className="text-[#141414] font-semibold">Ran the analysis by hand</b> — pro formas, feasibility studies, and grant &amp; public-funding compliance on six- and seven-figure projects</>,
  <><b className="text-[#141414] font-semibold">Graduate-trained</b> in project management for real estate and construction</>,
];

const EXAMPLE_COLORS = ["#d13b26", "#f3b31f", "#2b3a9e"];

const EXAMPLES = [
  <><b className="text-[#141414] font-semibold">A home I wanted to add onto was already overbuilt</b> — no room left under zoning. I could have planned for the zoning change if I'd known going in.</>,
  <><b className="text-[#141414] font-semibold">A building's historic designation set the rules for a whole project</b> — not just whether we could touch the facade, but which funding we could use, since the wrong source triggers a federal environmental and historic review (NEPA) that can upend the construction schedule and the residents living through it. We caught it early, shifted the funding, and kept the timeline intact.</>,
  <><b className="text-[#141414] font-semibold">Deals nearly collapsed at the closing table over unpaid property taxes</b> that should have surfaced weeks earlier.</>,
];

const SERVES = [
  { h: "First-time homebuyers", d: "Making the biggest purchase of their life." },
  { h: "First-time investors", d: "Taking their first step into real estate." },
  { h: "Operators & small businesses", d: "Finding a home for a daycare, café, or clinic." },
  { h: "Seasoned developers", d: "Sizing up the next project." },
  { h: "Nonprofits", d: "Searching for the right place to serve." },
  { h: "Agents & brokers", d: "Giving clients a straight answer." },
];

const CHIPS = [
  "Cook County Assessor",
  "Circuit Court of Cook County",
  "Chicago Dept. of Buildings",
  "Zoning & Land Use",
  "HUD Fair Market Rents",
  "Federal lending (HMDA)",
  "DCEO / GATA incentives",
  "+ more",
];

function Rule() {
  return <div className="h-px bg-[#eae8e2] my-11" aria-hidden="true" />;
}

function SectionLabel({ icon, children }: { icon: string; children: string }) {
  return (
    <div className="font-jbmono text-[11px] font-bold tracking-[0.1em] uppercase text-[#141414] flex items-center gap-2.5 mb-5">
      <span className="w-[26px] h-[26px] rounded-[7px] bg-[#ecedf9] text-[#2b3a9e] flex items-center justify-center text-[14px]" aria-hidden="true">{icon}</span>
      {children}
    </div>
  );
}

export default function About() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#141414]">
      <div className="hero-grid-bg" aria-hidden="true" />
      <LandingHeader />
      <div className="relative z-[1] max-w-[820px] mx-auto px-[26px] w-full">

        {/* HERO */}
        <div className="pt-16 pb-10">
          <span className="font-jbmono text-[11px] font-bold tracking-[0.12em] uppercase text-[#565651] inline-flex items-center gap-[9px]">
            <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
            About us
          </span>
          <h1 className="font-serif font-normal text-[clamp(36px,5.6vw,58px)] leading-[1.03] tracking-[-0.01em] mt-4 mb-[18px]" data-testid="text-about-headline">
            Built by an industry insider.<br />Made for <em className="italic text-[#2b3a9e]">everyone else</em>.
          </h1>
          <p className="font-body text-[19px] text-[#565651] max-w-[60ch] leading-relaxed">
            KnowYourProp comes from 15+ years on the owner's side of real estate — as a consultant advising clients, as an investor buying for his own account, and now as someone hunting for a small business to own and operate. Three seats at the same table, one recurring frustration: the information you need is never as easy to get as it should be.
          </p>
        </div>

        <Rule />

        {/* THE EXPERIENCE BEHIND IT */}
        <section data-testid="section-experience">
          <SectionLabel icon="◆">The experience behind it</SectionLabel>
          <div className="bg-[#faf9f6] border border-[#eae8e2] rounded-[16px] p-[26px] shadow-[0_1px_2px_rgba(20,20,20,.05)]">
            <p className="font-body text-[16.5px] text-[#565651] mb-5 leading-relaxed">
              KnowYourProp was built by someone who has spent 15+ years on the <b className="text-[#141414] font-semibold">owner's side</b> of real estate — the one accountable for getting a project right — across consulting, institutional development, asset management, and investing.
            </p>
            {CREDENTIALS.map((cred, i) => (
              <div key={i} className={`flex gap-[13px] py-3 ${i < CREDENTIALS.length - 1 ? "border-b border-[#eae8e2]" : ""}`} data-testid={`row-credential-${i}`}>
                <span className="w-2 h-2 rounded-[2px] bg-[#2b3a9e] flex-none mt-2" aria-hidden="true"></span>
                <div className="font-body text-[15.5px] text-[#565651] leading-relaxed">{cred}</div>
              </div>
            ))}
            <div className="mt-[18px] font-body text-[15px] text-[#565651] italic border-l-[3px] border-[#f3b31f] pl-3.5 leading-relaxed">
              <b className="text-[#141414] not-italic font-semibold">KnowYourProp is the tool built from that experience</b> — the analysis run by hand for institutional clients, made instant and open to everyone.
            </div>
          </div>
        </section>

        <Rule />

        {/* WHY I BUILT THIS */}
        <section data-testid="section-founder-note">
          <SectionLabel icon="✎">Why I built this</SectionLabel>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 max-w-[64ch] leading-relaxed">
            For fifteen years, sizing up a property meant hunting across a dozen disconnected systems — county sites, court records, permit portals, zoning maps — some of it buried so deep in government websites you'd never find it unless you already knew where to look.
          </p>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 max-w-[64ch] leading-relaxed">
            And you rarely have time to find out. On a purchase, you get about <b className="text-[#141414] font-semibold">five days</b> of inspections once a property's under contract; on a bigger project, the schedule and the funding are locked in months ahead. Either way, you end up spending real money to learn what the public record already knew:
          </p>
          <ul className="list-none m-0 mb-[18px] p-0 max-w-[64ch]">
            {EXAMPLES.map((ex, i) => (
              <li key={i} className={`relative py-[11px] pl-[26px] font-body text-[15.5px] text-[#565651] leading-relaxed ${i < EXAMPLES.length - 1 ? "border-b border-[#eae8e2]" : ""}`} data-testid={`item-example-${i}`}>
                <span className="absolute left-1.5 top-[17px] w-2 h-2 rounded-[2px]" style={{ background: EXAMPLE_COLORS[i] }} aria-hidden="true"></span>
                {ex}
              </li>
            ))}
          </ul>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 max-w-[64ch] leading-relaxed">
            I've even ended up in court over earnest money that wasn't returned, because we only discovered these limitations during attorney review. Every time, the record had the answer the whole time — it was just too hard, too slow, or too expensive to reach.
          </p>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 max-w-[64ch] leading-relaxed">
            That cost is what bothered me most. In my consulting practice, we charged nonprofits <b className="text-[#141414] font-semibold">$5,000 to $15,000</b> for an initial site assessment. Someone deciding whether to buy, lease, or build shouldn't have to pay a fortune — or gamble their earnest money — to understand the basics.
          </p>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 max-w-[64ch] leading-relaxed">
            Lately I've been on the buyer's side myself — looking at small businesses for sale where the real estate is the real prize. Good businesses, sometimes carrying building baggage you'd never spot from a listing. Whether you're investing or planning to run the place yourself, the question is the same: <b className="text-[#141414] font-semibold">what's really here, and what can I do with it?</b> So I built the tool that answers it — for any use, from any seat at the table.
          </p>
          <p className="font-serif text-[21px] italic text-[#141414] leading-[1.32] mt-[22px] mb-5 max-w-[60ch]" data-testid="text-founder-sig">
            KnowYourProp is the tool I wish I'd had — the analysis I ran by hand for institutional clients, made instant and open to everyone.
          </p>
          <div className="flex items-center gap-[11px] font-body text-[15.5px] text-[#565651]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 5 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#2b3a9e" />
              <path d="M1.5 10 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#f3b31f" />
              <path d="M1.5 15 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#2f7d3f" />
              <path d="M1.5 20 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#d13b26" />
            </svg>
            <span>— <b className="text-[#141414] font-semibold">Founder</b>, KnowYourProp</span>
          </div>
        </section>

        <Rule />

        {/* RIVERS */}
        <section data-testid="section-rivers">
          <div className="bg-[#1e2a6e] text-white rounded-[20px] px-10 py-11 text-center relative overflow-hidden">
            <div className="font-jbmono text-[11px] font-bold tracking-[0.12em] uppercase text-[#f3b31f] mb-[18px]">The idea behind the mark</div>
            <div className="mb-[22px]">
              <svg className="inline-block" width="60" height="60" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <path d="M1.5 5 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#6f83e0" />
                <path d="M1.5 10 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#f3b31f" />
                <path d="M1.5 15 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#4fb56a" />
                <path d="M1.5 20 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#ef6a57" />
              </svg>
            </div>
            <h2 className="font-serif font-normal text-[clamp(28px,4vw,40px)] leading-[1.08] tracking-[-0.01em] text-white m-0 mb-3.5">Many streams, one current.</h2>
            <p className="font-body text-[17px] text-white/[.86] max-w-[58ch] mx-auto m-0 leading-relaxed">
              Property information moves like water before the rivers meet — dozens of separate streams, each carrying a piece of the truth, none of them much use on their own. Our mark is those streams converging: scattered public records flowing together into one clear current you can finally navigate.
            </p>
          </div>
        </section>

        <Rule />

        {/* MISSION */}
        <section data-testid="section-mission">
          <SectionLabel icon="♡">Our mission</SectionLabel>
          <h2 className="font-serif font-normal text-[clamp(28px,4vw,40px)] leading-[1.08] tracking-[-0.01em] m-0 mb-3.5">
            Property intelligence shouldn't require <em className="font-serif italic text-[#2b3a9e]">insider access</em>.
          </h2>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 leading-relaxed">
            Too often, the data that de-risks a property decision is safeguarded — reachable only by those with expertise, relationships, or deep pockets. The public record exists, but it's scattered across dozens of systems that were never built for you to read. We pull it together, translate it into plain language, and put it in the hands of the person actually making the decision.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-[22px]">
            {SERVES.map((s, i) => (
              <div key={i} className="border border-[#eae8e2] rounded-[12px] px-4 py-[15px] bg-white" data-testid={`card-serves-${i}`}>
                <div className="font-body font-semibold text-[15px] text-[#141414]">{s.h}</div>
                <div className="font-body text-[13.5px] text-[#565651] mt-[3px]">{s.d}</div>
              </div>
            ))}
          </div>
        </section>

        <Rule />

        {/* DATA */}
        <section data-testid="section-data">
          <SectionLabel icon="▤">Our data</SectionLabel>
          <p className="font-body text-[16.5px] text-[#565651] mb-4 leading-relaxed">
            We synthesize the public record — <b className="text-[#141414] font-semibold">county recorders, the circuit court, the assessor, buildings &amp; zoning, education boards, federal lending data, and dozens of incentive programs</b> — into one comprehensive, decision-ready brief.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {CHIPS.map((chip, i) => (
              <span key={i} className="font-body text-[12.5px] text-[#565651] bg-white border border-[#eae8e2] rounded-full px-[13px] py-1.5" data-testid={`chip-source-${i}`}>{chip}</span>
            ))}
          </div>
        </section>

        <Rule />

        {/* CLOSER */}
        <div className="bg-[#141414] text-white rounded-[20px] px-10 py-11 text-center mt-2" data-testid="section-closer">
          <h3 className="font-serif font-normal text-[clamp(26px,3.6vw,36px)] leading-[1.14] m-0 mb-2">
            We're not just providing data.<br />We're providing <em className="italic text-[#f3b31f]">context, connections, and confidence</em>.
          </h3>
          <p className="font-body text-white/70 m-0 mb-[22px]">See what the record says about your property.</p>
          <CloserSearchBar variant="dark" page="about" />
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 pb-16 text-center">
          <Link href="/" className="inline-flex items-center gap-2 font-jbmono text-[11px] uppercase tracking-[0.12em] font-bold text-[#141414] hover:text-[#565651] transition-colors" data-testid="link-back-home">
            <ArrowLeft className="w-3 h-3" />
            Back to KnowYourProp
          </Link>
          <p className="font-jbmono text-[11px] tracking-[0.04em] text-[#8b8a84] uppercase mt-4">
            Chicago, IL · Cook County · © 2025 Know Your Property
          </p>
        </div>

      </div>
    </div>
  );
}
