/**
 * Build a normalised Chart from whatever recognised Clarity tables are
 * present among the imported tables, ported from ehiforensics' model.py.
 *
 * Two rules carried over from the original: every timestamp is normalised to
 * local wall-clock exactly once, here — detectors never do timezone
 * arithmetic themselves — and every entity that can be traced to a source
 * row keeps enough to find it again.
 *
 * This build only ingests flat TSV/CSV files, so note version chains (which
 * ehiforensics assembles from the FHIR DocumentReference feed) are not
 * available here — Note.versions simply doesn't exist in this port, and the
 * note_alterations detector is not included for that reason. See the
 * Forensic Review panel's help text.
 */

import { runQueryAllRows } from "../duckdb";
import type { TableInfo } from "../types";
import { Clock, parseDt } from "./epictime";
import type { Chart, Encounter, FlowsheetEntry, Note, OrderContact } from "./types";
import { PRIORITY_TABLES } from "./catalog";

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const numOr0 = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function tableMap(tables: TableInfo[]): Map<string, string> {
  // Clarity name (upper) -> actual imported table name (lower, sanitized)
  const map = new Map<string, string>();
  const byLower = new Set(tables.map((t) => t.name));
  for (const spec of PRIORITY_TABLES) {
    const candidate = spec.name.toLowerCase();
    if (byLower.has(candidate)) map.set(spec.name, candidate);
  }
  return map;
}

async function fetchAll(tableName: string): Promise<Record<string, unknown>[]> {
  return runQueryAllRows(`SELECT * FROM "${tableName}"`);
}

