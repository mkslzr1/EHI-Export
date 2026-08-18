/**
 * The detector library, ported from ehiforensics' detectors/rules.py.
 *
 * Six of the original seven families are ported — everything that runs off
 * the flat Clarity TSV tables this app can actually ingest:
 *
 *   1. documentation_sessions  charted-time vs typed-time divergence, clustered
 *   2. note_backdating         service date before the encounter, or after creation
 *   3. result_amendments       a finalised result reopened and re-finalised
 *   4. order_silence           intervals with no orders during a configured window
 *   5. completeness            tables missing from this import, withheld values,
 *                              stripped note metadata, sibling encounters
 *   6. field_contradictions    two fields on one row that disagree
 *
 * note_alterations (diffing a note's text across filed versions) is not
 * ported: it depends on the FHIR DocumentReference feed, which this app does
 * not parse. See the Forensic Review panel's help text.
 *
 * Same design rule as the original: detectors produce facts, short and
 * mechanically derived, each backed by literal evidence rows. Nothing here
 * infers intent or writes a conclusion a reader couldn't check against the
 * evidence table right below it.
 */

import { CRITICAL_ABSENCE_TABLES, PRIORITY_TABLES } from "./catalog";
import { dateOnly, diffMs, dur, fmt, parseDt } from "./epictime";
import type {
  Chart,
  Evidence,
  Finding,
  FlowsheetEntry,
  ForensicsConfig,
  HighlightRole,
} from "./types";
import { PROVABLE, STRONG, SUPPORTING } from "./types";

function parseConfigDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const withZ = /Z$|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ==========================================================================
// 1. documentation sessions (flowsheet backfill, clustered)
// ==========================================================================

