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
import { seedDemoLeads } from "../crm/demo";
import type { Lead, LeadInteraction, LeadStage, OutreachDraft } from "../crm/types";
import { DOCUMENT_BY_ID, TASK_BY_ID } from "../onboarding/config";
import { DEMO_APPLICATION_ID, seedDemoProgress } from "../onboarding/demo";
import { canActorCompleteTask, emptyProgress } from "../onboarding/journey";
import type {
  ActivityEntry,
  Actor,
  DocumentRecord,
  JourneyProgress,
  TaskRecord,
} from "../onboarding/types";
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
import { applyPatchesToInput, invertPatches, makeVersion, undoableVersion } from "./versions";

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

  /** Acquisition prospects. Not decisions — the engine owns every verdict. */
  leads: Lead[];
  outreachDrafts: OutreachDraft[];
  /** Recorded onboarding progress, keyed by Application ID. Statuses are derived from it. */
  journeyProgress: Record<string, JourneyProgress>;
  demoSeeded: boolean;

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
  leads: [],
  outreachDrafts: [],
  journeyProgress: {},
  demoSeeded: false,
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
  | { type: "lead:add"; lead: Lead }
  | { type: "lead:update"; leadId: string; patch: Partial<Lead> }
  | { type: "lead:interaction"; leadId: string; interaction: LeadInteraction }
  | { type: "outreach:save"; draft: OutreachDraft }
  | { type: "journey:task"; applicationId: string; taskId: string; record: TaskRecord | null; actor: Actor; activity: ActivityEntry }
  | { type: "journey:document"; applicationId: string; documentId: string; record: DocumentRecord; activity: ActivityEntry }
  | { type: "journey:siteNotes"; applicationId: string; notes: string; activity: ActivityEntry }
  | { type: "demo:seed"; leads: Lead[]; progress: JourneyProgress }
  | { type: "demo:clear" }
  | { type: "reset" };

/** Progress is created on first touch, so a journey never has to be opened to exist. */
function withProgress(
  state: AppState,
  applicationId: string,
  mutate: (p: JourneyProgress) => JourneyProgress,
): AppState {
  const existing =
    state.journeyProgress[applicationId] ??
    emptyProgress(applicationId, applicationId === DEMO_APPLICATION_ID);
  return {
    ...state,
    journeyProgress: { ...state.journeyProgress, [applicationId]: mutate(existing) },
  };
}

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
    case "lead:add":
      return { ...state, leads: [action.lead, ...state.leads] };
    case "lead:update":
      return {
        ...state,
        leads: state.leads.map((l) =>
          // isDemo is filtered out of every patch: a sample record stays a sample record.
          l.leadId === action.leadId ? { ...l, ...action.patch, isDemo: l.isDemo } : l,
        ),
      };
    case "lead:interaction":
      return {
        ...state,
        leads: state.leads.map((l) =>
          l.leadId === action.leadId
            ? {
                ...l,
                interactions: [...l.interactions, action.interaction],
                lastInteractionAt: action.interaction.at,
              }
            : l,
        ),
      };
    case "outreach:save":
      return { ...state, outreachDrafts: [action.draft, ...state.outreachDrafts].slice(0, 200) };
    case "journey:task": {
      // The last line of defence on who may close what. The owner portal hides Brand tasks,
      // but hiding a control is not a rule — this is.
      if (action.record && !canActorCompleteTask(action.actor, action.taskId)) return state;
      return withProgress(state, action.applicationId, (p) => {
        const tasks = { ...p.tasks };
        if (action.record) tasks[action.taskId] = action.record;
        else delete tasks[action.taskId];
        return { ...p, tasks, activity: [...p.activity, action.activity] };
      });
    }
    case "journey:document":
      return withProgress(state, action.applicationId, (p) => ({
        ...p,
        documents: { ...p.documents, [action.documentId]: action.record },
        activity: [...p.activity, action.activity],
      }));
    case "journey:siteNotes":
      return withProgress(state, action.applicationId, (p) => ({
        ...p,
        siteNotes: action.notes,
        activity: [...p.activity, action.activity],
      }));
    case "demo:seed":
      return {
        ...state,
        demoSeeded: true,
        leads: [...state.leads.filter((l) => !l.isDemo), ...action.leads],
        journeyProgress: { ...state.journeyProgress, [DEMO_APPLICATION_ID]: action.progress },
      };
    case "demo:clear": {
      const progress = { ...state.journeyProgress };
      delete progress[DEMO_APPLICATION_ID];
      return {
        ...state,
        demoSeeded: true,
        leads: state.leads.filter((l) => !l.isDemo),
        journeyProgress: progress,
      };
    }
    case "reset":
      return { ...INITIAL, hydrated: true, safeMode: state.safeMode, flags: state.flags };
  }
}

