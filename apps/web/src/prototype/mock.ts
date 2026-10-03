/**
 * PROTOTYPE — throwaway mock data shared by every UI variant under /prototype/ui.
 * Shapes follow the proposed data model in the plan (papers, cards, watchlist, tags).
 * Nothing here is real research; every paper below is invented for layout purposes.
 */

export type PubType =
  | "Meta-analysis"
  | "Systematic review"
  | "RCT"
  | "Observational"
  | "Animal"
  | "In vitro"
  | "Review"
  | "Preprint";

/** 1 = strongest evidence. Derived from pubTypes (EN-21). */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export const TIER_LABEL: Record<Tier, string> = {
  1: "Meta-analysis",
  2: "Systematic review",
  3: "RCT",
  4: "Observational",
  5: "Animal",
  6: "In vitro",
};

export type Flag = "animal-only" | "tiny-sample" | "industry-funded" | "preprint" | "retracted";

export const FLAG_LABEL: Record<Flag, string> = {
  "animal-only": "Animal only",
  "tiny-sample": "Tiny sample",
  "industry-funded": "Industry funded",
  preprint: "Preprint",
  retracted: "Retracted",
};

export type Unknown = "unknown";
export const UNKNOWN: Unknown = "unknown";

export type Direction = "positive" | "negative" | "null" | "mixed";

export interface StudyCard {
  design: string | Unknown;
  population: string | Unknown;
  sampleSize: number | Unknown;
  ingredient: string | Unknown;
  form: string | Unknown;
  dose: string | Unknown;
  duration: string | Unknown;
  primaryOutcome: string | Unknown;
  resultDirection: Direction | Unknown;
  result: string | Unknown;
  limitations: string[] | Unknown;
  funding: string | Unknown;
  /** 2–3 sentence plain-language summary (EN-16). */
  summary: string;
  /** One-line "so what for supplements" angle. */
  soWhat: string;
  status: "draft" | "verified";
  modelId: string;
  generatedAt: string;
  /** Supporting abstract quote per field (EN-17). Missing = no provenance found. */
  provenance: Partial<Record<keyof StudyCard, string>>;
}

export interface Paper {
  pmid: string;
  doi?: string;
  title: string;
  abstract: string;
  journal: string;
  /** ISO date */
  pubDate: string;
  pubTypes: PubType[];
  mesh: string[];
  isHuman: boolean;
  isAnimal: boolean;
  openAccess: boolean;
  sources: ("pubmed" | "europepmc")[];
  fetchedAt: string;
  citations?: number;
  /** Watchlist item ids this paper matched. */
  watchlist: string[];
  tier: Tier;
  flags: Flag[];
  starred: boolean;
  tags: string[];
  /** Arrived since last visit (EN-19). */
  isNew: boolean;
  /** Undefined = no card generated yet. */
  card?: StudyCard;
}

export interface WatchlistItem {
  id: string;
  term: string;
  kind: "ingredient" | "topic";
  /** Natural-language intent she typed (EN-25). */
  nlIntent: string;
  /** Generated PubMed query (EN-25). */
  query: string;
  lastRunAt: string;
  newCount: number;
  total: number;
}

export interface IngestionStatus {
  source: "PubMed" | "Europe PMC";
  state: "idle" | "running" | "done" | "error";
  fetched: number;
  total: number;
}

