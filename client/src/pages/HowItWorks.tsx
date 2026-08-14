import { LandingHeader } from "@/components/LandingHeader";
import { CloserSearchBar } from "@/components/CloserSearchBar";

const STEPS = [
  {
    n: "01",
    icon: "⌕",
    title: "Enter the property address",
    skippable: false,
    body: "Any Chicago address — or paste a listing URL. That's all we need to start pulling the record.",
  },
  {
    n: "02",
    icon: "⚡",
    title: "Answer a few quick questions",
    skippable: true,
    body: "Up to five quick questions about who you are and your plan — or skip them entirely. Your answers customize the report.",
  },
  {
    n: "03",
    icon: "▤",
    title: "Get your report in minutes",
    skippable: false,
    body: "Liens, zoning, permits, taxes, incentives, and market data — synthesized into one plain-language brief.",
  },
  {
    n: "04",
    icon: "✦",
    title: "Connect with the right pros",
    skippable: false,
    body: "Local attorneys, architects, and lenders who work your area and understand Chicago real estate.",
  },
];

const FUNNEL_QS = [
  {
    n: "01",
    title: "Who are you?",
    body: "Buy- or sell-side broker, owner/operator, primary-residence owner, renter, investor/developer, or lender.",
  },
  {
    n: "02",
    title: "What are you doing with the property?",
    body: "Buying, leasing as a tenant, leasing out as a landlord, or browsing.",
  },
  {
    n: "03",
    title: "What type of use are you considering?",
    body: "Restaurant, daycare, retail, office and more — this drives the zoning, incentive, and demand analysis.",
  },
  {
    n: "04",
    title: "What professional help do you want?",
    body: "Residential or commercial/SBA lenders, tax attorneys, zoning attorneys — matched to your property and ward.",
  },
  {
    n: "05",
    title: "Anything to add?",
    body: "A free-text box for the specifics — the cuisine, the concept, anything that sharpens the report.",
  },
];

const SCENARIOS = [
  {
    num: "Scenario 01",
    tag: "Under contract · ~5-day window",
    title: "Violations, an orange tag, and no room to build",
    situation: "You're under contract on a single-family home. The listing looked clean.",
    reveals: [
      <>Open building-code violations, plus an <b className="font-semibold">orange historic rating</b> — no facade changes without city approval.</>,
      <>A <b className="font-semibold">maxed-out FAR</b> — the addition you were planning would need a costly zoning variance.</>,
    ],
    stake: (
      <><b className="text-[#141414] font-semibold">Why it matters:</b> a Chicago home inspection runs <b className="text-[#141414] font-semibold">~$400–600</b> and flags none of this. Catch it during attorney review and you can <span className="text-[#2f7d3f] font-semibold">walk with your earnest money</span> — or renegotiate — before you've spent a dollar on the inspection.</>
    ),
  },
  {
    num: "Scenario 02",
    tag: "Before the offer",
    title: "A lien that never appears on the listing",
    situation: "You've found a strong investment property and you're about to make an offer.",
    reveals: [
      <>A <b className="font-semibold">mechanics lien</b> from unpaid contractor work — the kind that can run into the <b className="font-semibold">tens of thousands</b> and clouds the title until it's cleared.</>,
    ],
    stake: (
      <><b className="text-[#141414] font-semibold">Why it matters:</b> surfacing it <em>before</em> you offer keeps your earnest money (<b className="text-[#141414] font-semibold">1–3% of the price</b>) and your attorney fees off the table. After you're under contract, it becomes a fight.</>
    ),
  },
  {
    num: "Scenario 03",
    tag: "Wrong site for the use",
    title: "“Perfect for a daycare” — until it isn't",
    situation: "A storefront looks ideal to open a daycare center.",
    reveals: [
      <>The use needs a <b className="font-semibold">Special Use Permit</b> — a months-long Zoning Board process and thousands in fees.</>,
    ],
    stake: (
      <><b className="text-[#141414] font-semibold">Why it matters:</b> knowing up front, you keep looking and <span className="text-[#2f7d3f] font-semibold">find a site zoned for daycare as-of-right</span> — no hearing, no delay. That use-based check is exactly what the report runs when you tell it your plan.</>
    ),
  },
  {
    num: "Scenario 04",
    tag: "Discovered too late",
    title: "A lien on the owner, not the property",
    situation: "You're under contract on a condo.",
    reveals: [
      <>A <b className="font-semibold">judgment lien against the owner</b> that must be cleared before they can legally sell.</>,
    ],
    stake: (
      <><b className="text-[#141414] font-semibold">Why it matters:</b> discovered after you're committed, it can freeze the deal for months — and the earnest money and the opportunity can both be lost. Seen before you offer, you simply <span className="text-[#2f7d3f] font-semibold">move on to the next one</span>.</>
    ),
  },
];

