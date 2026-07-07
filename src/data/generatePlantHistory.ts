import type {
  Database,
  EngineeringReviewRecord,
  Equipment,
  IssueType,
  KPISnapshot,
  MaintenanceAction,
  MaintenanceRecord,
  PMRecord,
  ShutdownDeferral,
  Trap,
} from '../types';
import { ENGINEERING_REVIEW_OUTCOMES } from '../types';
import { buildKPISnapshot } from '../utils/kpiSnapshots';
import { addDays, PM_INTERVAL_DAYS } from '../utils/logic';

const TEN_YEARS_DAYS = 365 * 10;
/** Hand-crafted recent scenarios in seedData start around this age. */
export const RECENT_SCENARIO_CUTOFF_DAYS = 920;

const TECHNICIANS = ['R. Alvarez', 'M. Chen', 'S. Patel', 'J. Okafor', 'T. Brooks', 'L. Martinez'];
const REVIEWERS = ['J. Rivera', 'K. Nguyen', 'D. Foster', 'A. Whitfield'];
const ISSUE_TYPES: IssueType[] = ['Blowing', 'Blocked', 'Leak', 'Cycling'];

const WORKING_NOTES = [
  'Normal discharge, operating correctly.',
  'Trap cycling normally, condensate removal verified.',
  'Discharge pattern acceptable, no live steam loss.',
  'Routine PM — trap performing within spec.',
  'Checked orifice and strainer — clear, normal operation.',
  'Thermal imaging normal, no external leaks.',
  'Audible check passed, intermittent discharge as expected.',
];

const ISSUE_NOTES: Record<IssueType, string[]> = {
  Blowing: [
    'Continuous live steam blow-through detected.',
    'Trap failing open — significant steam loss.',
    'Blow-through confirmed with ultrasonic test.',
    'Live steam visible at outlet — seat likely worn.',
  ],
  Blocked: [
    'No condensate discharge, downstream line cold.',
    'Trap body cold — orifice plugged or failed closed.',
    'Plugged discharge — strainer may need cleaning.',
    'Zero discharge under load; trap suspected blocked.',
  ],
  Leak: [
    'External body leak at bonnet flange.',
    'Gasket seepage noted during walkdown.',
    'Minor leak at connection — tag for follow-up.',
    'Visible weeping at trap body threads.',
  ],
  Cycling: [
    'Rapid open/close cycling — suspect worn internals.',
    'Short-cycle behavior, possible oversizing or wear.',
    'Intermittent rapid cycling under partial load.',
    'Trap hunting — discharge frequency abnormally high.',
  ],
};

const MAINTENANCE_TEMPLATES: Record<
  MaintenanceAction,
  { descriptions: string[]; parts: string[]; costRange: [number, number] | null }
> = {
  Maintenance: {
    descriptions: [
      'Cleaned strainer and flushed discharge line',
      'Cleared blockage in orifice and verified discharge',
      'Adjusted trap orientation and tightened fittings',
      'Lapped seat, cleaned internals, re-tested',
      'Replaced gasket and re-torqued bonnet',
    ],
    parts: ['', 'Gasket set', 'Strainer screen', 'Bonnet gasket'],
    costRange: null,
  },
  Repair: {
    descriptions: [
      'Replaced seat and disc assembly',
      'Repaired valve seat, replaced thermodynamic disc',
      'Seat and disc replacement after blow-through',
      'Rebuilt trap internals — new float and thermostatic element',
      'Re-torqued bonnet, replaced gasket and packing',
    ],
    parts: ['Seat/disc kit', 'Repair kit', 'Float assembly', 'Disc and seat kit', 'Gasket set'],
    costRange: [85, 420],
  },
  Replacement: {
    descriptions: [
      'Full trap replacement — chronic failures',
      'Replaced trap with new unit after repeated seat wear',
      'Trap swapped during turnaround — upgraded sizing',
      'Complete replacement; previous unit beyond economical repair',
    ],
    parts: [
      'Thermodynamic trap',
      'Inverted bucket trap',
      'Float & thermostatic trap',
      'Thermostatic trap assembly',
    ],
    costRange: [280, 950],
  },
};

