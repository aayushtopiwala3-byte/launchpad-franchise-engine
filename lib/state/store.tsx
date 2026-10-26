"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { AiCallRecord } from "../ai/client";
import { CostLedger, DEFAULT_COST_CEILING_USD } from "../ai/cost";
import { EMPTY_ENRICHMENT, enrichWithAi, type AiEnrichment } from "../ai/enrich";
import { ACTIVE_MODEL } from "../ai/model";
import { runPipeline } from "../engine/pipeline";
import { parseWorkbook } from "../parse/workbook";
import { BRAND_DEFAULT_POLICY, POLICY_PRESETS } from "../reference";
import { SEED_APPLICATIONS } from "../seed/applications";
import { SEED_STORES } from "../seed/stores";
import { SEED_TERRITORIES } from "../seed/territories";
import type {
  ChatMessage,
  CostLedgerEntry,
  FeatureFlags,
  Feedback,
  HealthState,
  Override,
  ParseReport,
  Patch,
  PendingUpdate,
  PipelineInput,
  PipelineResult,
  PolicyProfile,
  Status,
  SystemLogEntry,
  Version,
  VersionTrigger,
} from "../types";
import { DEFAULT_FLAGS, decodeFlags } from "./features";
import { HEALTHY, appendLog, logEntry } from "./health";
import { load, save, clear as clearStorage, isSafeMode, type PersistedState } from "./persistence";
import { makeVersion } from "./versions";

/** How many versions survive a reload. Enough for a long session, small enough to store. */
const STORED_VERSIONS = 40;

export interface AppState {
  input: PipelineInput | null;
  /** Rows excluded as template examples, kept so "Include it" can put them back. */
  excludedExampleRows: PipelineInput | null;
  includeExampleRow: boolean;
  parseReport: ParseReport | null;
  datasetLabel: string | null;
  asOfDate: string | null;
  result: PipelineResult | null;

  policy: PolicyProfile;
  profiles: PolicyProfile[];
  flags: FeatureFlags;

  versions: Version[];
  feedback: Feedback[];
  overrides: Override[];
  pendingUpdates: PendingUpdate[];
  chat: ChatMessage[];
  costLedger: CostLedgerEntry[];

  health: HealthState;
  systemLog: SystemLogEntry[];
  /** Set when a re-run threw or broke an invariant and the state was rolled back. */
  rollbackBanner: string | null;
  /** Set when the AI was asked and could not answer, so the fallbacks carried the load. */
  aiDegraded: string | null;
  corruptPayload: string | null;
  storageAvailable: boolean;
  safeMode: boolean;
  hydrated: boolean;
  busy: string | null;
}

const INITIAL: AppState = {
  input: null,
  excludedExampleRows: null,
  includeExampleRow: false,
  parseReport: null,
  datasetLabel: null,
  asOfDate: null,
  result: null,
  policy: BRAND_DEFAULT_POLICY,
  profiles: POLICY_PRESETS,
  flags: DEFAULT_FLAGS,
  versions: [],
  feedback: [],
  overrides: [],
  pendingUpdates: [],
  chat: [],
  costLedger: [],
  health: HEALTHY,
  systemLog: [],
  rollbackBanner: null,
  aiDegraded: null,
  corruptPayload: null,
  storageAvailable: true,
  safeMode: false,
  hydrated: false,
  busy: null,
};