export const WATCHLIST: WatchlistItem[] = [
  {
    id: "mag",
    term: "Magnesium",
    kind: "ingredient",
    nlIntent: "magnesium for sleep in adults, human trials only",
    query:
      '("Magnesium"[Mesh] OR magnesium[tiab]) AND ("Sleep"[Mesh] OR sleep[tiab]) AND Humans[Mesh] AND (Clinical Trial[ptyp] OR Meta-Analysis[ptyp])',
    lastRunAt: "2026-10-03T07:40:00Z",
    newCount: 3,
    total: 41,
  },
  {
    id: "cre",
    term: "Creatine",
    kind: "ingredient",
    nlIntent: "creatine and cognition or brain, not sport performance",
    query:
      '("Creatine"[Mesh] OR creatine[tiab]) AND ("Cognition"[Mesh] OR cognit*[tiab] OR memory[tiab]) NOT (athlet*[tiab] OR "Athletic Performance"[Mesh])',
    lastRunAt: "2026-10-03T07:41:00Z",
    newCount: 2,
    total: 27,
  },
  {
    id: "ash",
    term: "Ashwagandha",
    kind: "ingredient",
    nlIntent: "ashwagandha stress, cortisol, anxiety",
    query:
      '("Withania"[Mesh] OR ashwagandha[tiab] OR "Withania somnifera"[tiab]) AND (cortisol[tiab] OR stress[tiab] OR anxiety[tiab])',
    lastRunAt: "2026-10-03T07:42:00Z",
    newCount: 1,
    total: 19,
  },
  {
    id: "o3",
    term: "Omega-3",
    kind: "ingredient",
    nlIntent: "omega-3 fish oil for depression or mood",
    query:
      '("Fatty Acids, Omega-3"[Mesh] OR omega-3[tiab] OR "fish oil"[tiab]) AND ("Depression"[Mesh] OR depress*[tiab] OR mood[tiab])',
    lastRunAt: "2026-10-02T21:10:00Z",
    newCount: 0,
    total: 58,
  },
  {
    id: "sleep",
    term: "Sleep quality",
    kind: "topic",
    nlIntent: "any supplement that improves sleep quality",
    query:
      '("Sleep Quality"[Mesh] OR "sleep quality"[tiab]) AND ("Dietary Supplements"[Mesh] OR supplement*[tiab])',
    lastRunAt: "2026-10-02T21:12:00Z",
    newCount: 1,
    total: 66,
  },
];

export const INGESTION: IngestionStatus[] = [
  { source: "PubMed", state: "done", fetched: 41, total: 41 },
  { source: "Europe PMC", state: "running", fetched: 23, total: 38 },
];

export const ALL_TAGS = ["post idea", "dose question", "needs full text", "classic", "skeptical"];

export const PUB_TYPES: PubType[] = [
  "Meta-analysis",
  "Systematic review",
  "RCT",
  "Observational",
  "Animal",
  "In vitro",
  "Review",
  "Preprint",
];

const MODEL = "gemma-3-27b-it @ openrouter";