const SHUTDOWN_NOTES = [
  'Boiler outage — PM deferred until unit returns to service.',
  'Turnaround window — inspection rescheduled post-startup.',
  'Equipment shutdown for catalyst change.',
  'Annual steam system outage — PM deferred per procedure.',
  'Crude unit down for exchanger work — trap inaccessible.',
  'Campus heating loop isolated for tunnel maintenance.',
  'Turbine gland seal work — area under clearance hold.',
  'Separator shutdown for internal inspection.',
];

/** Deterministic PRNG for reproducible demo data. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function tsFromDate(dateStr: string, hourJitter = 0): string {
  const d = new Date(`${dateStr}T08:00:00Z`);
  d.setUTCHours(d.getUTCHours() + hourJitter);
  return d.toISOString();
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function trapNum(trap: Trap): number {
  return parseInt(trap.tag.replace('ST-', ''), 10) || 1;
}

/** Trap reliability profile — drives issue frequency over the plant lifetime. */
function trapProfile(num: number): { issueRate: number; chronic: boolean } {
  const chronicTraps = new Set([1, 5, 8, 14, 20, 22, 25, 28, 30, 33]);
  if (chronicTraps.has(num)) return { issueRate: 0.22, chronic: true };
  if (num % 7 === 0) return { issueRate: 0.16, chronic: false };
  if (num % 3 === 0) return { issueRate: 0.1, chronic: false };
  return { issueRate: 0.06, chronic: false };
}

export interface GeneratedHistory {
  pm_records: PMRecord[];
  maintenance_records: MaintenanceRecord[];
  shutdown_deferrals: ShutdownDeferral[];
  engineering_reviews: EngineeringReviewRecord[];
}

export interface GenerateHistoryOptions {
  /** Trap IDs with no PM history (never inspected). */
  neverInspectedTrapIds?: Set<string>;
  /** Stop generating before this many days ago (hand-crafted recent zone). */
  cutoffDaysAgo?: number;
}

/**
 * Procedurally generate ~10 years of PM, maintenance, deferrals, and reviews
 * for a steam trap fleet. Output is merged with hand-crafted recent scenarios in seedData.
 */
