/**
 * Which Clarity tables the forensic detectors look for, ported from
 * ehiforensics' catalog.py (trimmed to the tables the detectors below
 * actually use — see model.ts).
 */

export interface TableSpec {
  name: string;
  why: string;
  critical: boolean;
}

export const PRIORITY_TABLES: TableSpec[] = [
  {
    name: "HNO_INFO",
    why: "One row per note: creation instant, last-filed instant, service date, current author, delete instant. The backbone of every backdating and late-entry finding.",
    critical: true,
  },
  {
    name: "IP_FLWSHT_MEAS",
    why: "Every flowsheet entry. RECORDED_TIME is what the chart displays; ENTRY_TIME is when a human typed it — the single most productive column pair in the export.",
    critical: true,
  },
  { name: "IP_FLWSHT_REC", why: "Flowsheet record headers, links FSD_ID to the encounter.", critical: false },
  { name: "IP_DATA_STORE", why: "Inpatient data ids per encounter; reveals sibling encounters.", critical: false },
  {
    name: "ORDER_PROC",
    why: "Procedure/lab orders with entry instants and cancel reasons.",
    critical: true,
  },
  { name: "ORDER_MED", why: "Medication orders.", critical: true },
  {
    name: "ORDER_STATUS",
    why: "One row per contact on an order — the result-amendment audit trail: LAB_STATUS_C_NAME moves Final result -> Edited -> Edited Result - FINAL with an INSTANT_OF_ENTRY for each step.",
    critical: true,
  },
  { name: "ORDER_RESULTS", why: "Discrete result values.", critical: false },
  {
    name: "MAR_ADMIN_INFO",
    why: "TAKEN_TIME (charted as given) vs SAVED_TIME (typed), and the 'Canceled Entry' action.",
    critical: true,
  },
  { name: "OR_LOG", why: "The surgical log header.", critical: false },
  {
    name: "OR_LOG_EVENTS",
    why: "Wheels-in / incision / closure / wheels-out. Its absence is itself a finding: no intraoperative timeline was captured.",
    critical: true,
  },
  {
    name: "OB_HSB_DELIVERY",
    why: "Coded delivery summary: decision/birth/placenta instants, Apgars, delivering MD. Routinely contradicts the nursing narrative.",
    critical: false,
  },
  { name: "PAT_ENC", why: "Encounter index.", critical: false },
  {
    name: "PAT_ENC_2",
    why: "Every encounter for the patient — reveals sibling CSNs that were not produced.",
    critical: true,
  },
  {
    name: "PAT_ENC_HSP",
    why: "Hospital encounter: arrival/admission/discharge times, authentication status, delivery method fields.",
    critical: true,
  },
  { name: "PAT_ENC_DX", why: "Encounter diagnoses with date-noted.", critical: false },
  { name: "DOC_INFORMATION", why: "Scanned-document metadata: when a paper form entered the chart.", critical: false },
  { name: "PATIENT", why: "Demographics.", critical: false },
  { name: "CLARITY_SER", why: "Provider serial -> name lookup.", critical: false },
];

export const CRITICAL_ABSENCE_TABLES = new Set([
  "OR_LOG_EVENTS",
  "ACCESS_LOG",
  "IP_FLWSHT_MEAS_HX",
  "NOTE_ENC_INFO",
]);