export interface StoreValue extends AppState {
  loadSample: () => void;
  loadFile: (file: File) => Promise<void>;
  setIncludeExampleRow: (include: boolean) => void;
  applyPatches: (patches: Patch[], trigger: VersionTrigger, detail?: string) => PipelineResult | null;
  /** Reverses the change `undoable` names. Returns null when there is nothing to undo. */
  undo: () => PipelineResult | null;
  /** The change an undo would reverse, so the UI can name it or offer nothing at all. */
  undoable: Version | null;
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

  addLead: (lead: Lead) => void;
  updateLead: (leadId: string, patch: Partial<Lead>) => void;
  logInteraction: (leadId: string, interaction: LeadInteraction) => void;
  /** Moves a lead's acquisition stage and records the move in its own history. */
  setLeadStage: (leadId: string, stage: LeadStage, by: string) => void;
  linkLeadToApplication: (leadId: string, applicationId: string) => void;
  saveOutreachDraft: (draft: OutreachDraft) => void;
  /** Returns false when the actor is not permitted to close that task. */
  setJourneyTask: (
    applicationId: string,
    taskId: string,
    done: boolean,
    actor: Actor,
    byName: string,
  ) => boolean;
  setJourneyDocument: (
    applicationId: string,
    documentId: string,
    record: DocumentRecord,
    actor: Actor,
    byName: string,
  ) => void;
  setSiteNotes: (applicationId: string, notes: string, byName: string) => void;
  clearDemoRecords: () => void;
  restoreDemoRecords: () => void;

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
        ? { ...DEFAULT_FLAGS, aiExplanations: false, aiContradictionCheck: false }
        : (urlFlags ?? stored?.flags ?? DEFAULT_FLAGS),
      policy: stored?.policy ?? BRAND_DEFAULT_POLICY,
      profiles: stored?.profiles?.length ? stored.profiles : POLICY_PRESETS,
      feedback: stored?.feedback ?? [],
      overrides: stored?.overrides ?? [],
      pendingUpdates: stored?.pendingUpdates ?? [],
      includeExampleRow: stored?.includeExampleRow ?? false,
      outreachDrafts: stored?.outreachDrafts ?? [],
      demoSeeded: stored?.demoSeeded ?? false,
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