function documentationSessions(chart: Chart, cfg: ForensicsConfig): Finding[] {
  const thresholdMs = (cfg.backfill_minutes ?? 90) * 60_000;
  const minRows = cfg.session_min_rows ?? 3;
  const priority = new Set((cfg.priority_rows ?? []).map((s) => s.toLowerCase()));
  const out: Finding[] = [];

  const late = chart.flowsheet.filter(
    (f) => f.recordedLocal && f.entryLocal && (diffMs(f.entryLocal, f.recordedLocal) ?? 0) >= thresholdMs,
  );

  if (late.length > 0) {
    const sessions = new Map<string, FlowsheetEntry[]>();
    for (const f of late) {
      const key = `${f.entryLocal!.getTime()}|${f.enteredBy}`;
      if (!sessions.has(key)) sessions.set(key, []);
      sessions.get(key)!.push(f);
    }

    const ordered = [...sessions.values()].sort(
      (a, b) => a[0].entryLocal!.getTime() - b[0].entryLocal!.getTime(),
    );

    for (const entries of ordered) {
      const when = entries[0].entryLocal!;
      const who = entries[0].enteredBy;
      const names = [...new Set(entries.map((e) => e.name))].sort();
      const namesLower = new Set(names.map((n) => n.toLowerCase()));
      const priorityHit = [...priority].some((p) => namesLower.has(p));
      if (entries.length < minRows && !priorityHit) continue;

      entries.sort(
        (a, b) => a.recordedLocal!.getTime() - b.recordedLocal!.getTime() || a.name.localeCompare(b.name),
      );
      let coversFrom = entries[0].recordedLocal!;
      let coversTo = entries[0].recordedLocal!;
      let worst = entries[0];
      for (const e of entries) {
        if (e.recordedLocal! < coversFrom) coversFrom = e.recordedLocal!;
        if (e.recordedLocal! > coversTo) coversTo = e.recordedLocal!;
        if ((diffMs(e.entryLocal, e.recordedLocal) ?? 0) > (diffMs(worst.entryLocal, worst.recordedLocal) ?? 0)) worst = e;
      }
      const hits = [...priority].filter((p) => namesLower.has(p)).sort();

      const facts: string[] = [
        `At ${fmt(when)}, ${who || "one user"} entered ${entries.length} flowsheet rows covering charted times ${fmt(coversFrom)} to ${fmt(coversTo)}.`,
        `Rows entered in this session: ${names.join(", ")}.`,
        `Largest lag in the session: ${dur(diffMs(worst.entryLocal, worst.recordedLocal))} ('${worst.name}' charted to ${fmt(worst.recordedLocal)}).`,
      ];
      if (hits.length) {
        facts.push(`Rows flagged as clinically load-bearing for this matter were part of the session: ${hits.join(", ")}.`);
      }
      const distinctTimes = [...new Set(entries.map((e) => e.recordedLocal!.getTime()))].sort((a, b) => a - b);
      if (distinctTimes.length > 1) {
        facts.push(
          `The session spans ${distinctTimes.length} distinct charted times (${distinctTimes
            .map((t) => fmt(new Date(t)).split(" ")[1])
            .join(", ")}), so it is not a single delayed entry but a set of separate assessments recorded together.`,
        );
      }
      if (entries.every((e) => e.value === null)) {
        facts.push("The production contains no measurement-value column, so what was charted at each of these times was not disclosed.");
      }

      const rows: string[][] = [];
      const highlights: Record<string, HighlightRole> = {};
      const rowClasses: Record<number, string> = {};
      entries.forEach((e, i) => {
        rows.push([e.name, fmt(e.recordedLocal), fmt(e.entryLocal), dur(diffMs(e.entryLocal, e.recordedLocal)), e.enteredBy, e.template]);
        rowClasses[i] = "flag";
        highlights[`${i}:1`] = "context";
        highlights[`${i}:2`] = "primary";
        highlights[`${i}:3`] = "primary";
      });
      const evidence: Evidence[] = [
        {
          source: "EHITables/IP_FLWSHT_MEAS",
          selector: `ENTRY_TIME = ${fmt(when)} and ENTRY_USER_ID_NAME = '${who}'`,
          columns: ["Row", "Recorded (charted to)", "Entered (typed)", "Lag", "Entered by", "Template"],
          rows,
          highlights,
          rowClasses,
          caption: `${entries.length} rows entered in one session at ${fmt(when)}.`,
          footnote:
            "RECORDED_TIME is the clinical time the chart displays. ENTRY_TIME is when a human typed it. The difference is not visible anywhere in the printed chart.",
        },
      ];

      for (const name of names.filter((n) => namesLower.has(n.toLowerCase()) && priority.has(n.toLowerCase()))) {
        const hist = chart.flowsheet
          .filter((f) => f.name === name && f.recordedLocal && f.entryLocal)
          .sort((a, b) => a.recordedLocal!.getTime() - b.recordedLocal!.getTime());
        const hrows: string[][] = [];
        const hHighlights: Record<string, HighlightRole> = {};
        const hRowClasses: Record<number, string> = {};
        hist.forEach((e, i) => {
          const big = (diffMs(e.entryLocal, e.recordedLocal) ?? 0) >= thresholdMs;
          hrows.push([e.name, fmt(e.recordedLocal), fmt(e.entryLocal), dur(diffMs(e.entryLocal, e.recordedLocal)), e.enteredBy, e.accepted]);
          if (big) {
            hRowClasses[i] = "flag";
            hHighlights[`${i}:1`] = "context";
            hHighlights[`${i}:2`] = "primary";
            hHighlights[`${i}:3`] = "primary";
          }
        });
        evidence.push({
          source: "EHITables/IP_FLWSHT_MEAS",
          selector: `FLO_MEAS_ID_DISP_NAME = '${name}' — complete history`,
          columns: ["Row", "Recorded (charted to)", "Entered (typed)", "Lag", "Entered by", "Accepted"],
          rows: hrows,
          highlights: hHighlights,
          rowClasses: hRowClasses,
          caption: `All ${hist.length} '${name}' entries for the encounter.`,
          footnote: "Shown in full so the flagged session can be compared with how the same row was charted at every other point in the stay.",
        });
        const lateInHist = hist.filter((f) => (diffMs(f.entryLocal, f.recordedLocal) ?? 0) >= thresholdMs).length;
        facts.push(
          `'${name}' has ${hist.length} entries across the whole encounter; ${lateInHist} of them were typed late, and ${
            entries.filter((e) => e.name === name).length
          } of those belong to this session.`,
        );
      }

      const severity = entries.length >= minRows && distinctTimes.length > 1 ? PROVABLE : STRONG;
      out.push({
        id: "",
        severity,
        category: "late_entry",
        title: `${entries.length} flowsheet rows covering ${fmt(coversFrom)}–${coversTo
          .toISOString()
          .slice(11, 16)} were all typed at ${fmt(when)}`,
        subtitle: `IP_FLWSHT_MEAS · one documentation session · ${who}`,
        facts,
        evidence,
        demands: ["The Epic flowsheet audit for this session, including prior values and the chart-access log for the entering user across the window."],
        depositions: [
          {
            who,
            question: `Walk me through ${fmt(when)}. What was in front of you when you entered the ${fmt(coversFrom)} to ${coversTo
              .toISOString()
              .slice(11, 16)} assessments?`,
          },
        ],
        tags: ["flowsheet", "late_entry", "session"],
      });
    }
  }

  const edited = chart.flowsheet.filter((f) => f.editedLine);
  if (edited.length) {
    const rows = edited.map((f) => [f.name, f.comment, fmt(f.recordedLocal), fmt(f.entryLocal), f.editedLine, f.enteredBy]);
    const highlights: Record<string, HighlightRole> = {};
    rows.forEach((_, i) => {
      highlights[`${i}:4`] = "primary";
    });
    out.push({
      id: "",
      severity: STRONG,
      category: "alteration",
      title: "Flowsheet rows carry Epic's marker that they were modified after entry",
      subtitle: "IP_FLWSHT_MEAS · EDITED_LINE populated",
      facts: [
        `${edited.length} flowsheet rows carry a non-empty EDITED_LINE value, Epic's indication that the row was changed after it was first saved.`,
        ...edited
          .slice(0, 10)
          .map(
            (f) =>
              `'${f.name}'${f.comment ? ` (comment: ${f.comment})` : ""} charted to ${fmt(f.recordedLocal)}, typed ${fmt(f.entryLocal)}, entered by ${f.enteredBy}.`,
          ),
      ],
      evidence: [
        {
          source: "EHITables/IP_FLWSHT_MEAS",
          selector: "EDITED_LINE is not null",
          columns: ["Row", "Comment", "Recorded", "Entered", "Edited line", "Entered by"],
          rows,
          highlights,
          footnote: "EDITED_LINE identifies the specific line within the row that was revised.",
        },
      ],
      demands: ["Prior values for every flowsheet row carrying EDITED_LINE."],
      tags: ["flowsheet", "alteration"],
    });
  }

  return out;
}