export const PAPERS: Paper[] = [
  {
    pmid: "40911203",
    doi: "10.0000/mock.2026.001",
    title:
      "Magnesium glycinate versus placebo for sleep onset latency in adults with subclinical insomnia: a randomised, double-blind trial",
    abstract:
      "Background: Magnesium is widely marketed for sleep, but trials rarely specify the salt. Methods: We randomised 128 adults (mean age 41) with subclinical insomnia to 300 mg elemental magnesium as glycinate or placebo nightly for 8 weeks. Primary outcome was sleep onset latency by actigraphy. Results: Sleep onset latency fell by 11.4 minutes in the magnesium group versus 3.1 minutes with placebo (difference −8.3 min, 95% CI −13.9 to −2.7). Total sleep time did not differ. Adverse events were mild gastrointestinal symptoms. Limitations: Single centre; 8-week duration; actigraphy rather than polysomnography. Funding: University internal grant; no industry involvement.",
    journal: "Sleep Medicine",
    pubDate: "2026-09-18",
    pubTypes: ["RCT"],
    mesh: [
      "Magnesium",
      "Sleep Initiation and Maintenance Disorders",
      "Humans",
      "Adult",
      "Double-Blind Method",
    ],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-03T07:40:12Z",
    citations: 2,
    watchlist: ["mag", "sleep"],
    tier: 3,
    flags: [],
    starred: true,
    tags: ["post idea"],
    isNew: true,
    card: {
      design: "Randomised, double-blind, placebo-controlled trial",
      population: "Adults with subclinical insomnia, mean age 41",
      sampleSize: 128,
      ingredient: "Magnesium",
      form: "Glycinate",
      dose: "300 mg elemental, nightly",
      duration: "8 weeks",
      primaryOutcome: "Sleep onset latency (actigraphy)",
      resultDirection: "positive",
      result: "Onset latency fell 8.3 min more than placebo; total sleep time unchanged",
      limitations: ["Single centre", "8 weeks only", "Actigraphy, not polysomnography"],
      funding: "University internal grant; no industry involvement",
      summary:
        "128 adults who struggled to fall asleep took 300 mg of magnesium glycinate or a placebo for 8 weeks. The magnesium group fell asleep about 8 minutes faster than placebo, but did not sleep longer overall. Side effects were mild stomach upset.",
      soWhat:
        "Glycinate at 300 mg has one decent human trial for falling asleep faster. Not for sleeping longer.",
      status: "verified",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:52:00Z",
      provenance: {
        sampleSize: "We randomised 128 adults (mean age 41)",
        dose: "300 mg elemental magnesium as glycinate or placebo nightly",
        duration: "for 8 weeks",
        result:
          "Sleep onset latency fell by 11.4 minutes in the magnesium group versus 3.1 minutes with placebo",
        funding: "University internal grant; no industry involvement",
      },
    },
  },
  {
    pmid: "40898771",
    doi: "10.0000/mock.2026.002",
    title:
      "Oral magnesium supplementation and sleep outcomes: an updated systematic review and meta-analysis of randomised trials",
    abstract:
      "We searched MEDLINE, Embase and CENTRAL to June 2026 for randomised trials of oral magnesium versus placebo reporting sleep outcomes. Eleven trials (n = 1,042) were included. Pooled sleep onset latency improved by 9.7 minutes (95% CI 4.1–15.3; I² = 61%). Effects on total sleep time and sleep efficiency were small and imprecise. Most trials used magnesium oxide or citrate; dose ranged 250–500 mg elemental. Risk of bias was high in six trials. Certainty of evidence was low to moderate.",
    journal: "Nutrients",
    pubDate: "2026-08-30",
    pubTypes: ["Meta-analysis", "Systematic review"],
    mesh: ["Magnesium", "Sleep", "Humans", "Randomized Controlled Trials as Topic"],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-03T07:40:12Z",
    citations: 5,
    watchlist: ["mag", "sleep"],
    tier: 1,
    flags: [],
    starred: true,
    tags: ["classic"],
    isNew: true,
    card: {
      design: "Systematic review with meta-analysis of RCTs",
      population: "Adults in 11 randomised trials",
      sampleSize: 1042,
      ingredient: "Magnesium",
      form: "Mostly oxide or citrate",
      dose: "250–500 mg elemental",
      duration: UNKNOWN,
      primaryOutcome: "Sleep onset latency",
      resultDirection: "positive",
      result: "Pooled onset latency −9.7 min; total sleep time and efficiency unclear",
      limitations: [
        "High risk of bias in 6 of 11 trials",
        "Heterogeneity I² 61%",
        "Low–moderate certainty",
      ],
      funding: UNKNOWN,
      summary:
        "Pooling 11 trials with about a thousand people, magnesium helped people fall asleep roughly 10 minutes faster. It did not clearly change how long or how well they slept. Many of the trials were small or at risk of bias.",
      soWhat:
        "The best-available summary: modest effect on falling asleep, weak evidence for anything else.",
      status: "draft",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:53:00Z",
      provenance: {
        sampleSize: "Eleven trials (n = 1,042) were included",
        dose: "dose ranged 250–500 mg elemental",
        result: "Pooled sleep onset latency improved by 9.7 minutes (95% CI 4.1–15.3; I² = 61%)",
      },
    },
  },
  {
    pmid: "40887002",
    title:
      "Creatine monohydrate improves working memory under sleep deprivation in healthy young adults: a crossover trial",
    abstract:
      "Twenty healthy adults completed two 24-hour sleep-deprivation sessions after 7 days of 20 g/day creatine monohydrate or placebo in crossover design. Working memory (n-back) and reaction time were measured hourly. Creatine attenuated the decline in n-back accuracy (interaction p = 0.01) with no effect on simple reaction time. Supplement was donated by a sports-nutrition manufacturer, which had no role in analysis.",
    journal: "Psychopharmacology",
    pubDate: "2026-09-25",
    pubTypes: ["RCT"],
    mesh: ["Creatine", "Memory, Short-Term", "Sleep Deprivation", "Humans", "Cross-Over Studies"],
    isHuman: true,
    isAnimal: false,
    openAccess: false,
    sources: ["pubmed"],
    fetchedAt: "2026-10-03T07:41:03Z",
    citations: 0,
    watchlist: ["cre"],
    tier: 3,
    flags: ["tiny-sample", "industry-funded"],
    starred: false,
    tags: ["dose question"],
    isNew: true,
    card: {
      design: "Randomised crossover trial",
      population: "Healthy young adults under 24 h sleep deprivation",
      sampleSize: 20,
      ingredient: "Creatine",
      form: "Monohydrate",
      dose: "20 g/day (loading dose)",
      duration: "7 days",
      primaryOutcome: "Working memory (n-back accuracy)",
      resultDirection: "positive",
      result: "Smaller decline in n-back accuracy; no effect on reaction time",
      limitations: ["n = 20", "Extreme loading dose", "Sleep-deprivation model may not generalise"],
      funding: "Supplement donated by a sports-nutrition manufacturer",
      summary:
        "20 people took a high loading dose of creatine for a week and then stayed awake 24 hours. Their working memory held up better than on placebo, though reaction time did not change. The supplement was donated by a manufacturer.",
      soWhat:
        "Interesting, but 20 g/day for a week is not a normal protocol and the sample is tiny.",
      status: "draft",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:55:00Z",
      provenance: {
        sampleSize: "Twenty healthy adults completed two 24-hour sleep-deprivation sessions",
        dose: "7 days of 20 g/day creatine monohydrate or placebo",
        funding: "Supplement was donated by a sports-nutrition manufacturer",
      },
    },
  },
  {
    pmid: "40879410",
    title: "Creatine supplementation and cognitive function in older adults: a systematic review",
    abstract:
      "Systematic review of 9 trials (n = 412) of creatine supplementation in adults over 60 reporting cognitive outcomes. Five trials reported improvements in memory tasks; four reported no difference. Doses ranged from 3 to 20 g/day with durations of 1 to 24 weeks. No meta-analysis was possible due to outcome heterogeneity. Trials were generally small and short.",
    journal: "Ageing Research Reviews",
    pubDate: "2026-07-14",
    pubTypes: ["Systematic review"],
    mesh: ["Creatine", "Cognition", "Aged", "Humans"],
    isHuman: true,
    isAnimal: false,
    openAccess: false,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-03T07:41:03Z",
    citations: 11,
    watchlist: ["cre"],
    tier: 2,
    flags: [],
    starred: false,
    tags: [],
    isNew: false,
  },
  {
    pmid: "40871190",
    title:
      "Ashwagandha root extract (600 mg/day) reduces perceived stress and morning cortisol in chronically stressed adults: an 8-week randomised trial",
    abstract:
      "Sixty adults with high perceived stress were randomised to 600 mg/day standardised ashwagandha root extract or placebo for 8 weeks. Perceived Stress Scale score fell by 32% versus 14% (p < 0.01); morning serum cortisol fell 18% versus 4%. The extract was supplied by the manufacturer, who also funded the study.",
    journal: "Journal of Ethnopharmacology",
    pubDate: "2026-09-02",
    pubTypes: ["RCT"],
    mesh: ["Withania", "Stress, Psychological", "Hydrocortisone", "Humans", "Adult"],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-03T07:42:20Z",
    citations: 1,
    watchlist: ["ash"],
    tier: 3,
    flags: ["industry-funded"],
    starred: false,
    tags: ["skeptical"],
    isNew: true,
    card: {
      design: "Randomised, placebo-controlled trial",
      population: "Adults with high perceived stress",
      sampleSize: 60,
      ingredient: "Ashwagandha",
      form: "Standardised root extract",
      dose: "600 mg/day",
      duration: "8 weeks",
      primaryOutcome: "Perceived Stress Scale",
      resultDirection: "positive",
      result: "PSS −32% vs −14%; morning cortisol −18% vs −4%",
      limitations: ["Manufacturer funded and supplied extract", "n = 60", "Single site"],
      funding: "Manufacturer of the extract",
      summary:
        "60 stressed adults took 600 mg of ashwagandha root extract or placebo for 8 weeks. Stress scores and morning cortisol fell more with ashwagandha. The company that makes the extract paid for the study.",
      soWhat:
        "Consistent with earlier trials but funded by the maker. Flag the conflict if you post it.",
      status: "draft",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:56:00Z",
      provenance: {
        sampleSize: "Sixty adults with high perceived stress were randomised",
        dose: "600 mg/day standardised ashwagandha root extract",
        duration: "for 8 weeks",
        funding: "The extract was supplied by the manufacturer, who also funded the study",
      },
    },
  },
  {
    pmid: "40863301",
    title:
      "Withaferin A attenuates corticosterone-induced anxiety-like behaviour in mice via GABA-A modulation",
    abstract:
      "Male C57BL/6 mice received corticosterone for 21 days to induce anxiety-like behaviour, then withaferin A (5 or 10 mg/kg i.p.) or vehicle. Elevated plus maze open-arm time increased with withaferin A, and the effect was blocked by a GABA-A antagonist. Hippocampal GABA-A receptor expression increased.",
    journal: "Neuropharmacology",
    pubDate: "2026-08-19",
    pubTypes: ["Animal"],
    mesh: ["Withanolides", "Anxiety", "Mice", "Receptors, GABA-A", "Animals"],
    isHuman: false,
    isAnimal: true,
    openAccess: false,
    sources: ["pubmed"],
    fetchedAt: "2026-10-03T07:42:20Z",
    citations: 0,
    watchlist: ["ash"],
    tier: 5,
    flags: ["animal-only"],
    starred: false,
    tags: [],
    isNew: false,
    card: {
      design: "Animal study (mice)",
      population: "Male C57BL/6 mice with corticosterone-induced anxiety",
      sampleSize: UNKNOWN,
      ingredient: "Withaferin A (ashwagandha constituent)",
      form: "Isolated compound, injected",
      dose: "5 or 10 mg/kg intraperitoneal",
      duration: UNKNOWN,
      primaryOutcome: "Elevated plus maze open-arm time",
      resultDirection: "positive",
      result: "Less anxiety-like behaviour; effect blocked by GABA-A antagonist",
      limitations: ["Mice", "Injected isolated compound, not oral extract", "Mechanistic"],
      funding: UNKNOWN,
      summary:
        "Mice made anxious with stress hormone were calmer after injections of withaferin A, a compound found in ashwagandha. The effect seems to work through GABA receptors. Nothing here applies directly to people taking capsules.",
      soWhat: "Mechanism hint only. Do not cite as evidence that ashwagandha works in humans.",
      status: "draft",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:57:00Z",
      provenance: {
        dose: "withaferin A (5 or 10 mg/kg i.p.) or vehicle",
        result: "Elevated plus maze open-arm time increased with withaferin A",
      },
    },
  },
  {
    pmid: "40855120",
    title:
      "Omega-3 polyunsaturated fatty acids as adjunctive treatment for major depressive disorder: meta-analysis of 31 randomised trials",
    abstract:
      "Thirty-one randomised trials (n = 3,128) of omega-3 supplementation versus placebo in major depressive disorder were pooled. EPA-predominant formulations (≥60% EPA) at 1–2 g/day showed a standardised mean difference of −0.38 on depression scales; DHA-predominant formulations showed no effect. Heterogeneity was substantial and publication bias was likely.",
    journal: "JAMA Psychiatry",
    pubDate: "2026-06-11",
    pubTypes: ["Meta-analysis", "Systematic review"],
    mesh: ["Fatty Acids, Omega-3", "Depressive Disorder, Major", "Humans", "Eicosapentaenoic Acid"],
    isHuman: true,
    isAnimal: false,
    openAccess: false,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-02T21:10:40Z",
    citations: 24,
    watchlist: ["o3"],
    tier: 1,
    flags: [],
    starred: true,
    tags: ["classic", "post idea"],
    isNew: false,
    card: {
      design: "Meta-analysis of 31 RCTs",
      population: "Adults with major depressive disorder",
      sampleSize: 3128,
      ingredient: "Omega-3",
      form: "EPA-predominant (≥60% EPA) vs DHA-predominant",
      dose: "1–2 g/day",
      duration: UNKNOWN,
      primaryOutcome: "Depression rating scales",
      resultDirection: "mixed",
      result: "EPA-predominant SMD −0.38; DHA-predominant no effect",
      limitations: [
        "Substantial heterogeneity",
        "Likely publication bias",
        "Adjunctive to treatment, not standalone",
      ],
      funding: UNKNOWN,
      summary:
        "Across 31 trials, fish oil high in EPA gave a small to moderate improvement in depression scores when added to usual treatment. Fish oil high in DHA did not help. The trials varied a lot and some negative studies may be missing.",
      soWhat:
        "The form matters: EPA-heavy, 1–2 g/day, as an add-on. Generic fish oil is not the same claim.",
      status: "verified",
      modelId: MODEL,
      generatedAt: "2026-10-02T21:30:00Z",
      provenance: {
        sampleSize: "Thirty-one randomised trials (n = 3,128)",
        dose: "at 1–2 g/day",
        result:
          "showed a standardised mean difference of −0.38 on depression scales; DHA-predominant formulations showed no effect",
      },
    },
  },
  {
    pmid: "40841877",
    title:
      "Habitual fish intake and incident depression in a 12-year prospective cohort of 48,000 adults",
    abstract:
      "In a prospective cohort of 48,212 adults followed for a median of 12.1 years, each additional weekly serving of oily fish was associated with a 6% lower hazard of incident depression after adjustment for lifestyle and socioeconomic factors. Residual confounding cannot be excluded.",
    journal: "American Journal of Clinical Nutrition",
    pubDate: "2026-05-27",
    pubTypes: ["Observational"],
    mesh: ["Fishes", "Depression", "Cohort Studies", "Humans", "Diet"],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-02T21:10:40Z",
    citations: 8,
    watchlist: ["o3"],
    tier: 4,
    flags: [],
    starred: false,
    tags: [],
    isNew: false,
  },
  {
    pmid: "40833022",
    title:
      "Nightly magnesium L-threonate for sleep quality in adults with poor sleep: a 3-week randomised trial",
    abstract:
      "Eighty adults with poor sleep (PSQI > 5) were randomised to 1 g/day magnesium L-threonate or placebo for 3 weeks. PSQI improved by 2.1 points more with magnesium (p = 0.03). Daytime function scores also improved. The study was funded by the ingredient's patent holder, who supplied the product and participated in study design.",
    journal: "Sleep Health",
    pubDate: "2026-09-10",
    pubTypes: ["RCT"],
    mesh: ["Magnesium", "Sleep Quality", "Humans", "Adult"],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-03T07:40:12Z",
    citations: 0,
    watchlist: ["mag", "sleep"],
    tier: 3,
    flags: ["industry-funded"],
    starred: false,
    tags: ["skeptical", "dose question"],
    isNew: true,
    card: {
      design: "Randomised, placebo-controlled trial",
      population: "Adults with poor sleep (PSQI > 5)",
      sampleSize: 80,
      ingredient: "Magnesium",
      form: "L-threonate",
      dose: "1 g/day",
      duration: "3 weeks",
      primaryOutcome: "Pittsburgh Sleep Quality Index",
      resultDirection: "positive",
      result: "PSQI improved 2.1 points more than placebo",
      limitations: [
        "Patent holder funded, supplied product and co-designed the study",
        "3 weeks",
        "Self-reported outcome",
      ],
      funding: "Patent holder of the ingredient",
      summary:
        "80 poor sleepers took 1 g of magnesium L-threonate or placebo for 3 weeks. Sleep quality scores improved modestly more with the magnesium. The company that owns the patent paid for and helped design the study.",
      soWhat: "A single short, industry-designed trial. Treat the threonate hype with care.",
      status: "draft",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:58:00Z",
      provenance: {
        sampleSize: "Eighty adults with poor sleep (PSQI > 5) were randomised",
        dose: "1 g/day magnesium L-threonate or placebo",
        duration: "for 3 weeks",
        funding:
          "funded by the ingredient's patent holder, who supplied the product and participated in study design",
      },
    },
  },
  {
    pmid: "40828650",
    title:
      "Magnesium supplementation and sleep architecture in healthy adults: a sham-controlled polysomnography study",
    abstract:
      "RETRACTED. Twelve healthy adults underwent polysomnography after 2 weeks of magnesium citrate 400 mg or placebo. Slow-wave sleep increased by 14%. This article has been retracted at the request of the editor following concerns about data integrity.",
    journal: "Journal of Sleep Research",
    pubDate: "2025-11-04",
    pubTypes: ["RCT"],
    mesh: ["Magnesium", "Polysomnography", "Sleep, Slow-Wave", "Humans"],
    isHuman: true,
    isAnimal: false,
    openAccess: false,
    sources: ["pubmed"],
    fetchedAt: "2026-10-02T21:12:00Z",
    citations: 3,
    watchlist: ["mag", "sleep"],
    tier: 3,
    flags: ["retracted", "tiny-sample"],
    starred: false,
    tags: [],
    isNew: false,
  },
  {
    pmid: "40820111",
    title:
      "Creatine supplementation does not improve cognitive performance in healthy, well-nourished adults: a 12-week randomised trial",
    abstract:
      "Ninety-six healthy omnivorous adults received 5 g/day creatine monohydrate or placebo for 12 weeks. No differences were found on a composite cognitive battery, processing speed or memory. Plasma creatine increased as expected. The authors suggest cognitive benefits may be limited to creatine-depleted states such as vegetarian diets, ageing or sleep deprivation.",
    journal: "Nutritional Neuroscience",
    pubDate: "2026-08-05",
    pubTypes: ["RCT"],
    mesh: ["Creatine", "Cognition", "Healthy Volunteers", "Humans"],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-03T07:41:03Z",
    citations: 4,
    watchlist: ["cre"],
    tier: 3,
    flags: [],
    starred: false,
    tags: ["post idea"],
    isNew: false,
    card: {
      design: "Randomised, placebo-controlled trial",
      population: "Healthy omnivorous adults",
      sampleSize: 96,
      ingredient: "Creatine",
      form: "Monohydrate",
      dose: "5 g/day",
      duration: "12 weeks",
      primaryOutcome: "Composite cognitive battery",
      resultDirection: "null",
      result: "No difference on cognition, speed or memory",
      limitations: ["Healthy well-nourished population only"],
      funding: UNKNOWN,
      summary:
        "96 healthy meat-eating adults took a standard 5 g dose of creatine daily for 12 weeks. Their thinking, memory and processing speed did not improve compared with placebo. Benefits, if any, may be limited to people who are low in creatine to begin with.",
      soWhat: "Good null result: the 'creatine for brain' claim needs the depletion caveat.",
      status: "verified",
      modelId: MODEL,
      generatedAt: "2026-10-03T07:59:00Z",
      provenance: {
        sampleSize: "Ninety-six healthy omnivorous adults",
        dose: "5 g/day creatine monohydrate or placebo",
        duration: "for 12 weeks",
        result:
          "No differences were found on a composite cognitive battery, processing speed or memory",
      },
    },
  },
  {
    pmid: "40815555",
    title: "Ashwagandha extract inhibits cortisol synthesis in cultured adrenal cells",
    abstract:
      "H295R adrenocortical cells were exposed to ashwagandha root extract at 10–100 µg/mL for 48 hours. Cortisol secretion fell dose-dependently with reduced CYP11B1 expression. Cell viability was unaffected below 50 µg/mL.",
    journal: "Phytomedicine",
    pubDate: "2026-07-30",
    pubTypes: ["In vitro"],
    mesh: ["Withania", "Hydrocortisone", "Cell Line", "Adrenal Cortex"],
    isHuman: false,
    isAnimal: false,
    openAccess: false,
    sources: ["europepmc"],
    fetchedAt: "2026-10-03T07:42:20Z",
    citations: 0,
    watchlist: ["ash"],
    tier: 6,
    flags: [],
    starred: false,
    tags: [],
    isNew: false,
  },
  {
    pmid: "PPR-902211",
    doi: "10.0000/mock.2026.pre.013",
    title:
      "Tart cherry concentrate and melatonin co-supplementation for sleep in shift workers: a pilot randomised trial (preprint)",
    abstract:
      "Pilot trial of 34 rotating shift workers randomised to tart cherry concentrate 30 mL plus melatonin 2 mg, or placebo, nightly for 4 weeks. Self-reported sleep duration increased by 38 minutes. Not yet peer reviewed.",
    journal: "medRxiv",
    pubDate: "2026-09-28",
    pubTypes: ["Preprint", "RCT"],
    mesh: [],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["europepmc"],
    fetchedAt: "2026-10-03T07:43:00Z",
    watchlist: ["sleep"],
    tier: 3,
    flags: ["preprint", "tiny-sample"],
    starred: false,
    tags: [],
    isNew: true,
  },
  {
    pmid: "40802390",
    title:
      "Dietary magnesium intake and sleep duration: cross-sectional analysis of NHANES 2017–2022",
    abstract:
      "Among 9,804 US adults, higher dietary magnesium intake was associated with a lower prevalence of short sleep (< 6 h) after adjustment (OR 0.84 per 100 mg). The association was attenuated after adjustment for overall diet quality.",
    journal: "Journal of Nutrition",
    pubDate: "2026-04-16",
    pubTypes: ["Observational"],
    mesh: ["Magnesium", "Sleep", "Nutrition Surveys", "Humans", "Cross-Sectional Studies"],
    isHuman: true,
    isAnimal: false,
    openAccess: true,
    sources: ["pubmed", "europepmc"],
    fetchedAt: "2026-10-02T21:12:00Z",
    citations: 6,
    watchlist: ["mag", "sleep"],
    tier: 4,
    flags: [],
    starred: false,
    tags: [],
    isNew: false,
  },
];