export function generatePlantHistory(
  traps: Trap[],
  equipment: Equipment[],
  options: GenerateHistoryOptions = {},
): GeneratedHistory {
  const neverInspected = options.neverInspectedTrapIds ?? new Set<string>();
  const cutoffDays = options.cutoffDaysAgo ?? RECENT_SCENARIO_CUTOFF_DAYS;
  const cutoffDate = daysAgo(cutoffDays);
  const historyStart = daysAgo(TEN_YEARS_DAYS);

  const pm_records: PMRecord[] = [];
  const maintenance_records: MaintenanceRecord[] = [];
  const shutdown_deferrals: ShutdownDeferral[] = [];
  const engineering_reviews: EngineeringReviewRecord[] = [];

  let pmSeq = 1;
  let mntSeq = 1;
  let sdSeq = 1;
  let erSeq = 1;

  for (const trap of traps) {
    if (neverInspected.has(trap.id)) continue;

    const num = trapNum(trap);
    const rng = mulberry32(num * 9973 + 42);
    const profile = trapProfile(num);
    const installDate = trap.install_date && trap.install_date > historyStart ? trap.install_date : historyStart;

    let cursor = installDate;
    let openIssue: { type: IssueType; date: string } | null = null;
    let failuresSinceReview = 0;
    let lastReviewDate: string | null = null;
    const trapIssues: { date: string; type: IssueType }[] = [];

    while (cursor < cutoffDate) {
      const jitter = Math.floor(rng() * 14) - 7;
      const pmDate = addDays(cursor, PM_INTERVAL_DAYS + jitter);
      if (pmDate >= cutoffDate) break;

      const isIssue: boolean = openIssue !== null ? false : rng() < profile.issueRate;
      const status: 'Working' | 'Issue' = isIssue ? 'Issue' : 'Working';
      const issue_type: IssueType | null = isIssue ? pick(rng, ISSUE_TYPES) : null;
      const notes =
        isIssue && issue_type ? pick(rng, ISSUE_NOTES[issue_type]) : pick(rng, WORKING_NOTES);

      pm_records.push({
        id: `pm-gen-${String(pmSeq++).padStart(5, '0')}`,
        trap_id: trap.id,
        date: pmDate,
        status,
        issue_type,
        technician: pick(rng, TECHNICIANS),
        notes,
        created_at: tsFromDate(pmDate, Math.floor(rng() * 6)),
      });

      if (isIssue && issue_type) {
        openIssue = { type: issue_type, date: pmDate };
        trapIssues.push({ date: pmDate, type: issue_type });
        failuresSinceReview++;

        const maintDelay = 7 + Math.floor(rng() * 45);
        const maintDate = addDays(pmDate, maintDelay);
        if (maintDate < cutoffDate) {
          const roll = rng();
          let action: MaintenanceAction;
          if (roll < 0.55) action = 'Repair';
          else if (roll < 0.85) action = 'Maintenance';
          else action = 'Replacement';

          const tmpl = MAINTENANCE_TEMPLATES[action];
          const cost =
            tmpl.costRange === null
              ? null
              : Math.round(tmpl.costRange[0] + rng() * (tmpl.costRange[1] - tmpl.costRange[0]));

          maintenance_records.push({
            id: `mnt-gen-${String(mntSeq++).padStart(5, '0')}`,
            trap_id: trap.id,
            date: maintDate,
            action,
            technician: pick(rng, TECHNICIANS),
            description: pick(rng, tmpl.descriptions),
            parts_replaced: pick(rng, tmpl.parts),
            cost,
            notes:
              action === 'Replacement'
                ? 'Trap returned to service after replacement.'
                : 'Corrective action completed; trap re-inspected on next PM.',
            created_at: tsFromDate(maintDate, Math.floor(rng() * 4)),
          });

          if (action === 'Replacement' && rng() < 0.4) {
            const reviewDate = addDays(maintDate, 3 + Math.floor(rng() * 14));
            if (reviewDate < cutoffDate) {
              engineering_reviews.push({
                id: `er-gen-${String(erSeq++).padStart(5, '0')}`,
                trap_id: trap.id,
                review_date: reviewDate,
                reviewer: pick(rng, REVIEWERS),
                outcome: 'Trap replaced',
                replacement_manufacturer: trap.manufacturer,
                replacement_model: trap.model,
                replacement_notes: 'Like-for-like replacement per engineering recommendation.',
                notes: 'Chronic seat wear addressed with new trap during planned work.',
                created_at: tsFromDate(reviewDate),
              });
              lastReviewDate = reviewDate;
              failuresSinceReview = 0;
            }
          }

          openIssue = null;
        }
      } else if (openIssue) {
        openIssue = null;
      }

      if (failuresSinceReview >= 3 && profile.chronic) {
        const reviewDate = addDays(pmDate, 5 + Math.floor(rng() * 20));
        if (reviewDate < cutoffDate && (!lastReviewDate || daysBetween(lastReviewDate, reviewDate) > 180)) {
          const outcome = pick(rng, ENGINEERING_REVIEW_OUTCOMES);
          engineering_reviews.push({
            id: `er-gen-${String(erSeq++).padStart(5, '0')}`,
            trap_id: trap.id,
            review_date: reviewDate,
            reviewer: pick(rng, REVIEWERS),
            outcome,
            replacement_manufacturer: outcome === 'Trap replaced' ? trap.manufacturer : '',
            replacement_model: outcome === 'Trap replaced' ? trap.model : '',
            replacement_notes: outcome === 'Trap replaced' ? 'Upgraded to current plant standard.' : '',
            notes:
              outcome === 'Reviewed — continue monitoring'
                ? 'Seat wear pattern reviewed. Continue quarterly PM; escalate if issue returns within 90 days.'
                : `Engineering review after repeat ${trapIssues[trapIssues.length - 1]?.type ?? 'failure'} events.`,
            created_at: tsFromDate(reviewDate),
          });
          lastReviewDate = reviewDate;
          failuresSinceReview = 0;
        }
      }

      cursor = pmDate;
    }
  }

  const trapsByEquipment = new Map<string, Trap[]>();
  for (const t of traps) {
    const list = trapsByEquipment.get(t.equipment_id) ?? [];
    list.push(t);
    trapsByEquipment.set(t.equipment_id, list);
  }

  for (const eq of equipment) {
    const eqTraps = trapsByEquipment.get(eq.id) ?? [];
    if (eqTraps.length === 0) continue;

    const rng = mulberry32(eq.name.length * 131 + eqTraps.length);
    const deferralCount = 6 + Math.floor(rng() * 6);

    for (let i = 0; i < deferralCount; i++) {
      const yearsBack = rng() * 9.5 + 0.3;
      const daysBack = Math.floor(yearsBack * 365);
      if (daysBack < 30 || daysBack > cutoffDays - 30) continue;

      const trap = pick(rng, eqTraps);
      if (neverInspected.has(trap.id)) continue;

      const recorded = daysAgo(daysBack);
      const pmDue = addDays(recorded, -Math.floor(rng() * 10) + 3);

      shutdown_deferrals.push({
        id: `sd-gen-${String(sdSeq++).padStart(5, '0')}`,
        trap_id: trap.id,
        recorded_date: recorded,
        pm_due_date: pmDue,
        technician: pick(rng, TECHNICIANS),
        notes: `${eq.name} — ${pick(rng, SHUTDOWN_NOTES)}`,
        created_at: tsFromDate(recorded),
      });
    }
  }

  shutdown_deferrals.sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));

  return { pm_records, maintenance_records, shutdown_deferrals, engineering_reviews };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Filter records to those on or before a snapshot date for point-in-time KPIs. */