// ==========================================================================
// 2. note backdating
// ==========================================================================

function noteBackdating(chart: Chart, cfg: ForensicsConfig): Finding[] {
  let arrival = parseConfigDate(cfg.encounter_start);
  if (!arrival) {
    const arrivals = chart.encounters.map((e) => e.arrivalLocal).filter((d): d is Date => d !== null);
    if (arrivals.length) arrival = arrivals.reduce((min, d) => (d < min ? d : min));
  }
  const gapMs = (cfg.backdate_hours ?? 2) * 3_600_000;

  const flagged = chart.notes
    .filter((n) => n.serviceLocal && n.createdLocal)
    .map((n) => {
      const lag = n.createdLocal!.getTime() - n.serviceLocal!.getTime();
      const preArrival = !!arrival && n.serviceLocal!.getTime() < arrival.getTime();
      return { note: n, lag, preArrival };
    })
    .filter((f) => f.lag >= gapMs || f.preArrival);

  if (!flagged.length) return [];
  flagged.sort((a, b) => b.lag - a.lag);

  const rows: string[][] = [];
  const highlights: Record<string, HighlightRole> = {};
  const rowClasses: Record<number, string> = {};
  flagged.forEach(({ note: n, lag, preArrival }, i) => {
    rows.push([n.noteId, n.type, n.author || "—", fmt(n.serviceLocal), fmt(n.createdLocal), dur(lag), fmt(n.filedLocal)]);
    if (preArrival || lag >= 6 * 3_600_000) {
      rowClasses[i] = "flag";
      highlights[`${i}:3`] = "context";
      highlights[`${i}:4`] = "primary";
      highlights[`${i}:5`] = "primary";
    }
  });

  const gapHours = cfg.backdate_hours ?? 2;
  const facts: string[] = [`${flagged.length} notes carry a service date more than ${gapHours} hours before the moment they were created.`];
  if (arrival) {
    const pre = flagged.filter((f) => f.preArrival);
    if (pre.length) {
      facts.push(
        `${pre.length} of them are dated before the patient arrived (${fmt(arrival)}): ${pre
          .slice(0, 5)
          .map((f) => `${f.note.type} HNO ${f.note.noteId} dated ${fmt(f.note.serviceLocal)}`)
          .join("; ")}.`,
      );
    }
  }
  const worst = flagged[0];
  facts.push(
    `Largest divergence: ${worst.note.type} (HNO ${worst.note.noteId}) is dated ${fmt(worst.note.serviceLocal)} and was created ${fmt(
      worst.note.createdLocal,
    )} — ${dur(worst.lag)} later${worst.note.filedLocal ? `, then filed ${fmt(worst.note.filedLocal)}.` : "."}`,
  );

  return [
    {
      id: "",
      severity: STRONG,
      category: "backdating",
      title: "Notes are dated to times materially before they were written",
      subtitle: "EHITables/HNO_INFO · DATE_OF_SERVIC_DTTM against CREATE_INSTANT_DTTM",
      facts,
      evidence: [
        {
          source: "EHITables/HNO_INFO",
          selector: "notes where CREATE_INSTANT_DTTM − DATE_OF_SERVIC_DTTM exceeds threshold",
          columns: ["Note ID", "Type", "Author", "Service date (local)", "Created (local)", "Lag", "Filed/signed (local)"],
          rows,
          highlights,
          rowClasses,
          footnote:
            "HNO_INFO stores instants in UTC; the local conversion is applied. The service date is what the chart displays and what determines where the note sorts in the record.",
        },
      ],
      demands: ["Epic revision history for each backdated note, showing when each field was set and by whom."],
      depositions: [
        {
          who: worst.note.author || "the author",
          question: `HNO ${worst.note.noteId} is dated ${fmt(worst.note.serviceLocal)} but was not created until ${fmt(worst.note.createdLocal)}. Explain the date.`,
        },
      ],
      tags: ["note", "backdating"],
    },
  ];
}