export interface Filters {
  search: string;
  watchlist: string | null;
  pubTypes: PubType[];
  humanOnly: boolean;
  excludeAnimal: boolean;
  openAccessOnly: boolean;
  starredOnly: boolean;
  newOnly: boolean;
  hideRetracted: boolean;
  withCardOnly: boolean;
  tags: string[];
  /** ISO date lower bound, "" = none */
  since: string;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  watchlist: null,
  pubTypes: [],
  humanOnly: false,
  excludeAnimal: false,
  openAccessOnly: false,
  starredOnly: false,
  newOnly: false,
  hideRetracted: true,
  withCardOnly: false,
  tags: [],
  since: "",
};

export function applyFilters(papers: Paper[], f: Filters): Paper[] {
  const q = f.search.trim().toLowerCase();
  return papers.filter((p) => {
    if (q && !`${p.title} ${p.abstract} ${p.journal}`.toLowerCase().includes(q)) return false;
    if (f.watchlist && !p.watchlist.includes(f.watchlist)) return false;
    if (f.pubTypes.length && !f.pubTypes.some((t) => p.pubTypes.includes(t))) return false;
    if (f.humanOnly && !p.isHuman) return false;
    if (f.excludeAnimal && p.isAnimal) return false;
    if (f.openAccessOnly && !p.openAccess) return false;
    if (f.starredOnly && !p.starred) return false;
    if (f.newOnly && !p.isNew) return false;
    if (f.hideRetracted && p.flags.includes("retracted")) return false;
    if (f.withCardOnly && !p.card) return false;
    if (f.tags.length && !f.tags.some((t) => p.tags.includes(t))) return false;
    if (f.since && p.pubDate < f.since) return false;
    return true;
  });
}

export function sortPapers(papers: Paper[], by: "date" | "tier" | "citations"): Paper[] {
  const copy = [...papers];
  if (by === "date") copy.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  if (by === "tier") copy.sort((a, b) => a.tier - b.tier || b.pubDate.localeCompare(a.pubDate));
  if (by === "citations") copy.sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0));
  return copy;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Human-readable card field labels, in display order. */
export const CARD_FIELDS: { key: keyof StudyCard; label: string }[] = [
  { key: "design", label: "Design" },
  { key: "population", label: "Population" },
  { key: "sampleSize", label: "Sample size" },
  { key: "ingredient", label: "Ingredient" },
  { key: "form", label: "Form" },
  { key: "dose", label: "Dose" },
  { key: "duration", label: "Duration" },
  { key: "primaryOutcome", label: "Primary outcome" },
  { key: "result", label: "Result" },
  { key: "limitations", label: "Limitations" },
  { key: "funding", label: "Funding / COI" },
];

export function cardValue(card: StudyCard, key: keyof StudyCard): string {
  const v = card[key];
  if (v === UNKNOWN || v === undefined || v === null) return UNKNOWN;
  if (Array.isArray(v)) return v.join("; ");
  return String(v);
}
