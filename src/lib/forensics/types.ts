/**
 * Finding / Evidence / Chart types, ported from ehiforensics' detectors/base.py
 * and model.py.
 *
 * The rule that matters most for anything downstream of this: detectors
 * produce facts. Nothing in this module or its callers may attach a claim
 * to a Finding that isn't a short, mechanically derived statement backed by
 * literal rows in `evidence`. That's what keeps a finding traceable back to
 * a line in the import instead of becoming an assertion someone has to take
 * on faith.
 */

export const PROVABLE = "provable";
export const STRONG = "strong";
export const SUPPORTING = "supporting";
export type Severity = typeof PROVABLE | typeof STRONG | typeof SUPPORTING;

export type HighlightRole = "primary" | "context" | "added";

export interface Evidence {
  source: string;
  selector: string;
  columns: string[];
  rows: string[][];
  /** key is `${rowIndex}:${colIndex}` */
  highlights?: Record<string, HighlightRole>;
  rowClasses?: Record<number, string>;
  caption?: string;
  footnote?: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  category: "alteration" | "late_entry" | "backdating" | "absence" | "contradiction" | "clinical";
  title: string;
  subtitle: string;
  facts: string[];
  evidence: Evidence[];
  demands?: string[];
  depositions?: Array<{ who: string; question: string }>;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// normalised chart entities
// ---------------------------------------------------------------------------

export interface Note {
  noteId: string;
  type: string;
  author: string;
  serviceLocal: Date | null;
  createdLocal: Date | null;
  filedLocal: Date | null;
  deletedLocal: Date | null;
  unsigned: boolean;
  csn: string;
}

export interface FlowsheetEntry {
  fsdId: string;
  measId: string;
  name: string;
  recordedLocal: Date | null;
  entryLocal: Date | null;
  enteredBy: string;
  takenBy: string;
  comment: string;
  template: string;
  editedLine: string;
  accepted: string;
  value: string | null;
}

export interface OrderContact {
  orderId: string;
  contactNumber: number;
  contactDate: string;
  contactType: string;
  labStatus: string;
  enteredLocal: Date | null;
  resultDttmLocal: Date | null;
  creator: string;
  pathologist: string;
}

export interface Order {
  orderId: string;
  description: string;
  displayName: string;
  kind: "proc" | "med";
  orderedLocal: Date | null;
  status: string;
  labStatus: string;
  priority: string;
  cancelReason: string;
  contacts: OrderContact[];
}

export interface Encounter {
  csn: string;
  contactDate: string;
  klass: string;
  arrivalLocal: Date | null;
  dischargeLocal: Date | null;
  blockType: string;
  producedWithContent: boolean;
}

export interface Chart {
  notes: Note[];
  flowsheet: FlowsheetEntry[];
  orders: Order[];
  encounters: Encounter[];
  /** raw passthrough rows, keyed by (lowercased, imported) table name */
  tables: Record<string, Record<string, unknown>[]>;
  presentTables: Set<string>;
  requestedButAbsent: string[];
}

// ---------------------------------------------------------------------------
// case configuration — same shape as ehiforensics' JSON config files
// ---------------------------------------------------------------------------

export interface ForensicsConfig {
  utc_offset_hours?: number;
  backfill_minutes?: number;
  session_min_rows?: number;
  priority_rows?: string[];
  backdate_hours?: number;
  encounter_start?: string;
  critical_window?: [string, string, string];
  order_gap_minutes?: number;
  timeline_events?: Array<[string, string]>;
  contradiction_pairs?: Array<[string, string, string, string]>;
}

export const DEFAULT_CONFIG: ForensicsConfig = {
  utc_offset_hours: -7,
  backfill_minutes: 90,
  session_min_rows: 3,
  priority_rows: [],
  backdate_hours: 2,
  order_gap_minutes: 20,
};