type Action =
  | { type: "hydrate"; patch: Partial<AppState> }
  | { type: "busy"; label: string | null }
  | { type: "dataset"; patch: Partial<AppState> }
  | { type: "result"; result: PipelineResult; version: Version | null }
  | { type: "rollback"; message: string; log: SystemLogEntry }
  | { type: "dismissRollback" }
  | { type: "aiDegraded"; detail: string | null }
  | { type: "flags"; flags: FeatureFlags }
  | { type: "policy"; policy: PolicyProfile; profiles?: PolicyProfile[] }
  | { type: "profiles"; profiles: PolicyProfile[] }
  | { type: "feedback"; feedback: Feedback }
  | { type: "override"; override: Override }
  | { type: "removeOverride"; applicationId: string }
  | { type: "pendingUpdate"; update: PendingUpdate }
  | { type: "resolvePendingUpdate"; id: string; state: "accepted" | "rejected" }
  | { type: "chat"; messages: ChatMessage[] }
  | { type: "cost"; entry: CostLedgerEntry }
  | { type: "health"; patch: Partial<HealthState> }
  | { type: "log"; entry: SystemLogEntry }
  | { type: "reset" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.patch, hydrated: true };
    case "busy":
      return { ...state, busy: action.label };
    case "dataset":
      return { ...state, ...action.patch };
    case "result":
      return {
        ...state,
        result: action.result,
        versions: action.version ? [...state.versions, action.version] : state.versions,
        rollbackBanner: null,
        health: {
          ...state.health,
          rules:
            action.result.invariantViolation === null
              ? { level: "green", detail: `${action.result.applicants.length} rows decided.` }
              : { level: "red", detail: action.result.invariantViolation },
        },
      };
    case "rollback":
      return {
        ...state,
        rollbackBanner: action.message,
        systemLog: appendLog(state.systemLog, action.log),
        health: { ...state.health, rules: { level: "red", detail: action.message } },
        busy: null,
      };
    case "dismissRollback":
      return { ...state, rollbackBanner: null };
    case "aiDegraded":
      return { ...state, aiDegraded: action.detail };
    case "flags":
      return { ...state, flags: action.flags };
    case "policy":
      return { ...state, policy: action.policy, profiles: action.profiles ?? state.profiles };
    case "profiles":
      return { ...state, profiles: action.profiles };
    case "feedback":
      return {
        ...state,
        feedback: [
          ...state.feedback.filter((f) => f.applicationId !== action.feedback.applicationId),
          action.feedback,
        ],
      };
    case "override":
      return {
        ...state,
        overrides: [
          ...state.overrides.filter((o) => o.applicationId !== action.override.applicationId),
          action.override,
        ],
      };
    case "removeOverride":
      return {
        ...state,
        overrides: state.overrides.filter((o) => o.applicationId !== action.applicationId),
      };
    case "pendingUpdate":
      return { ...state, pendingUpdates: [action.update, ...state.pendingUpdates] };
    case "resolvePendingUpdate":
      return {
        ...state,
        pendingUpdates: state.pendingUpdates.map((u) =>
          u.id === action.id ? { ...u, state: action.state } : u,
        ),
      };
    case "chat":
      return { ...state, chat: action.messages };
    case "cost":
      return { ...state, costLedger: [action.entry, ...state.costLedger].slice(0, 200) };
    case "health":
      return { ...state, health: { ...state.health, ...action.patch } };
    case "log":
      return { ...state, systemLog: appendLog(state.systemLog, action.entry) };
    case "reset":
      return { ...INITIAL, hydrated: true, safeMode: state.safeMode, flags: state.flags };
  }
}