// ==========================================================================
// 3. result amendments
// ==========================================================================

const FINAL_STATUSES = new Set(["final result", "final"]);
const EDITED_STATUSES = new Set(["edited", "edited result - final", "corrected", "amended"]);

function resultAmendments(chart: Chart): Finding[] {
  const out: Finding[] = [];
  for (const order of chart.orders) {
    if (order.contacts.length < 2) continue;
    const statuses = order.contacts.map((c) => c.labStatus.toLowerCase()).filter(Boolean);
    if (!statuses.some((s) => FINAL_STATUSES.has(s))) continue;
    if (!statuses.some((s) => EDITED_STATUSES.has(s))) continue;

    const firstFinal = order.contacts.find((c) => FINAL_STATUSES.has(c.labStatus.toLowerCase()))!;
    const last = order.contacts[order.contacts.length - 1];

    const rows: string[][] = [];
    const highlights: Record<string, HighlightRole> = {};
    const rowClasses: Record<number, string> = {};
    order.contacts.forEach((c, i) => {
      rows.push([
        String(Math.trunc(c.contactNumber)),
        dateOnly(c.contactDate),
        c.contactType,
        c.labStatus,
        fmt(c.enteredLocal),
        fmt(c.resultDttmLocal),
        c.pathologist || c.creator,
      ]);
      if (EDITED_STATUSES.has(c.labStatus.toLowerCase())) {
        rowClasses[i] = "flag";
        highlights[`${i}:3`] = "context";
        highlights[`${i}:4`] = "primary";
      }
    });

    const facts: string[] = [
      `Order ${order.orderId} (${order.description || order.displayName}) has ${order.contacts.length} stored filings.`,
      `It reached '${firstFinal.labStatus}' at ${fmt(firstFinal.enteredLocal)}${
        firstFinal.resultDttmLocal ? ` with a result instant of ${fmt(firstFinal.resultDttmLocal)}.` : "."
      }`,
      `It was subsequently refiled as '${last.labStatus}' at ${fmt(last.enteredLocal)}${
        last.resultDttmLocal ? `, carrying a new result instant of ${fmt(last.resultDttmLocal)}.` : "."
      }`,
    ];
    if (firstFinal.enteredLocal && last.enteredLocal) {
      facts.push(`Elapsed time between the original sign-out and the amendment: ${dur(diffMs(last.enteredLocal, firstFinal.enteredLocal))}.`);
    }

    out.push({
      id: "",
      severity: STRONG,
      category: "alteration",
      title: "A finalised result was reopened and re-finalised",
      subtitle: `Order ${order.orderId} · ${order.description || order.displayName}`,
      facts,
      evidence: [
        {
          source: "EHITables/ORDER_STATUS",
          selector: `ORDER_ID = ${order.orderId} · every stored contact`,
          columns: ["Contact #", "Contact date", "Contact type", "Lab status", "Entered (local)", "Result instant", "Pathologist / creator"],
          rows,
          highlights,
          rowClasses,
          caption: "One row per filing against the order.",
          footnote: "Epic writes 'Edited Result - FINAL' only when a result that had already been finalised is changed.",
        },
      ],
      demands: [
        `The report for order ${order.orderId} exactly as released before amendment; who requested the amendment and when; all correspondence between the original sign-out and the amendment; the laboratory information system's result-version audit.`,
      ],
      depositions: [
        {
          who: last.pathologist || last.creator || "the resulting provider",
          question: `You signed this out at ${fmt(firstFinal.enteredLocal)}. You refiled it at ${fmt(
            last.enteredLocal,
          )}. What happened in between? Who contacted you? Did you re-examine the material?`,
        },
      ],
      tags: ["result", "alteration", order.description],
    });
  }
  return out;
}

