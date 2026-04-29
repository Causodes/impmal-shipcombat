/**
 * crit.test.js – Unit tests for crit/captain helpers in constants.js
 */

const { describe, it, assertEqual, assert } = globalThis._test;

const {
  CRIT_LOCATIONS,
  CAPTAIN_CARDS,
  critLocationFromRoll,
  critSeverityFromRoll,
  buildCaptainDeck,
} = await import("../scripts/constants.js");

// ── critLocationFromRoll ──────────────────────────────────────────────────────

describe("critLocationFromRoll", () => {
  const cases = [
    [1, "hull"],
    [2, "hull"],
    [3, "engines"],
    [4, "manoeuvring"],
    [5, "coreSystems"],
    [6, "weaponsSensors"],
  ];
  for (const [roll, expected] of cases) {
    it(`d6=${roll} → ${expected}`, () => {
      assertEqual(critLocationFromRoll(roll).id, expected);
    });
  }

  it("falls back to first location for out-of-range value", () => {
    assertEqual(critLocationFromRoll(99).id, CRIT_LOCATIONS[0].id);
  });
});

// ── critSeverityFromRoll ──────────────────────────────────────────────────────

describe("critSeverityFromRoll", () => {
  const cases = [
    [1,  "low"],
    [3,  "low"],
    [5,  "low"],
    [6,  "medium"],
    [7,  "medium"],
    [8,  "medium"],
    [9,  "high"],
    [10, "high"],
  ];
  for (const [roll, expected] of cases) {
    it(`d10=${roll} → ${expected}`, () => {
      assertEqual(critSeverityFromRoll(roll), expected);
    });
  }

  it("falls back to 'low' for out-of-range value", () => {
    assertEqual(critSeverityFromRoll(0), "low");
  });
});

// ── buildCaptainDeck ──────────────────────────────────────────────────────────

describe("buildCaptainDeck – total size", () => {
  it("produces exactly 22 cards", () => {
    const deck = buildCaptainDeck();
    assertEqual(deck.length, 22, `Expected 22 cards, got ${deck.length}`);
  });
});

describe("buildCaptainDeck – card counts", () => {
  const expectedCopies = {
    emergencyReserves: 2,
    evasiveRoll:       2,
    standDown:         2,
  };

  // Cards with copies > 1: verify correct count
  for (const [id, expected] of Object.entries(expectedCopies)) {
    it(`'${id}' appears ${expected} times`, () => {
      const deck = buildCaptainDeck();
      const count = deck.filter(c => c === id).length;
      assertEqual(count, expected, `Expected ${expected} copies of ${id}, got ${count}`);
    });
  }

  // Single-copy cards: appear exactly once
  const singleCopyIds = CAPTAIN_CARDS.filter(c => (c.copies ?? 1) === 1).map(c => c.id);
  for (const id of singleCopyIds) {
    it(`'${id}' appears exactly 1 time`, () => {
      const deck = buildCaptainDeck();
      const count = deck.filter(c => c === id).length;
      assertEqual(count, 1, `Expected 1 copy of ${id}, got ${count}`);
    });
  }
});

describe("buildCaptainDeck – content validity", () => {
  it("all card IDs exist in CAPTAIN_CARDS", () => {
    const validIds = new Set(CAPTAIN_CARDS.map(c => c.id));
    const deck = buildCaptainDeck();
    for (const id of deck) {
      assert(validIds.has(id), `Unknown card ID in deck: '${id}'`);
    }
  });

  it("deck is an array of strings", () => {
    const deck = buildCaptainDeck();
    assert(Array.isArray(deck), "deck is an Array");
    for (const entry of deck) {
      assert(typeof entry === "string", `Entry '${entry}' is not a string`);
    }
  });
});

describe("buildCaptainDeck – shuffled each call", () => {
  it("two successive decks are not always identical (shuffle sanity check)", () => {
    // With 22 cards there are 22! arrangements; identical ordering on two
    // successive calls is astronomically unlikely.  Run 5 pairs.
    let atLeastOnceDifferent = false;
    for (let t = 0; t < 5; t++) {
      const a = buildCaptainDeck();
      const b = buildCaptainDeck();
      if (!a.every((v, i) => v === b[i])) { atLeastOnceDifferent = true; break; }
    }
    assert(atLeastOnceDifferent, "All 5 deck builds produced identical ordering  -  shuffle may be broken");
  });
});