export interface StoreValue extends AppState {
  loadSample: () => void;
  loadFile: (file: File) => Promise<void>;
  setIncludeExampleRow: (include: boolean) => void;
  applyPatches: (patches: Patch[], trigger: VersionTrigger, detail?: string) => PipelineResult | null;
  applyPolicy: (policy: PolicyProfile) => void;
  saveProfile: (profile: PolicyProfile) => void;
  deleteProfile: (name: string) => void;
  setFlags: (flags: FeatureFlags) => void;
  toggleFlag: (key: keyof FeatureFlags) => void;
  addFeedback: (feedback: Feedback) => void;
  addOverride: (override: Override) => void;
  removeOverride: (applicationId: string) => void;
  addPendingUpdate: (update: PendingUpdate) => void;
  resolvePendingUpdate: (id: string, accept: boolean) => void;
  setChat: (messages: ChatMessage[]) => void;
  /** The one session budget. Shared so chat and enrichment spend against the same cap. */
  ledger: CostLedger;
  recordCost: (entry: CostLedgerEntry) => void;
  setHealth: (patch: Partial<HealthState>) => void;
  log: (entry: SystemLogEntry) => void;
  reset: () => void;
  dismissRollback: () => void;
  corruptPayloadDownloadable: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Applications are patched by Application ID; the first matching row wins. */
function applyPatchesToInput(input: PipelineInput, patches: Patch[]): PipelineInput {
  if (patches.length === 0) return input;
  const applied = new Set<string>();
  return {
    ...input,
    applications: input.applications.map((row) => {
      let next = row;
      for (const p of patches) {
        const once = `${p.applicationId}|${p.field}`;
        if (row.applicationId !== p.applicationId || applied.has(once)) continue;
        applied.add(once);
        next = { ...next, [p.field]: p.newValue ?? "" };
      }
      return next;
    }),
  };
}

function costEntry(call: AiCallRecord): CostLedgerEntry {
  return {
    callType: call.callType,
    model: ACTIVE_MODEL,
    promptTokens: call.inputTokens,
    completionTokens: call.outputTokens,
    estimatedUsd: call.estimatedUsd,
    cacheHit: call.cached,
    at: new Date().toISOString(),
    ok: call.ok,
  };
}

function ceiling(): number {
  const raw = Number(process.env.NEXT_PUBLIC_AI_COST_CEILING_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COST_CEILING_USD;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Kept in memory only, so the example-row toggle can re-read the same workbook.
  const uploadRef = useRef<{ buffer: ArrayBuffer; fileName: string } | null>(null);
  // One ledger per session. Shared by every AI caller so the ceiling is a single budget.
  const ledgerRef = useRef(new CostLedger(ceiling()));
  // The latest AI labels. Every re-run reuses them, so a patch does not re-spend.
  const enrichmentRef = useRef<AiEnrichment>(EMPTY_ENRICHMENT);
  // Guards against two enrichment passes racing after a fast second upload.
  const enrichRunRef = useRef(0);

  // ---- hydrate ----
  useEffect(() => {
    const safe = isSafeMode();
    const urlFlags =
      typeof window === "undefined"
        ? null
        : decodeFlags(new URLSearchParams(window.location.search).get("f"));
    const outcome = load();
    const stored = outcome.state;

    const patch: Partial<AppState> = {
      safeMode: safe,
      storageAvailable: outcome.available,
      corruptPayload: outcome.corruptPayload,
      flags: safe
        ? { ...DEFAULT_FLAGS, aiExplanations: false, aiContradictionCheck: false, map: false }
        : (urlFlags ?? stored?.flags ?? DEFAULT_FLAGS),
      policy: stored?.policy ?? BRAND_DEFAULT_POLICY,
      profiles: stored?.profiles?.length ? stored.profiles : POLICY_PRESETS,
      feedback: stored?.feedback ?? [],
      overrides: stored?.overrides ?? [],
      pendingUpdates: stored?.pendingUpdates ?? [],
      includeExampleRow: stored?.includeExampleRow ?? false,
      health: outcome.corruptPayload
        ? {
            ...HEALTHY,
            storage: {
              level: "amber",
              detail: "Saved data could not be read and was reset. The old copy is downloadable.",
            },
          }
        : safe
          ? { ...HEALTHY, storage: { level: "amber", detail: "Safe mode — nothing is saved." } }
          : HEALTHY,
    };

    if (stored?.rawInput && stored.asOfDate) {
      const input = stored.rawInput as PipelineInput;
      try {
        const result = runPipeline(input, {
          policy: patch.policy ?? BRAND_DEFAULT_POLICY,
          asOfDate: stored.asOfDate,
          lockedOverrides: lockedMap(stored.overrides ?? []),
        });
        patch.input = input;
        patch.asOfDate = stored.asOfDate;
        patch.datasetLabel = stored.datasetLabel;
        patch.result = result;
        // Restoring is not an event: it reproduces a state that already has a version. It
        // earns one only when re-running the rules actually moved a decision, which means
        // the saved history no longer matches what the engine now does. The AI pass about
        // to follow owns that comparison when it runs, because this baseline carries no AI
        // reading yet and so every enriched row would look as though it had moved.
        const prior = stored.versions ?? [];
        const aiWillRerun = Boolean(
          patch.flags?.aiExplanations || patch.flags?.aiContradictionCheck,
        );
        const ownsComparison = !aiWillRerun && prior.length > 0;
        const restored = makeVersion(
          prior,
          result,
          "upload",
          [],
          prior.length === 0 ? "Restored from this browser" : "Re-run on load — the rules moved",
        );
        patch.versions =
          prior.length === 0 || (ownsComparison && restored.diff.length > 0)
            ? [...prior, restored]
            : prior;
        patch.health = {
          ...(patch.health ?? HEALTHY),
          parser: {
            level: "green",
            detail: `${input.applications.length} rows restored from this browser. The file was not re-read.`,
          },
          rules:
            result.invariantViolation === null
              ? { level: "green", detail: `${result.applicants.length} rows decided.` }
              : { level: "red", detail: result.invariantViolation },
        };
      } catch {
        patch.health = {
          ...(patch.health ?? HEALTHY),
          rules: { level: "amber", detail: "Saved dataset could not be re-run and was dropped." },
        };
      }
    }

    dispatch({ type: "hydrate", patch });
  }, []);

  // ---- persist ----
  useEffect(() => {
    if (!state.hydrated || state.safeMode) return;
    const payload: PersistedState = {
      schemaVersion: 1,
      rawInput: state.input,
      asOfDate: state.asOfDate,
      datasetLabel: state.datasetLabel,
      policy: state.policy,
      profiles: state.profiles,
      flags: state.flags,
      feedback: state.feedback,
      overrides: state.overrides,
      pendingUpdates: state.pendingUpdates,
      includeExampleRow: state.includeExampleRow,
      // A snapshot holds a row per applicant, so an unbounded history would eventually
      // fill storage and take the uploaded data down with it. Ids are numbered from the
      // last version, so dropping the oldest never makes two versions share one.
      versions: state.versions.slice(-STORED_VERSIONS),
    };
    const { ok, error } = save(payload);
    const detail = ok ? "Saved in this browser." : (error ?? "Could not save.");
    if (stateRef.current.health.storage.detail !== detail) {
      dispatch({ type: "health", patch: { storage: { level: ok ? "green" : "amber", detail } } });
    }
  }, [
    state.hydrated,
    state.safeMode,
    state.input,
    state.asOfDate,
    state.datasetLabel,
    state.policy,
    state.profiles,
    state.flags,
    state.feedback,
    state.overrides,
    state.pendingUpdates,
    state.includeExampleRow,
    state.versions,
  ]);

  /**
   * The one place a new result is published. Snapshots first, runs, and refuses to
   * publish a run that threw or broke the one-store-per-pin invariant — a bad
   * allocation must never reach the screen.
   */
  const publish = useCallback(
    (
      input: PipelineInput,
      asOfDate: string,
      policy: PolicyProfile,
      trigger: VersionTrigger,
      patches: Patch[],
      detail?: string,
      extra?: Partial<AppState>,
    ): PipelineResult | null => {
      const prior = stateRef.current;
      try {
        const result = runPipeline(input, {
          policy,
          asOfDate,
          lockedOverrides: lockedMap(prior.overrides),
          classifications: enrichmentRef.current.classifications,
          contradictions: enrichmentRef.current.contradictions,
        });
        if (result.invariantViolation !== null) {
          dispatch({
            type: "rollback",
            message: result.invariantViolation,
            log: logEntry("engine", false, "Allocation rolled back", result.invariantViolation),
          });
          return null;
        }
        if (extra) dispatch({ type: "dataset", patch: extra });
        const version = makeVersion(prior.versions, result, trigger, patches, detail);
        // An operator action is always worth a version, even one that moved nothing —
        // "you did this and it changed no decision" is an answer. The AI pass runs itself
        // on every load, so recording an identical re-run would bury the real history.
        const automatic = trigger === "ai-enrichment";
        dispatch({
          type: "result",
          result,
          version: automatic && prior.versions.length > 0 && version.diff.length === 0 ? null : version,
        });
        dispatch({
          type: "log",
          entry: logEntry("engine", true, `Decided ${result.applicants.length} applications`),
        });
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        dispatch({
          type: "rollback",
          message: `The re-run failed and nothing was changed. ${message}`,
          log: logEntry("engine", false, "Pipeline threw", message),
        });
        return null;
      }
    },
    [],
  );

  /**
   * AI-1 and AI-2 over a freshly loaded dataset. Runs after the deterministic result is
   * already on screen, so the product is usable immediately and the AI only refines it.
   */
  const runEnrichment = useCallback(
    async (input: PipelineInput, asOfDate: string) => {
      const run = ++enrichRunRef.current;
      const { aiExplanations, aiContradictionCheck } = stateRef.current.flags;
      enrichmentRef.current = EMPTY_ENRICHMENT;

      if (!aiExplanations && !aiContradictionCheck) {
        dispatch({
          type: "health",
          patch: {
            ai: { level: "amber", detail: "AI is switched off. Every reason is rule-generated." },
          },
        });
        return;
      }

      dispatch({
        type: "health",
        patch: { ai: { level: "amber", detail: "Reading the free text…" } },
      });

      const enrichment = await enrichWithAi(
        input.applications,
        { classify: aiExplanations, contradictions: aiContradictionCheck },
        {
          ledger: ledgerRef.current,
          onCall: (call) => {
            dispatch({ type: "cost", entry: costEntry(call) });
            if (!call.ok) {
              dispatch({
                type: "log",
                entry: logEntry("ai", false, `${call.callType} call failed`, call.detail),
              });
            }
          },
        },
      );

      // A newer dataset started while this was in flight; its own pass owns the state.
      if (run !== enrichRunRef.current) return;

      enrichmentRef.current = enrichment;
      const spent = ledgerRef.current.totalUsd;
      const got = enrichment.attempted - enrichment.failed;
      const level = enrichment.failed === 0 ? "green" : "amber";
      const detail =
        enrichment.attempted === 0
          ? "No free text needed reading."
          : enrichment.failed === 0
            ? `Read ${got} of ${enrichment.attempted} passages for about $${spent.toFixed(4)}.`
            : `${enrichment.failed} of ${enrichment.attempted} AI calls failed, so those rows used the rule-based reading. ${enrichment.firstFailure ?? ""}`.trim();

      dispatch({ type: "health", patch: { ai: { level, detail } } });
      dispatch({ type: "log", entry: logEntry("ai", level === "green", "AI reading finished", detail) });
      // Only an AI that was asked and could not answer is a degradation worth a banner.
      dispatch({ type: "aiDegraded", detail: enrichment.failed === 0 ? null : detail });

      if (got > 0) {
        publish(input, asOfDate, stateRef.current.policy, "ai-enrichment", [], detail);
      }
    },
    [publish],
  );

  // A dataset restored on a hard refresh needs its AI pass back. Every call is a cache
  // hit from the previous pass, so this costs nothing and spends nothing.
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (!state.hydrated || rehydratedRef.current) return;
    rehydratedRef.current = true;
    if (state.input && state.asOfDate) void runEnrichment(state.input, state.asOfDate);
  }, [state.hydrated, state.input, state.asOfDate, runEnrichment]);