// ==========================================================================
// 4. order silence
// ==========================================================================

function orderSilence(chart: Chart, cfg: ForensicsConfig): Finding[] {
  const win = cfg.critical_window;
  if (!win) return [];
  const [startStr, endStr, label] = win;
  const start = parseConfigDate(startStr);
  const end = parseConfigDate(endStr);
  if (!start || !end) return [];
  const events = (cfg.timeline_events ?? []).map(([t, l]) => ({ t: parseConfigDate(t), l }));

  const inside = chart.orders
    .filter((o) => o.orderedLocal && o.orderedLocal.getTime() >= start.getTime() && o.orderedLocal.getTime() <= end.getTime())
    .sort((a, b) => a.orderedLocal!.getTime() - b.orderedLocal!.getTime());
  if (inside.length < 2) return [];

  let maxGap = -Infinity;
  let gapIndex = -1;
  for (let i = 0; i < inside.length - 1; i++) {
    const gap = inside[i + 1].orderedLocal!.getTime() - inside[i].orderedLocal!.getTime();
    if (gap > maxGap) {
      maxGap = gap;
      gapIndex = i;
    }
  }
  const gapMinutes = cfg.order_gap_minutes ?? 20;
  if (maxGap < gapMinutes * 60_000) return [];

  const before = inside[gapIndex];
  const after = inside[gapIndex + 1];

  const rows: string[][] = [];
  const highlights: Record<string, HighlightRole> = {};
  const rowClasses: Record<number, string> = {};
  inside.forEach((o, i) => {
    rows.push([o.kind.toUpperCase(), o.orderId, (o.description || o.displayName).slice(0, 58), fmt(o.orderedLocal, true), o.status || o.priority]);
    highlights[`${i}:3`] = "primary";
  });
  rowClasses[gapIndex] = "gap-after";

  const covered = events
    .filter((e) => e.t && e.t.getTime() >= before.orderedLocal!.getTime() && e.t.getTime() <= after.orderedLocal!.getTime())
    .map((e) => `${fmt(e.t)} ${e.l}`);

  return [
    {
      id: "",
      severity: STRONG,
      category: "absence",
      title: `No order of any kind was entered for ${dur(maxGap)} across ${label}`,
      subtitle: "ORDER_PROC + ORDER_MED · merged by entry instant",
      facts: [
        `Between ${fmt(before.orderedLocal, true)} and ${fmt(after.orderedLocal, true)} — ${dur(maxGap)} — no order was entered into the chart.`,
        `The order immediately before the gap was '${before.description || before.displayName}'.`,
        `The order immediately after the gap was '${after.description || after.displayName}'.`,
        ...(covered.length ? [`Events falling inside the gap: ${covered.join("; ")}.`] : []),
      ],
      evidence: [
        {
          source: "EHITables/ORDER_PROC + ORDER_MED",
          selector: `orders entered between ${fmt(start)} and ${fmt(end)}`,
          columns: ["Kind", "Order ID", "Description", "Entered (local)", "Status"],
          rows,
          highlights,
          rowClasses,
          footnote: "The gap-marked row is the order immediately before the silent window. Orders after it were entered once the window closed.",
        },
      ],
      demands: ["The Epic chart-access audit for the gap window, showing who had the chart open and what they were doing."],
      tags: ["orders", "absence"],
    },
  ];
}

