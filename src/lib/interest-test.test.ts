import { describe, expect, it } from "vitest";
import { catalogPrograms, schools, toSchoolSummary } from "../data/schools";
import {
  emptyTotals,
  gymnasiumProfile,
  isNotForNinthGraders,
  isSpecialNeedsSchool,
  programLevel,
  rankInterests,
  rankSchools,
  type HomeLocation,
  type StudyTrack,
} from "./interest-test";
import { QUESTIONS, computeTotals, primaryInterest, studyTrack, type QuizAnswers } from "./quiz-questions";

const summaries = schools.map(toSchoolSummary);
const programsById = Object.fromEntries(schools.map((school) => [school.id, catalogPrograms(school.programs)]));
const praha5: HomeLocation = { label: "Praha – západ", latitude: 50.0491, longitude: 14.3524 };
const kladno: HomeLocation = { label: "Kladno", latitude: 50.1474, longitude: 14.1028 };

const recommend = (answers: QuizAnswers, home: HomeLocation | null = null, maxDistance: number | null = null) =>
  rankSchools(summaries, programsById, computeTotals(answers), studyTrack(answers), home, maxDistance, primaryInterest(answers));

/** Every combination of answers the quiz UI allows. */
const allAnswerSets = (): QuizAnswers[] =>
  QUESTIONS.reduce<QuizAnswers[]>(
    (sets, question) => sets.flatMap((set) => question.options.map((option) => ({ ...set, [question.id]: option.value }))),
    [{}],
  );

/**
 * Independent expectations per track, written from what the answer promises rather than copied from the code:
 * - "Gymnázium" offers gymnázia and lycea (checked by program name),
 * - "s maturitou" ends with maturita: M, L or P level, never a gymnázium,
 * - "výuční list" means level H (E is meant for pupils with special needs),
 * - nothing ever offers C (praktická škola), E or J levels.
 */
const NEVER_RECOMMENDED = new Set(["C", "E", "J"]);
const levelAllowed = (program: { code: string; name: string }, track: StudyTrack) => {
  const level = programLevel(program.code);
  if (NEVER_RECOMMENDED.has(level)) return false;
  if (track === "general") return /gymnázium|lyceum/i.test(program.name);
  if (track === "maturita") return ["M", "L", "P"].includes(level) && !/gymnázium/i.test(program.name);
  if (track === "vyucni") return level === "H";
  return true;
};

describe("reported case: animal-loving student", () => {
  const animalLover: QuizAnswers = {
    interest: "nature",
    subject: "general",
    workplace: "nature",
    activity: "nature",
    track: "general",
  };

  it("never puts a school for pupils with disabilities first", () => {
    for (const home of [null, praha5, kladno]) {
      const [first] = recommend(animalLover, home).schools;
      expect(first, `home ${home?.label ?? "none"}`).toBeDefined();
      expect(isSpecialNeedsSchool(first?.name ?? "")).toBe(false);
    }
  });

  it("starts with a school that serves the main interest, even on the gymnázium track", () => {
    for (const home of [null, praha5, kladno]) {
      const result = recommend(animalLover, home);
      expect(result.mainInterest).toBe("nature");
      expect(result.schools[0]?.matchesMain, `home ${home?.label ?? "none"}`).toBe(true);
      expect(result.schools[0]?.programs[0]?.categories).toContain("nature");
    }
  });

  it("offers the přírodovědné lyceum before generic gymnázia", () => {
    const names = recommend(animalLover, praha5).schools.slice(0, 6).flatMap((school) => school.programs.map((program) => program.name));
    expect(names).toContain("Přírodovědné lyceum");
  });

  it("recommends animal programs on the other tracks", () => {
    for (const track of ["any", "maturita", "vyucni"]) {
      const result = recommend({ ...animalLover, track }, praha5);
      expect(result.schools.slice(0, 5).every((school) => school.matchesMain), track).toBe(true);
    }
  });
});

describe("gymnázium track uses real gymnázium profiles", () => {
  it("puts an IT-focused option first for a programming fan", () => {
    const [first] = recommend({ interest: "digital", subject: "digital", workplace: "digital", activity: "digital", track: "general" }).schools;
    expect(first?.matchesMain).toBe(true);
    expect(first?.programs[0]?.categories).toContain("digital");
  });

  it("puts a sport gymnázium first for a sport fan", () => {
    const totals = { ...emptyTotals(), sport: 3 };
    const [first] = rankSchools(summaries, programsById, totals, "general", null, null, null).schools;
    expect(first?.programs[0]?.categories).toContain("sport");
  });

  it("does not treat other programs of a school as the gymnázium's focus", () => {
    const totals = { ...emptyTotals(), business: 5 };
    const result = rankSchools(summaries, programsById, totals, "general", null, null, "business");
    const obchodniAkademie = result.schools.find((school) => school.name.startsWith("Obchodní akademie a Gymnázium Bubeneč"));
    const gymnazium = obchodniAkademie?.programs.find((program) => program.code.startsWith("79-41-K"));
    expect(gymnazium?.categories).not.toContain("business");
  });
});