  const loadSample = useCallback(() => {
    const asOfDate = today();
    const input: PipelineInput = {
      applications: SEED_APPLICATIONS,
      territories: SEED_TERRITORIES,
      stores: SEED_STORES,
    };
    publish(input, asOfDate, stateRef.current.policy, "sample", [], undefined, {
      input,
      excludedExampleRows: null,
      includeExampleRow: false,
      asOfDate,
      datasetLabel: "Sample data (28 applications, 8 territories)",
      parseReport: null,
      health: {
        ...stateRef.current.health,
        parser: { level: "green", detail: "Sample data loaded from memory — no file was read." },
      },
    });
    void runEnrichment(input, asOfDate);
  }, [publish, runEnrichment]);

  const publishParse = useCallback(
    (buffer: ArrayBuffer, fileName: string, includeExampleRow: boolean) => {
      try {
        const { input, report } = parseWorkbook(buffer, { fileName, includeExampleRow });
        const asOfDate = today();
        const level = report.sheetsMissing.length > 0 || report.rowErrors.length > 0 ? "amber" : "green";
        const detail =
          report.sheetsMissing.length > 0
            ? `Could not find: ${report.sheetsMissing.join(", ")}. The rest was processed.`
            : report.rowErrors.length > 0
              ? `${report.rowErrors.length} row${report.rowErrors.length === 1 ? "" : "s"} could not be read; the rest were.`
              : `Read ${input.applications.length} applications and ${input.territories.length} territories in ${report.processedMs} ms.`;

        publish(input, asOfDate, stateRef.current.policy, "upload", [], fileName, {
          input,
          excludedExampleRows: null,
          includeExampleRow,
          asOfDate,
          datasetLabel: fileName,
          parseReport: report,
          health: { ...stateRef.current.health, parser: { level, detail } },
        });
        dispatch({ type: "log", entry: logEntry("parse", level === "green", detail) });
        void runEnrichment(input, asOfDate);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        dispatch({
          type: "health",
          patch: { parser: { level: "red", detail: `${fileName} could not be read. ${message}` } },
        });
        dispatch({ type: "log", entry: logEntry("parse", false, "File could not be read", message) });
      } finally {
        dispatch({ type: "busy", label: null });
      }
    },
    [publish, runEnrichment],
  );