function Rule() {
  return <div className="h-px bg-[#eae8e2] my-10" aria-hidden="true" />;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-jbmono text-[11px] font-bold tracking-[0.1em] uppercase text-[#141414] flex items-center gap-2.5 mb-2">
      <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
      {children}
    </div>
  );
}

export default function HowItWorks() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#141414]">
      <div className="hero-grid-bg" aria-hidden="true" />
      <LandingHeader />
      <div className="relative z-[1] max-w-[900px] mx-auto px-[26px] w-full">

        {/* HERO */}
        <div className="pt-[60px] pb-[34px]">
          <span className="font-jbmono text-[11px] font-bold tracking-[0.12em] uppercase text-[#565651] inline-flex items-center gap-[9px]">
            <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
            Process
          </span>
          <h1 className="font-serif font-normal text-[clamp(38px,6vw,60px)] leading-[1.02] tracking-[-0.01em] mt-4 mb-4" data-testid="text-hiw-headline">
            How it works.
          </h1>
          <p className="font-body text-[19px] text-[#565651] max-w-[58ch] leading-relaxed">
            Four steps stand between you and the complete picture of any Chicago property. The whole thing takes under five minutes.
          </p>
        </div>

        {/* STEPS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-[15px] bg-[#faf9f6] border border-[#eae8e2] rounded-[14px] px-5 py-[18px]" data-testid={`card-step-${step.n}`}>
              <span className="font-jbmono text-[12px] font-bold text-[#2b3a9e] pt-[3px]">{step.n}</span>
              <div className="w-[34px] h-[34px] rounded-[9px] bg-[#2b3a9e] text-white flex items-center justify-center text-[15px] flex-none" aria-hidden="true">{step.icon}</div>
              <div>
                <h4 className="font-body text-[15.5px] font-bold m-0 mb-1 text-[#141414]">
                  {step.title}{" "}
                  {step.skippable && (
                    <span className="font-jbmono text-[9px] font-bold tracking-[0.05em] text-[#8b8a84] uppercase">skippable</span>
                  )}
                </h4>
                <p className="font-body text-[13.5px] text-[#565651] m-0 leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <Rule />

        {/* FUNNEL */}
        <section data-testid="section-funnel">
          <SectionLabel>Step 02, up close</SectionLabel>
          <h2 className="font-serif font-normal text-[clamp(28px,4vw,42px)] leading-[1.06] tracking-[-0.01em] m-0 mb-3">
            Five questions. A report built around you.
          </h2>
          <p className="font-body text-[16.5px] text-[#565651] max-w-[62ch] m-0 mb-7 leading-relaxed">
            Once you've entered the address, we ask up to five quick questions — then tailor the zoning, incentives, referrals, and market data to your plan. <b className="text-[#141414] font-semibold">Skip any of them, or all of them</b>, and you'll still get the full data report.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {FUNNEL_QS.map((q) => (
              <div key={q.n} className="bg-[#faf9f6] border border-[#eae8e2] rounded-[13px] px-[17px] py-4" data-testid={`card-funnel-q-${q.n}`}>
                <div className="flex items-baseline gap-[9px] mb-1.5">
                  <span className="font-jbmono text-[11px] font-bold text-[#2b3a9e] flex-none">{q.n}</span>
                  <span className="font-body text-[14.5px] font-bold text-[#141414] leading-[1.2]">{q.title}</span>
                </div>
                <p className="font-body text-[12.5px] text-[#565651] m-0 leading-[1.45]">{q.body}</p>
              </div>
            ))}
            <div className="bg-[#ecedf9] border border-[#cdd3f2] rounded-[13px] px-[17px] py-4" data-testid="card-funnel-skip">
              <div className="flex items-baseline gap-[9px] mb-1.5">
                <span className="font-body text-[14.5px] font-bold text-[#141414] leading-[1.2]">Prefer to skip?</span>
              </div>
              <p className="font-body text-[12.5px] text-[#565651] m-0 leading-[1.45]">
                Hit <b className="text-[#141414] font-semibold">Skip — show me the data</b> at any point and go straight to the full report.
              </p>
            </div>
          </div>
        </section>

        <Rule />

        {/* SAMPLE STRIP */}
        <div className="flex items-center justify-between gap-4 bg-white border border-[#ddd4c6] rounded-[14px] px-[22px] py-[18px] flex-wrap shadow-[0_1px_2px_rgba(20,20,20,.05)]" data-testid="strip-sample-report">
          <div className="font-body text-[15px] text-[#141414]">
            <b className="font-semibold">Want to see what a real report looks like?</b> A complete 40-page report on a Logan Square property — every source, fully populated.
          </div>
          <a
            href="/sample-report.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="font-jbmono text-[11.5px] font-bold tracking-[0.04em] uppercase border border-[#141414] rounded-[9px] px-4 py-2.5 text-[#141414] hover:bg-[#141414] hover:text-white transition-colors"
            data-testid="link-sample-report-how-it-works"
          >
            View sample report →
          </a>
        </div>

        <Rule />

        {/* SCENARIOS */}
        <section data-testid="section-scenarios">
          <SectionLabel>Why it pays to look first</SectionLabel>
          <h2 className="font-serif font-normal text-[clamp(28px,4vw,42px)] leading-[1.06] tracking-[-0.01em] m-0 mb-3">
            What's hiding in the public record.
          </h2>
          <p className="font-body text-[16.5px] text-[#565651] max-w-[62ch] m-0 mb-7 leading-relaxed">
            A listing won't show these. A home inspection won't catch them. The examples below are <b className="text-[#141414] font-semibold">illustrative</b> — but the problems, and what they cost, are exactly what a report is built to surface <em>before</em> you're committed.
          </p>

          <div className="font-body text-[14px] text-[#565651] bg-[#ecedf9] border border-[#cdd3f2] rounded-[11px] px-4 py-[13px] mb-[22px] leading-relaxed" data-testid="text-scenarios-disclaimer">
            These scenarios are illustrative examples of what the public record can reveal — not specific customer results. The costs shown are typical Chicago ranges (a home inspection runs ~$400–600; earnest money is usually 1–3% of the purchase price; Illinois attorney-review windows are often about five days).
          </div>

          {SCENARIOS.map((s, i) => (
            <div key={i} className="border border-[#eae8e2] rounded-[16px] bg-white shadow-[0_1px_2px_rgba(20,20,20,.05)] p-6 mb-4" data-testid={`card-scenario-${i + 1}`}>
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="font-jbmono text-[10px] font-bold tracking-[0.08em] uppercase text-[#8b8a84]">{s.num}</span>
                <span className="font-jbmono text-[9.5px] font-bold tracking-[0.05em] uppercase rounded-[6px] px-[9px] py-[3px] ml-auto text-[#d13b26] bg-[#fbecea] border border-[#f1cec8]">{s.tag}</span>
              </div>
              <h3 className="font-serif font-normal text-[25px] leading-[1.1] tracking-[-0.01em] m-0 mb-3">{s.title}</h3>
              <ul className="list-none m-0 mb-3.5 p-0">
                <li className="font-body text-[15px] text-[#565651] pl-[18px] relative leading-[1.5]">
                  <span className="absolute left-0 top-[10px] w-1.5 h-1.5 rounded-full bg-[#8b8a84]" aria-hidden="true"></span>
                  {s.situation}
                </li>
              </ul>
              <div className="bg-[#fbecea] border border-[#f1cec8] border-l-4 rounded-[11px] px-4 py-[13px] mb-3.5">
                <div className="font-jbmono text-[9.5px] font-bold tracking-[0.07em] uppercase text-[#d13b26] mb-[7px]">The record reveals</div>
                <ul className="list-none m-0 p-0">
                  {s.reveals.map((r, j) => (
                    <li key={j} className="font-body text-[14px] text-[#141414] py-[3px] pl-4 relative leading-[1.45]">
                      <span className="absolute left-0 top-[10px] w-1.5 h-1.5 rounded-[2px] bg-[#d13b26]" aria-hidden="true"></span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="font-body text-[14.5px] text-[#565651] border-t border-[#eae8e2] pt-[13px] leading-[1.5]">{s.stake}</div>
            </div>
          ))}
        </section>

        <Rule />

        {/* CLOSER */}
        <div className="bg-[#141414] text-white rounded-[20px] px-10 py-[46px] text-center mt-1.5" data-testid="section-closer">
          <h2 className="font-serif font-normal text-[clamp(28px,4vw,42px)] leading-[1.06] tracking-[-0.01em] text-white m-0 mb-2.5">
            Catch it before you offer — <em className="italic text-[#f3b31f]">not at the closing table</em>.
          </h2>
          <p className="font-body text-white/[.72] text-[16.5px] max-w-[56ch] mx-auto m-0 mb-[22px] leading-relaxed">
            The public record holds the answer the whole time. A report just puts it in front of you before the money's committed. At <b className="text-white font-semibold">$29</b>, it's the cheapest insurance you can buy on a six-figure decision.
          </p>
          <CloserSearchBar variant="dark" page="how-it-works" />
        </div>

        {/* Footer */}
        <div className="pt-10 pb-16 text-center">
          <p className="font-jbmono text-[11px] tracking-[0.04em] text-[#8b8a84] uppercase">
            Chicago, IL · Cook County · © 2025 Know Your Property
          </p>
        </div>

      </div>
    </div>
  );
}