describe("gymnázium profiles from school names", () => {
  it.each([
    ["1. IT Gymnázium, s.r.o.", ["digital"]],
    ["Sportovní gymnázium, Kladno, Plzeňská 3103", ["sport"]],
    ["Lékařské a přírodovědné GYMNÁZIUM PRIGO PRAHA, s.r.o.", ["science", "nature", "health"]],
    ["Přírodovědné gymnázium", ["science", "nature"]],
    ["Obchodní akademie a Gymnázium Bubeneč", []],
  ])("%s", (name, expected) => {
    expect([...gymnasiumProfile(name)].sort()).toEqual([...expected].sort());
  });

  it("gives the PRIGO gymnázium the health focus on the gymnázium track", () => {
    const totals = { ...emptyTotals(), health: 5 };
    const prigo = rankSchools(summaries, programsById, totals, "general", null, null, "health").schools
      .find((school) => school.name.startsWith("Lékařské a přírodovědné GYMNÁZIUM PRIGO"));
    expect(prigo?.matchesMain).toBe(true);
  });
});

describe("interest order", () => {
  it("breaks ties in favour of the first question's answer", () => {
    const totals = { ...emptyTotals(), digital: 2, nature: 2 };
    expect(rankInterests(totals, "nature")[0]).toBe("nature");
    expect(rankInterests(totals, "digital")[0]).toBe("digital");
  });

  it("ignores interests with no points", () => {
    expect(rankInterests(emptyTotals(), "nature")).toEqual([]);
  });
});

describe("special-needs schools are recognised by name", () => {
  it.each([
    "Gymnázium pro zrakově postižené a Střední odborná škola pro zrakově postižené, Praha 5, Radlická 115",
    "Odborné učiliště pro žáky s více vadami, s.r.o.",
    "Základní škola speciální a Praktická škola, Praha 6, Rooseveltova 8",
    "Střední škola, základní škola a mateřská škola pro sluchově postižené, Praha 5, Holečkova 4",
  ])("%s", (name) => expect(isSpecialNeedsSchool(name)).toBe(true));

  it.each(["Gymnázium Jana Keplera", "Sportovní gymnázium, Kladno, Plzeňská 3103", "Střední odborná škola Jarov"])(
    "not %s",
    (name) => expect(isSpecialNeedsSchool(name)).toBe(false),
  );
});

describe("every possible set of answers", () => {
  const answerSets = allAnswerSets();

  it("covers the whole quiz", () => {
    expect(answerSets.length).toBe(QUESTIONS.reduce((count, question) => count * question.options.length, 1));
  });

  // Every combination without a home; with a home every 7th one (distance only changes the order of equal matches).
  it.each([
    ["without home", null, 1],
    ["from Kladno", kladno, 7],
  ] as const)("holds the recommendation rules %s", (_label, home, stride) => {
    const failures: string[] = [];
    for (const answers of answerSets.filter((_, index) => index % stride === 0)) {
      const track = studyTrack(answers);
      const result = recommend(answers, home);
      const describeCase = JSON.stringify(answers);

      if (track === "any" && result.schools.length === 0) failures.push(`no results: ${describeCase}`);
      for (const school of result.schools) {
        if (isSpecialNeedsSchool(school.name)) failures.push(`special-needs school ${school.name}: ${describeCase}`);
        for (const program of school.programs) {
          if (isNotForNinthGraders(program.code) || !levelAllowed(program, track)) {
            failures.push(`program ${program.code} on track ${track}: ${describeCase}`);
          }
        }
      }
      // If anything serves the main interest, it must come first.
      if (result.schools.some((school) => school.matchesMain) && !result.schools[0]?.matchesMain) {
        failures.push(`main interest not first: ${describeCase}`);
      }
      // The main interest is the strongest one; on a tie it is the first question's answer.
      const totals = computeTotals(answers);
      const primary = primaryInterest(answers);
      const strongest = Math.max(...Object.values(totals));
      if (result.mainInterest && totals[result.mainInterest] !== strongest) failures.push(`weak main interest: ${describeCase}`);
      if (primary && totals[primary] === strongest && result.mainInterest !== primary) {
        failures.push(`tie not resolved by first answer: ${describeCase}`);
      }
      if (failures.length > 20) break;
    }
    expect(failures).toEqual([]);
  }, 300_000);

  it("is deterministic", () => {
    const answers: QuizAnswers = { interest: "people", subject: "general", workplace: "people", activity: "people", track: "any" };
    const first = recommend(answers).schools.map((school) => school.id);
    const second = recommend(answers).schools.map((school) => school.id);
    expect(second).toEqual(first);
  });
});