    // The illustrative leads and the sample partner's journey are added once, on a browser
    // that has never held them. After that the stored copy wins, so editing a sample lead
    // sticks and clearing them stays cleared. In safe mode they are added fresh every time,
    // because safe mode saves nothing and an empty workspace would demonstrate nothing.
    const seedDate = stored?.asOfDate ?? today();
    if (stored?.demoSeeded) {
      patch.leads = stored.leads ?? [];
      patch.journeyProgress = stored.journeyProgress ?? {};
    } else {
      patch.demoSeeded = true;
      patch.leads = [...(stored?.leads ?? []), ...seedDemoLeads(seedDate)];
      patch.journeyProgress = {
        ...(stored?.journeyProgress ?? {}),
        [DEMO_APPLICATION_ID]: seedDemoProgress(seedDate),
      };
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
      leads: state.leads,
      outreachDrafts: state.outreachDrafts,
      journeyProgress: state.journeyProgress,
      demoSeeded: state.demoSeeded,
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
    state.leads,
    state.outreachDrafts,
    state.journeyProgress,
    state.demoSeeded,
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

  /**
   * Undo is a step forwards, not a deletion. It inverts the patches of the last version
   * that carried any and sends them down the same path a chat update takes, so the earlier
   * verdict is recomputed by the rules rather than replayed from a stored copy, and the
   * history gains a version instead of losing one.
   */
  const undo = useCallback(() => {
    const target = undoableVersion(stateRef.current.versions);
    if (!target) return null;
    return applyPatches(
      invertPatches(target.patches, `Undo of ${target.versionId}`),
      "undo",
      `reversed ${target.versionId}`,
    );
  }, [applyPatches]);

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
      undo,
      undoable: undoableVersion(state.versions),
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

      addLead: (lead) => dispatch({ type: "lead:add", lead }),
      updateLead: (leadId, patch) => dispatch({ type: "lead:update", leadId, patch }),
      logInteraction: (leadId, interaction) =>
        dispatch({ type: "lead:interaction", leadId, interaction }),
      setLeadStage: (leadId, stage, by) => {
        const lead = stateRef.current.leads.find((l) => l.leadId === leadId);
        if (!lead || lead.stage === stage) return;
        const at = new Date().toISOString();
        dispatch({
          type: "lead:interaction",
          leadId,
          interaction: {
            id: `${leadId}-S${lead.interactions.length + 1}`,
            at,
            kind: "stage-change",
            summary: `Stage moved from ${lead.stage} to ${stage}.`,
            by,
          },
        });
        dispatch({ type: "lead:update", leadId, patch: { stage } });
      },
      linkLeadToApplication: (leadId, applicationId) =>
        dispatch({
          type: "lead:update",
          leadId,
          patch: { linkedApplicationId: applicationId, stage: "Converted" },
        }),
      saveOutreachDraft: (draft) => dispatch({ type: "outreach:save", draft }),
      setJourneyTask: (applicationId, taskId, done, actor, byName) => {
        if (done && !canActorCompleteTask(actor, taskId)) return false;
        const at = new Date().toISOString();
        dispatch({
          type: "journey:task",
          applicationId,
          taskId,
          actor,
          record: done ? { at, by: actor, byName } : null,
          activity: {
            id: `${applicationId}-${taskId}-${at}`,
            at,
            by: actor,
            byName,
            // The log is read by people, so it names the step rather than its internal id.
            summary: done
              ? `Marked "${TASK_BY_ID.get(taskId)?.label ?? taskId}" complete.`
              : `Reopened "${TASK_BY_ID.get(taskId)?.label ?? taskId}".`,
          },
        });
        return true;
      },
      setJourneyDocument: (applicationId, documentId, record, actor, byName) =>
        dispatch({
          type: "journey:document",
          applicationId,
          documentId,
          record,
          activity: {
            id: `${applicationId}-${documentId}-${record.at}`,
            at: record.at,
            by: actor,
            byName,
            summary: `${DOCUMENT_BY_ID.get(documentId)?.label ?? documentId} is now "${record.state}".`,
          },
        }),
      setSiteNotes: (applicationId, notes, byName) => {
        const at = new Date().toISOString();
        dispatch({
          type: "journey:siteNotes",
          applicationId,
          notes,
          activity: {
            id: `${applicationId}-site-${at}`,
            at,
            by: "Partner",
            byName,
            summary: "Site details updated.",
          },
        });
      },
      clearDemoRecords: () => dispatch({ type: "demo:clear" }),
      restoreDemoRecords: () => {
        const date = stateRef.current.asOfDate ?? today();
        dispatch({ type: "demo:seed", leads: seedDemoLeads(date), progress: seedDemoProgress(date) });
      },

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
    [state, loadSample, loadFile, setIncludeExampleRow, applyPatches, undo, applyPolicy],
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
