import { ReactNode } from "react";
import { Link } from "wouter";
import { LandingHeader } from "@/components/LandingHeader";
import { CloserSearchBar } from "@/components/CloserSearchBar";

type QA = {
  q: ReactNode;
  a: ReactNode;
  trust?: boolean;
  defaultOpen?: boolean;
};

type Section = {
  label: string;
  items: QA[];
};

const SECTIONS: Section[] = [
  {
    label: "Before you make an offer",
    items: [
      {
        q: "Why get a report before I make an offer?",
        defaultOpen: true,
        a: (
          <>Once you're under contract, you've usually put down earnest money (often <b className="text-[#141414] font-semibold">1–3% of the price — $5,000 to $50,000+</b>) and you're paying an attorney (<b className="text-[#141414] font-semibold">$1,500–$3,000</b>) to review the deal on a tight clock. Anything you find at that point, you find with your money and your leverage already committed. A report puts the full picture in front of you first — so you can walk, renegotiate, or move ahead knowing exactly what you're buying.</>
        ),
      },
      {
        q: "Can I actually use this to negotiate?",
        a: (
          <>It's one of the most common ways people use it. If the record shows a lien, an open violation, or a use that needs a costly zoning approval, that's a documented reason to adjust your offer — for example, <span className="text-[#2b3a9e] font-semibold">"there's a recorded lien on this property, so I'm reflecting that in my number."</span> A documented fact is much harder to wave away than a hunch.</>
        ),
      },
      {
        q: "What if I find something the seller didn't disclose?",
        a: (
          <>That's the report doing its job. Found <em>before</em> you offer, an undisclosed lien or violation is just information — you can pass, price it in, or ask the seller to clear it as a condition of the deal. Found <em>after</em> you're under contract, the same issue becomes a fight on a deadline. <span className="text-[#2f7d3f] font-semibold">Earlier is always cheaper.</span></>
        ),
      },
    ],
  },
  {
    label: "What's in a report",
    items: [
      {
        q: "What does a report actually cover?",
        a: (
          <>The public record on a Chicago property, pulled into one place: ownership and sale history, recorded liens and mortgages, building-code violations and permit history, property-tax status and trajectory, zoning and what it allows, location-based incentive zones, and neighborhood market and demographic data. Instead of a dozen county and city systems that don't talk to each other, <b className="text-[#141414] font-semibold">one plain-language brief.</b></>
        ),
      },
      {
        q: "Does the report change based on what I want to do?",
        a: (
          <>Yes — that's the point of the few questions we ask up front. Tell us you're opening a daycare and the report leans into the zoning, special-use, and childcare-demand picture; tell us you're a residential buyer and it focuses there. <b className="text-[#141414] font-semibold">Same address, a different report, built around your plan.</b> Prefer to skip the questions? You'll still get the full data report.</>
        ),
      },
      {
        q: "How current is the data?",
        a: (
          <>We pull from public sources daily, so most data is current within <b className="text-[#141414] font-semibold">24–48 hours</b>. A few sources lag by nature — recorded sales and permit filings can trail <b className="text-[#141414] font-semibold">30–90 days</b> depending on how quickly the county and city post them. When something is time-sensitive, the report flags it.</>
        ),
      },
      {
        q: "What areas do you cover?",
        a: (
          <>All of <b className="text-[#141414] font-semibold">Chicago and Cook County, Illinois</b> today. It's one of the most layered property markets in the country — dense zoning, TIF districts, landmark rules, dozens of overlapping incentive programs — which is exactly why we started here. More markets are on the way.</>
        ),
      },
    ],
  },
  {
    label: "Accuracy & limits",
    items: [
      {
        q: "How accurate is the lien search?",
        trust: true,
        a: (
          <>We search both the property PIN and the owner's name against the Cook County Recorder, which gets us <b className="text-[#141414] font-semibold">75%+ coverage</b> — and we'd rather tell you that plainly than claim 100%. Some liens are recorded in other venues or are still pending recording when you look. Treat the report as your early-warning system, and <b className="text-[#141414] font-semibold">always confirm with a title company before closing.</b></>
        ),
      },
      {
        q: "Is this a replacement for a title company?",
        trust: true,
        a: (
          <>No, and we won't pretend otherwise. We're <b className="text-[#141414] font-semibold">pre-purchase due diligence</b> — the picture you want before you commit money. You'll still need a title company at closing for title insurance and final lien clearance. Think of us as the step that comes before you ever get there.</>
        ),
      },
      {
        q: 'Can you tell me I\'m "definitely eligible" for a tax incentive?',
        trust: true,
        a: (
          <>We tell you which incentive zones a property falls inside — Opportunity Zones, TOD areas, and the like — because that's a matter of public record. Whether you actually <em>qualify</em> depends on your project, your structure, and program rules, so final eligibility is a conversation for a tax advisor. <b className="text-[#141414] font-semibold">We'll show you where to look; we won't guess for you.</b></>
        ),
      },
      {
        q: "What if the report has incorrect information?",
        trust: true,
        a: (
          <>Public records aren't perfect — a county system can carry a typo, a stale entry, or a lag before an update posts. We'd much rather you flag it than quietly lose trust in the whole report. If something looks wrong, email <b className="text-[#141414] font-semibold"><a href="mailto:support@knowyourprop.com" className="text-[#2b3a9e] underline" data-testid="link-support-email-faq">support@knowyourprop.com</a></b> with the address and what you're seeing, and we'll check it against the source and correct it. For anything time-sensitive, the report also points you to the original source so you can verify before you act.</>
        ),
      },
    ],
  },
  {
    label: "Pricing & account",
    items: [
      {
        q: "How much does a report cost?",
        a: (
          <>A single property report is <b className="text-[#141414] font-semibold"><Link href="/" className="text-[#2b3a9e] underline" data-testid="link-pricing-report">$29</Link></b>. If you're running properties regularly — agents, investors, developers — a <b className="text-[#141414] font-semibold">$99/month</b> subscription gives you unlimited reports, saved history, and multi-property comparison.</>
        ),
      },
      {
        q: "Can I get a refund?",
        a: (
          <>Yes. If the report doesn't give you what you needed, contact us within <b className="text-[#141414] font-semibold">7 days</b> for a full refund — no questions asked.</>
        ),
      },
      {
        q: "Do you offer pricing for agents or developers?",
        a: (
          <>Yes — the <b className="text-[#141414] font-semibold">$99/month</b> subscription is built for exactly that: unlimited reports, saved history, and side-by-side comparison across properties. If you're a larger team with heavier volume, reach out and we'll work something out.</>
        ),
      },
    ],
  },
];