  const loadFile = useCallback(
    async (file: File) => {
      dispatch({ type: "busy", label: `Reading ${file.name}…` });
      const buffer = await file.arrayBuffer();
      uploadRef.current = { buffer, fileName: file.name };
      publishParse(buffer, file.name, false);
    },
    [publishParse],
  );

  const setIncludeExampleRow = useCallback(
    (include: boolean) => {
      // Only reachable from the processing panel, which only renders after an upload.
      const upload = uploadRef.current!;
      dispatch({
        type: "busy",
        label: include ? "Putting the example row back…" : "Removing the example row…",
      });
      publishParse(upload.buffer, upload.fileName, include);
    },
    [publishParse],
  );

  const applyPatches = useCallback(
    (patches: Patch[], trigger: VersionTrigger, detail?: string) => {
      const s = stateRef.current;
      if (!s.input || !s.asOfDate) return null;
      const next = applyPatchesToInput(s.input, patches);
      return publish(next, s.asOfDate, s.policy, trigger, patches, detail, { input: next });
    },
    [publish],
  );

  /** Accepting runs the same patch pipeline as the chat, so a partner update is auditable. */
  const resolvePendingUpdate = useCallback(
    (id: string, accept: boolean) => {
      const update = stateRef.current.pendingUpdates.find((u) => u.id === id);
      if (!update) return;
      if (accept && update.proposedPatches.length > 0) {
        const published = applyPatches(
          update.proposedPatches,
          "partner-update",
          `${update.applicationId} reported a change`,
        );
        // A rolled-back run leaves the update pending so the manager can retry.
        if (published === null) return;
      }
      dispatch({ type: "resolvePendingUpdate", id, state: accept ? "accepted" : "rejected" });
    },
    [applyPatches],
  );