// ==========================================================================
// 5. completeness
// ==========================================================================

function completeness(chart: Chart): Finding[] {
  const out: Finding[] = [];

  if (chart.requestedButAbsent.length) {
    const crit = chart.requestedButAbsent.filter((t) => CRITICAL_ABSENCE_TABLES.has(t));
    out.push({
      id: "",
      severity: SUPPORTING,
      category: "absence",
      title: "Recognised tables that were not part of this import",
      subtitle: "Clarity table checklist",
      facts: [
        `${chart.requestedButAbsent.length} tables on the standard checklist were not found among the imported files: ${chart.requestedButAbsent.join(", ")}.`,
        ...(crit.length
          ? [`Of these, ${crit.join(", ")} would ordinarily hold the intraoperative timeline, the flowsheet edit history, or the chart-access log.`]
          : []),
        "This only reflects what was imported into this session, not a confirmed absence from the underlying production — obtain a complete export directory listing before treating any of these as absent from the source system.",
      ],
      evidence: [
        {
          source: "(import checklist)",
          selector: "tables on the standard Clarity checklist",
          columns: ["Table", "Status"],
          rows: PRIORITY_TABLES.map((t) => [t.name, chart.presentTables.has(t.name) ? "imported" : "NOT IMPORTED"]),
        },
      ],
      demands: ["A complete file listing of EHITables, and import of any listed table not yet reviewed."],
      tags: ["completeness"],
    });
  }

  if (chart.flowsheet.length && chart.flowsheet.every((f) => f.value === null)) {
    const redacted = chart.flowsheet.filter((f) => f.name.toLowerCase().includes("redact"));
    out.push({
      id: "",
      severity: STRONG,
      category: "absence",
      title: "The flowsheet was imported without any measurement values",
      subtitle: "IP_FLWSHT_MEAS · no value column present",
      facts: [
        "The imported IP_FLWSHT_MEAS table contains no measurement-value column.",
        `${chart.flowsheet.length} flowsheet rows were imported with their timestamps, authorship and template, but not the values that were charted.`,
        ...(redacted.length ? [`${redacted.length} rows carry a row name explicitly indicating redaction.`] : []),
      ],
      evidence: [
        {
          source: "EHITables/IP_FLWSHT_MEAS",
          selector: "rows whose row name indicates redaction",
          columns: ["Row", "Recorded", "Entered", "Entered by", "Template"],
          rows: redacted.length
            ? redacted.map((f) => [f.name, fmt(f.recordedLocal), fmt(f.entryLocal), f.enteredBy, f.template])
            : [["(none)", "", "", "", ""]],
          highlights: redacted.length ? Object.fromEntries(redacted.map((_, i) => [`${i}:0`, "primary" as HighlightRole])) : {},
          footnote: "FLT_ID_DISPLAY_NAME (template) is often enough to infer what was withheld even without the value column.",
        },
      ],
      demands: ["IP_FLWSHT_MEAS complete, including the value column, and every redacted row unredacted with the basis for redaction stated."],
      tags: ["completeness", "flowsheet"],
    });
  }

  const bare = chart.notes.filter((n) => !(n.type || n.createdLocal || n.serviceLocal || n.author));
  if (bare.length && chart.notes.length && bare.length > 0.25 * chart.notes.length) {
    out.push({
      id: "",
      severity: SUPPORTING,
      category: "absence",
      title: "Most note records were imported with identifying metadata missing",
      subtitle: "EHITables/HNO_INFO",
      facts: [
        `${chart.notes.length} note records exist for this patient in the import.`,
        `${bare.length} of them have no note type, no author, no creation instant and no service date.`,
      ],
      evidence: [
        {
          source: "EHITables/HNO_INFO",
          selector: "rows with no populated clinical columns",
          columns: ["Metric", "Count"],
          rows: [
            ["Note records in HNO_INFO", String(chart.notes.length)],
            ["Records with identifying metadata", String(chart.notes.length - bare.length)],
            ["Records with all metadata missing", String(bare.length)],
          ],
          highlights: { "2:1": "primary" },
        },
      ],
      demands: ["A certified note inventory stating, for each record imported without metadata, why."],
      tags: ["completeness", "notes"],
    });
  }

  const thin = chart.encounters.filter((e) => !e.producedWithContent);
  if (thin.length && chart.encounters.length) {
    const rows = chart.encounters.map((e) => [
      e.csn,
      dateOnly(e.contactDate),
      e.klass,
      e.blockType,
      e.producedWithContent ? "content produced" : "not produced",
    ]);
    const highlights = Object.fromEntries(
      chart.encounters.flatMap((e, i) => (e.producedWithContent ? [] : [[`${i}:0`, "primary" as HighlightRole]])),
    );
    out.push({
      id: "",
      severity: STRONG,
      category: "absence",
      title: `${thin.length} further encounter records exist; they were imported without content`,
      subtitle: "EHITables/PAT_ENC_2",
      facts: [
        `${chart.encounters.length} encounter records exist for this patient.`,
        `${chart.encounters.length - thin.length} were imported with clinical content.`,
        `${thin.length} were imported as a contact date and little else: ${thin
          .slice(0, 12)
          .map((e) => e.csn)
          .join(", ")}.`,
      ],
      evidence: [
        {
          source: "EHITables/PAT_ENC_2",
          selector: "every encounter record for this patient",
          columns: ["CSN", "Contact date", "Class", "Block type", "Produced?"],
          rows,
          highlights,
          footnote: "Anaesthesia records, OR encounters and newborn linkages commonly live on a sibling CSN that a production scoped to one encounter will miss.",
        },
      ],
      demands: ["Production in full of every encounter listed, in particular any encounter carrying the anaesthesia record."],
      tags: ["completeness", "encounters"],
    });
  }

  return out;
}