function Accordion({ item, id }: { item: QA; id: string }) {
  return (
    <details
      className={`group border rounded-[13px] bg-white mb-2.5 overflow-hidden shadow-[0_1px_2px_rgba(20,20,20,.05)] ${item.trust ? "border-[#cdd3f2]" : "border-[#eae8e2]"}`}
      open={item.defaultOpen}
      data-testid={`accordion-${id}`}
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-3.5 px-5 py-[17px] font-serif text-[20px] font-normal text-[#141414] leading-[1.15]">
        {item.q}
        <span className="ml-auto flex-none w-[22px] h-[22px] relative" aria-hidden="true">
          <span className="absolute top-[10px] left-[3px] right-[3px] h-[2px] rounded-[2px] bg-[#2b3a9e]"></span>
          <span className="absolute left-[10px] top-[3px] bottom-[3px] w-[2px] rounded-[2px] bg-[#2b3a9e] transition-opacity duration-200 group-open:opacity-0"></span>
        </span>
      </summary>
      <div className="px-5 pb-[19px] font-body text-[15px] text-[#565651] leading-[1.6]">{item.a}</div>
    </details>
  );
}

export default function FAQ() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#141414]">
      <div className="hero-grid-bg" aria-hidden="true" />
      <LandingHeader />
      <div className="relative z-[1] max-w-[820px] mx-auto px-[26px] w-full">

        {/* HERO */}
        <div className="pt-[60px] pb-[30px]">
          <span className="font-jbmono text-[11px] font-bold tracking-[0.12em] uppercase text-[#565651] inline-flex items-center gap-[9px]">
            <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
            Questions &amp; answers
          </span>
          <h1 className="font-serif font-normal text-[clamp(38px,6vw,60px)] leading-[1.02] tracking-[-0.01em] mt-4 mb-4" data-testid="text-faq-headline">
            The honest FAQ.
          </h1>
          <p className="font-body text-[19px] text-[#565651] max-w-[56ch] leading-relaxed">
            What a report can tell you, what it can't, and where our numbers come from. No overpromising — that's the whole point of the product.
          </p>
        </div>

        {SECTIONS.map((section, si) => (
          <section key={si} data-testid={`section-faq-${si + 1}`}>
            <div className="h-px bg-[#eae8e2] mt-[34px] mb-[26px]" aria-hidden="true" />
            <div className="font-jbmono text-[11px] font-bold tracking-[0.1em] uppercase text-[#141414] flex items-center gap-2.5 mb-4">
              <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
              {section.label}
            </div>
            {section.items.map((item, qi) => (
              <Accordion key={qi} item={item} id={`${si + 1}-${qi + 1}`} />
            ))}
          </section>
        ))}

        <div className="h-px bg-[#eae8e2] mt-[34px] mb-[26px]" aria-hidden="true" />

        {/* CLOSER */}
        <div className="bg-[#141414] text-white rounded-[20px] px-10 py-[46px] text-center mt-2" data-testid="section-closer">
          <h2 className="font-serif font-normal text-[clamp(28px,4vw,40px)] leading-[1.06] tracking-[-0.01em] text-white m-0 mb-2.5">
            Still deciding? <em className="italic text-[#f3b31f]">Run one property.</em>
          </h2>
          <p className="font-body text-white/[.72] text-[16.5px] max-w-[52ch] mx-auto m-0 mb-[22px] leading-relaxed">
            The fastest way to see what the record holds is to look. At <b className="text-white font-semibold">$29</b>, it's the cheapest diligence you'll do on a six-figure decision.
          </p>
          <CloserSearchBar variant="dark" page="faq" />
          <div className="font-body text-[13.5px] text-[#8b8a84] mt-4">
            Question we didn't answer, or something look off in a report?{" "}
            <a href="mailto:support@knowyourprop.com" className="text-white/[.72] underline" data-testid="link-support-email-closer">support@knowyourprop.com</a>
            {" "}— a real person reads it.
          </div>
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