export async function buildChart(
  tables: TableInfo[],
  cfg: { utcOffsetHours?: number } = {},
): Promise<Chart> {
  const clock = new Clock(cfg.utcOffsetHours ?? -7);
  const present = tableMap(tables);
  const L = (table: string, v: unknown) => clock.tableLocal(table, parseDt(v));

  const chart: Chart = {
    notes: [],
    flowsheet: [],
    orders: [],
    encounters: [],
    tables: {},
    presentTables: new Set(present.keys()),
    requestedButAbsent: PRIORITY_TABLES.map((t) => t.name).filter((n) => !present.has(n)),
  };

  // ---- notes -------------------------------------------------------------
  if (present.has("HNO_INFO")) {
    const rows = await fetchAll(present.get("HNO_INFO")!);
    for (const r of rows) {
      const noteId = str(r.NOTE_ID);
      if (!noteId) continue;
      const note: Note = {
        noteId,
        type: str(r.IP_NOTE_TYPE_C_NAME) || str(r.NOTE_TYPE_NOADD_C_NAME),
        author: str(r.CURRENT_AUTHOR_ID_NAME) || str(r.ENTRY_USER_ID_NAME),
        serviceLocal: L("HNO_INFO", r.DATE_OF_SERVIC_DTTM),
        createdLocal: L("HNO_INFO", r.CREATE_INSTANT_DTTM),
        filedLocal: L("HNO_INFO", r.LST_FILED_INST_DTTM),
        deletedLocal: L("HNO_INFO", r.DELETE_INSTANT_DTTM),
        unsigned: str(r.UNSIGNED_YN) === "Y",
        csn: str(r.PAT_ENC_CSN_ID),
      };
      chart.notes.push(note);
    }
  }

  // ---- flowsheet -----------------------------------------------------------
  if (present.has("IP_FLWSHT_MEAS")) {
    const rows = await fetchAll(present.get("IP_FLWSHT_MEAS")!);
    for (const r of rows) {
      const entry: FlowsheetEntry = {
        fsdId: str(r.FSD_ID),
        measId: str(r.FLO_MEAS_ID),
        name: str(r.FLO_MEAS_ID_DISP_NAME),
        recordedLocal: L("IP_FLWSHT_MEAS", r.RECORDED_TIME),
        entryLocal: L("IP_FLWSHT_MEAS", r.ENTRY_TIME),
        enteredBy: str(r.ENTRY_USER_ID_NAME),
        takenBy: str(r.TAKEN_USER_ID_NAME),
        comment: str(r.MEAS_COMMENT),
        template: str(r.FLT_ID_DISPLAY_NAME),
        editedLine: str(r.EDITED_LINE),
        accepted: str(r.ISACCEPTED_YN),
        value: r.MEAS_VALUE ? str(r.MEAS_VALUE) : null,
      };
      chart.flowsheet.push(entry);
    }
  }

  // ---- orders --------------------------------------------------------------
  const contactsByOrder = new Map<string, OrderContact[]>();
  if (present.has("ORDER_STATUS")) {
    const rows = await fetchAll(present.get("ORDER_STATUS")!);
    for (const r of rows) {
      const orderId = str(r.ORDER_ID);
      if (!orderId) continue;
      const contact: OrderContact = {
        orderId,
        contactNumber: numOr0(r.CONTACT_NUMBER),
        contactDate: str(r.CONTACT_DATE),
        contactType: str(r.CONTACT_TYPE_C_NAME),
        labStatus: str(r.LAB_STATUS_C_NAME),
        enteredLocal: L("ORDER_STATUS", r.INSTANT_OF_ENTRY),
        resultDttmLocal: L("ORDER_STATUS", r.RESULT_DTTM),
        creator: str(r.ORDER_CREATOR_ID_NAME),
        pathologist: str(r.LAB_PATHOLOGIST_ID_NAME),
      };
      if (!contactsByOrder.has(orderId)) contactsByOrder.set(orderId, []);
      contactsByOrder.get(orderId)!.push(contact);
    }
    for (const list of contactsByOrder.values()) list.sort((a, b) => a.contactNumber - b.contactNumber);
  }

  if (present.has("ORDER_PROC")) {
    const rows = await fetchAll(present.get("ORDER_PROC")!);
    for (const r of rows) {
      const orderId = str(r.ORDER_PROC_ID);
      chart.orders.push({
        orderId,
        description: str(r.DESCRIPTION),
        displayName: str(r.DISPLAY_NAME),
        kind: "proc",
        orderedLocal: L("ORDER_PROC", r.ORDER_INST ?? r.ORDER_TIME),
        status: str(r.ORDER_STATUS_C_NAME),
        labStatus: str(r.LAB_STATUS_C_NAME),
        priority: str(r.ORDER_PRIORITY_C_NAME),
        cancelReason: str(r.REASON_FOR_CANC_C_NAME),
        contacts: contactsByOrder.get(orderId) ?? [],
      });
    }
  }
  if (present.has("ORDER_MED")) {
    const rows = await fetchAll(present.get("ORDER_MED")!);
    for (const r of rows) {
      const orderId = str(r.ORDER_MED_ID);
      chart.orders.push({
        orderId,
        description: str(r.DESCRIPTION),
        displayName: str(r.DISPLAY_NAME),
        kind: "med",
        orderedLocal: L("ORDER_MED", r.ORDER_INST ?? r.ORDERING_DATE),
        status: str(r.RSN_FOR_DISCON_C_NAME),
        labStatus: "",
        priority: str(r.ORDER_PRIORITY_C_NAME),
        cancelReason: "",
        contacts: contactsByOrder.get(orderId) ?? [],
      });
    }
  }

  // ---- encounters ------------------------------------------------------
  const hspByCsn = new Map<string, Record<string, unknown>>();
  if (present.has("PAT_ENC_HSP")) {
    const rows = await fetchAll(present.get("PAT_ENC_HSP")!);
    for (const r of rows) hspByCsn.set(str(r.PAT_ENC_CSN_ID), r);
    chart.tables.PAT_ENC_HSP = rows;
  }
  if (present.has("PAT_ENC_2")) {
    const rows = await fetchAll(present.get("PAT_ENC_2")!);
    for (const r of rows) {
      const csn = str(r.PAT_ENC_CSN_ID);
      const h = hspByCsn.get(csn);
      const encounter: Encounter = {
        csn,
        contactDate: str(r.CONTACT_DATE),
        klass: str(r.ADT_PAT_CLASS_C_NAME) || str(h?.ADT_PAT_CLASS_C_NAME),
        arrivalLocal: L("PAT_ENC_HSP", h?.ADT_ARRIVAL_TIME),
        dischargeLocal: L("PAT_ENC_HSP", h?.HOSP_DISCH_TIME),
        blockType: str(r.OTHER_BLOCK_TYPE_C_NAME),
        producedWithContent: h !== undefined,
      };
      chart.encounters.push(encounter);
    }
  }

  // raw passthrough for field_contradictions / completeness
  for (const specName of ["ORDER_RESULTS", "OB_HSB_DELIVERY"]) {
    if (present.has(specName)) chart.tables[specName] = await fetchAll(present.get(specName)!);
  }

  return chart;
}