function dataAsOf(data: Database, asOfDate: string): Database {
  return {
    ...data,
    pm_records: data.pm_records.filter((r) => r.date <= asOfDate),
    maintenance_records: (data.maintenance_records ?? []).filter((r) => r.date <= asOfDate),
    shutdown_deferrals: (data.shutdown_deferrals ?? []).filter((r) => r.recorded_date <= asOfDate),
    engineering_reviews: (data.engineering_reviews ?? []).filter((r) => r.review_date <= asOfDate),
  };
}

/**
 * Build monthly KPI snapshots across the requested history window.
 * Uses actual PM data replayed at each month-end for realistic trends.
 */
export function buildMonthlyKPISnapshots(
  data: Database,
  years = 10,
  intervalMonths = 1,
): KPISnapshot[] {
  const snaps: KPISnapshot[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const totalMonths = years * 12;

  for (let m = totalMonths; m >= intervalMonths; m -= intervalMonths) {
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() - m);
    const date = d.toISOString().slice(0, 10);
    const asOf = dataAsOf(data, date);
    const snap = buildKPISnapshot(asOf, date);
    snaps.push({ ...snap, id: `kpi-hist-${date}`, created_at: tsFromDate(date, 12) });
  }

  return snaps;
}

/** Reassign sequential IDs after merging generated and hand-crafted records. */
export function reindexHistoryIds(data: Database): Database {
  const sortByDate = <T extends { date: string; created_at: string }>(a: T, b: T) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.created_at.localeCompare(b.created_at);
  };

  const pm_records = [...data.pm_records].sort(sortByDate).map((r, i) => ({
    ...r,
    id: `pm-${String(i + 1).padStart(5, '0')}`,
  }));

  const maintenance_records = [...(data.maintenance_records ?? [])].sort(sortByDate).map((r, i) => ({
    ...r,
    id: `mnt-${String(i + 1).padStart(5, '0')}`,
  }));

  const shutdown_deferrals = [...(data.shutdown_deferrals ?? [])]
    .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
    .map((r, i) => ({
      ...r,
      id: `sd-${String(i + 1).padStart(4, '0')}`,
    }));

  const engineering_reviews = [...(data.engineering_reviews ?? [])]
    .sort((a, b) => a.review_date.localeCompare(b.review_date))
    .map((r, i) => ({
      ...r,
      id: `er-${String(i + 1).padStart(4, '0')}`,
    }));

  return { ...data, pm_records, maintenance_records, shutdown_deferrals, engineering_reviews };
}
