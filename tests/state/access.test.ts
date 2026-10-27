// Role-appropriate access.
//
// The brief is explicit that a boundary made of hidden buttons is not a boundary, so the
// cases here are about the capability model itself and about the refusal message being
// honest: it must say the write did not happen, and the product must never call this a login.

import { describe, expect, it } from "vitest";
import {
  ACCESS_LIMITATION,
  ACTOR_FOR_ROLE,
  DEFAULT_ROLE,
  ROLES,
  REQUIRED_CAPABILITY,
  ROLE_SUMMARY,
  can,
  deniedReason,
  guardAction,
  type Capability,
} from "../../lib/state/access";

const ALL: Capability[] = ["dataset", "policy", "leads", "answer-update", "onboarding"];

describe("the capability model", () => {
  it("lets the expansion team run the pipeline and the acquisition desk", () => {
    for (const c of ALL) expect(can("Expansion team", c)).toBe(true);
  });

  it("lets a partner record onboarding progress and nothing else", () => {
    expect(can("Franchise partner", "onboarding")).toBe(true);
    for (const c of ALL.filter((c) => c !== "onboarding")) {
      expect(can("Franchise partner", c)).toBe(false);
    }
  });

  it("keeps a partner from answering their own request for a correction", () => {
    // Submitting a proposed change is open to a partner; deciding it is not.
    expect(can("Franchise partner", "answer-update")).toBe(false);
  });

  it("starts in the role that can load a workbook, or nothing would work on first visit", () => {
    expect(can(DEFAULT_ROLE, "dataset")).toBe(true);
  });

  it("maps each role onto the onboarding actor it acts as", () => {
    expect(ACTOR_FOR_ROLE["Expansion team"]).toBe("Brand");
    expect(ACTOR_FOR_ROLE["Franchise partner"]).toBe("Partner");
  });

  it("describes every role in words a reader can act on", () => {
    for (const r of ROLES) expect(ROLE_SUMMARY[r].trim().length).toBeGreaterThan(40);
  });
});

describe("the refusal message", () => {
  it("says nothing at all when the role is allowed", () => {
    expect(deniedReason("Expansion team", "leads")).toBeNull();
  });

  it("names the role and what it cannot do", () => {
    const reason = deniedReason("Franchise partner", "leads")!;
    expect(reason).toContain("Franchise partner");
    expect(reason).toContain("acquisition lead");
  });

  it("gives a reason for every capability a role lacks, never a bare refusal", () => {
    for (const r of ROLES) {
      for (const c of ALL) {
        const reason = deniedReason(r, c);
        if (can(r, c)) expect(reason).toBeNull();
        else expect(reason!.trim().length).toBeGreaterThan(20);
      }
    }
  });
});

describe("the guard the reducer runs before every write", () => {
  it("covers every kind of write that changes a record", () => {
    const mutating = [
      "dataset",
      "result",
      "reset",
      "demo:seed",
      "demo:clear",
      "policy",
      "profiles",
      "flags",
      "override",
      "removeOverride",
      "lead:add",
      "lead:update",
      "lead:interaction",
      "outreach:save",
      "resolvePendingUpdate",
      "journey:task",
      "journey:document",
      "journey:siteNotes",
    ];
    for (const type of mutating) expect(REQUIRED_CAPABILITY[type]).toBeDefined();
  });

  it("lets a partner record their own onboarding", () => {
    expect(guardAction("Franchise partner", "journey:task")).toBeNull();
    expect(guardAction("Franchise partner", "journey:document")).toBeNull();
    expect(guardAction("Franchise partner", "journey:siteNotes")).toBeNull();
  });

  it("refuses a partner every write that belongs to the expansion side", () => {
    for (const type of ["dataset", "policy", "flags", "lead:add", "resolvePendingUpdate"]) {
      expect(guardAction("Franchise partner", type)).not.toBeNull();
    }
  });

  it("lets a partner submit a proposed change, because asking is not deciding", () => {
    expect(guardAction("Franchise partner", "pendingUpdate")).toBeNull();
  });

  it("never blocks recording that something happened", () => {
    for (const type of ["log", "health", "cost", "chat", "hydrate", "busy", "feedback"]) {
      expect(guardAction("Franchise partner", type)).toBeNull();
    }
  });

  it("lets the expansion team through on everything the map covers", () => {
    for (const type of Object.keys(REQUIRED_CAPABILITY)) {
      expect(guardAction("Expansion team", type)).toBeNull();
    }
  });

  it("ignores an action type it has never heard of rather than refusing it", () => {
    expect(guardAction("Franchise partner", "no-such-action")).toBeNull();
  });
});

describe("the product does not claim a security boundary it does not have", () => {
  it("states there is no authentication", () => {
    expect(ACCESS_LIMITATION).toContain("no authentication");
  });

  it("says the role is a browser setting, not an account", () => {
    expect(ACCESS_LIMITATION).toContain("not an account");
  });

  it("says what production would need instead", () => {
    expect(ACCESS_LIMITATION).toContain("identity provider");
    expect(ACCESS_LIMITATION).toContain("re-checks every write");
  });

  it("says the enforcement is at the write, not in the UI", () => {
    expect(ACCESS_LIMITATION).toContain("rather than by hiding controls");
  });
});