// ==========================================================================
// 6. field contradictions
// ==========================================================================

function fieldContradictions(chart: Chart, cfg: ForensicsConfig): Finding[] {
  const out: Finding[] = [];
  const pairs = cfg.contradiction_pairs ?? [["PAT_ENC_HSP", "DELIVERY_TYPE_C_NAME", "ACTL_DELIVRY_METH_C_NAME", "recorded delivery method"]];

  for (const [table, a, b, label] of pairs) {
    for (const row of chart.tables[table] ?? []) {
      const va = String(row[a] ?? "");
      const vb = String(row[b] ?? "");
      if (va && vb && va.trim().toLowerCase() !== vb.trim().toLowerCase()) {
        out.push({
          id: "",
          severity: SUPPORTING,
          category: "contradiction",
          title: `Two fields on the same row disagree about the ${label}`,
          subtitle: `EHITables/${table}`,
          facts: [`${a} reads '${va}'.`, `${b} reads '${vb}'.`, "Both are on the same row of the same table and were never reconciled."],
          evidence: [
            {
              source: `EHITables/${table}`,
              selector: `${a} vs ${b}`,
              columns: ["Column", "Value"],
              rows: [
                [a, va],
                [b, vb],
              ],
              highlights: { "0:1": "primary", "1:1": "context" },
            },
          ],
          demands: [`An explanation of which value is correct and which downstream reporting consumed ${a}.`],
          tags: ["contradiction", table],
        });
      }
    }
  }

  for (const row of chart.tables.PAT_ENC_HSP ?? []) {
    const st = String(row.ADT_ATHCRT_STAT_C_NAME ?? "");
    if (st && st.toLowerCase() !== "complete") {
      out.push({
        id: "",
        severity: SUPPORTING,
        category: "contradiction",
        title: `The encounter's chart authentication status is '${st}'`,
        subtitle: "EHITables/PAT_ENC_HSP · ADT_ATHCRT_STAT_C_NAME",
        facts: [
          `ADT_ATHCRT_STAT_C_NAME reads '${st}'.`,
          "This is Epic's own flag that required authentication or documentation for the encounter was never completed, and it persists in the extract.",
        ],
        evidence: [
          {
            source: "EHITables/PAT_ENC_HSP",
            selector: `PAT_ENC_CSN_ID = ${String(row.PAT_ENC_CSN_ID ?? "")}`,
            columns: ["Column", "Value"],
            rows: [
              ["PAT_ENC_CSN_ID", String(row.PAT_ENC_CSN_ID ?? "")],
              ["ADT_ATHCRT_STAT_C_NAME", st],
              ["HOSP_DISCH_TIME", fmt(parseDt(row.HOSP_DISCH_TIME)) || String(row.HOSP_DISCH_TIME ?? "")],
            ],
            highlights: { "1:1": "primary" },
          },
        ],
        demands: ["Identification of what remained unauthenticated and why."],
        tags: ["contradiction"],
      });
    }
  }

  return out;
}

// ==========================================================================
// registry
// ==========================================================================

const SEVERITY_ORDER: Record<string, number> = { [PROVABLE]: 0, [STRONG]: 1, [SUPPORTING]: 2 };
const CATEGORY_LETTER: Record<string, string> = {
  alteration: "A",
  late_entry: "A",
  backdating: "B",
  absence: "C",
  contradiction: "D",
  clinical: "F",
};

function assignIds(findings: Finding[]): Finding[] {
  const counters: Record<string, number> = {};
  for (const f of findings) {
    const letter = CATEGORY_LETTER[f.category] ?? "Z";
    counters[letter] = (counters[letter] ?? 0) + 1;
    f.id = `${letter}-${counters[letter]}`;
  }
  return findings;
}

export function runAll(chart: Chart, cfg: ForensicsConfig): Finding[] {
  const out: Finding[] = [
    ...documentationSessions(chart, cfg),
    ...noteBackdating(chart, cfg),
    ...resultAmendments(chart),
    ...orderSilence(chart, cfg),
    ...completeness(chart),
    ...fieldContradictions(chart, cfg),
  ];
  out.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title),
  );
  return assignIds(out);
}