  const applyPolicy = useCallback(
    (policy: PolicyProfile) => {
      const s = stateRef.current;
      dispatch({ type: "policy", policy });
      if (s.input && s.asOfDate) {
        publish(s.input, s.asOfDate, policy, "policy-change", [], policy.name);
      }
    },
    [publish],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      loadSample,
      loadFile,
      setIncludeExampleRow,
      applyPatches,
      applyPolicy,
      saveProfile: (profile) => {
        const rest = stateRef.current.profiles.filter((p) => p.name !== profile.name);
        dispatch({ type: "profiles", profiles: [...rest, profile] });
      },
      deleteProfile: (name) =>
        dispatch({
          type: "profiles",
          profiles: stateRef.current.profiles.filter((p) => p.name !== name || p.isDefault),
        }),
      setFlags: (flags) => dispatch({ type: "flags", flags }),
      toggleFlag: (key) =>
        dispatch({
          type: "flags",
          flags: { ...stateRef.current.flags, [key]: !stateRef.current.flags[key] },
        }),
      addFeedback: (feedback) => dispatch({ type: "feedback", feedback }),
      addOverride: (override) => dispatch({ type: "override", override }),
      removeOverride: (applicationId) => dispatch({ type: "removeOverride", applicationId }),
      addPendingUpdate: (update) => dispatch({ type: "pendingUpdate", update }),
      resolvePendingUpdate,
      setChat: (messages) => dispatch({ type: "chat", messages }),
      ledger: ledgerRef.current,
      recordCost: (entry) => dispatch({ type: "cost", entry }),
      setHealth: (patch) => dispatch({ type: "health", patch }),
      log: (entry) => dispatch({ type: "log", entry }),
      reset: () => {
        clearStorage();
        dispatch({ type: "reset" });
      },
      dismissRollback: () => dispatch({ type: "dismissRollback" }),
      corruptPayloadDownloadable: state.corruptPayload,
    }),
    [state, loadSample, loadFile, setIncludeExampleRow, applyPatches, applyPolicy],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>.");
  return value;
}

function lockedMap(overrides: Override[]): Map<string, Status> {
  return new Map(overrides.filter((o) => o.locked).map((o) => [o.applicationId, o.toStatus]));
}

/** Frozen per dataset at the moment of load, never re-read inside the engine. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
