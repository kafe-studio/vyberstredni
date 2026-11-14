import { describe, expect, it } from "vitest";
import { catalogPrograms, schools, toSchoolSummary } from "../data/schools";
import {
  emptyTotals,
  gymnasiumProfile,
  isNotForNinthGraders,
  programLevel,
  rankInterests,
  rankSchools,
  type HomeLocation,
  type StudyTrack,
} from "./interest-test";
import { QUESTIONS, computeTotals, primaryInterest, studyTrack, supportNeed, type QuizAnswers } from "./quiz-questions";
import { classifySupport, isPlacementInstitution, type SupportType } from "./special-needs";
import { REGIONS } from "./regions";
import towns from "../data/towns.json";

const summaries = schools.map(toSchoolSummary);
const programsById = Object.fromEntries(schools.map((school) => [school.id, catalogPrograms(school.programs)]));
const praha5: HomeLocation = { label: "Praha – západ", latitude: 50.0491, longitude: 14.3524 };
const kladno: HomeLocation = { label: "Kladno", latitude: 50.1474, longitude: 14.1028 };
const brno: HomeLocation = { label: "Brno", latitude: 49.1951, longitude: 16.6068 };

const recommend = (answers: QuizAnswers, home: HomeLocation | null = null, maxDistanceKm: number | null = null) =>
  rankSchools({
    schools: summaries,
    programsById,
    totals: computeTotals(answers),
    track: studyTrack(answers),
    home,
    maxDistanceKm,
    primaryInterest: primaryInterest(answers),
    support: supportNeed(answers),
  });

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
 * - "výuční list" means level H; E (programs for pupils with special needs) and C (praktická škola) only for
 *   students who asked for special support,
 * - J is never offered.
 * A school for the student's own kind of support may show any of its programs (there are only a few such schools).
 */
const levelAllowed = (program: { code: string; name: string }, track: StudyTrack, support: SupportType | null) => {
  const level = programLevel(program.code);
  if (level === "J") return false;
  if ((level === "E" || level === "C") && support !== "svp") return false;
  if (track === "general") return /gymnázium|lyceum/i.test(program.name);
  if (track === "maturita") return ["M", "L", "P"].includes(level) && !/gymnázium/i.test(program.name);
  if (track === "vyucni") return ["H", "E", "C"].includes(level);
  return true;
};

describe("reported case: animal-loving student", () => {
  const animalLover: QuizAnswers = {
    interest: "nature",
    subject: "general",
    workplace: "nature",
    activity: "nature",
    track: "general",
    support: "none",
  };

  it("never shows a school for pupils with disabilities", () => {
    for (const home of [null, praha5, kladno, brno]) {
      const special = recommend(animalLover, home).schools.filter((school) => school.support !== null);
      expect(special.map((school) => school.name), `home ${home?.label ?? "none"}`).toEqual([]);
    }
  });

  it("starts with a school that serves the main interest, even on the gymnázium track", () => {
    for (const home of [null, praha5, kladno, brno]) {
      const result = recommend(animalLover, home);
      expect(result.mainInterest).toBe("nature");
      expect(result.schools[0]?.matchesMain, `home ${home?.label ?? "none"}`).toBe(true);
      expect(result.schools[0]?.programs[0]?.categories).toContain("nature");
    }
  });

  it("offers a přírodovědné lyceum near the top", () => {
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

describe("whole Czech Republic", () => {
  it("covers all 14 regions", () => {
    expect(new Set(summaries.map((school) => school.region)).size).toBe(14);
  });

  it("offers home towns for every region, under the site's region names", () => {
    const townRegions = new Set(towns.map((town) => town.region));
    expect([...townRegions].sort()).toEqual([...REGIONS].sort());
  });

  it("recommends schools near Brno for a student from Brno", () => {
    const result = recommend({ interest: "digital", subject: "digital", workplace: "digital", activity: "digital", track: "maturita", support: "none" }, brno);
    const first = result.schools[0];
    expect(first?.matchesMain).toBe(true);
    expect(first?.distanceKm ?? Number.POSITIVE_INFINITY).toBeLessThan(30);
  });
});

describe("special support", () => {
  const base: QuizAnswers = { interest: "business", subject: "general", workplace: "business", activity: "people", track: "any" };

  it.each(["visual", "hearing", "physical"] as const)("lists every %s school first", (support) => {
    const expected = summaries.filter((school) => school.support === support && !isPlacementInstitution(school.name)).map((school) => school.id);
    const result = recommend({ ...base, support }, praha5);
    // The leading group of support matches (for SVP it also holds mainstream schools whose best program is E/C level).
    const firstMainstream = result.schools.findIndex((school) => !school.supportMatch);
    const leading = firstMainstream === -1 ? result.schools : result.schools.slice(0, firstMainstream);
    const firstIds = leading.map((school) => school.id);
    // All schools for this support are present and ahead of mainstream schools.
    for (const id of expected) {
      const schoolPrograms = programsById[id] ?? [];
      const offersSomething = schoolPrograms.some((program) => !program.isPhasingOut && !isNotForNinthGraders(program.code) && programLevel(program.code) !== "J");
      if (offersSomething) expect(firstIds, id).toContain(id);
    }
    expect(result.schools.every((school) => school.support === null || school.support === support)).toBe(true);
  });

  it("shows the gymnázium for visually impaired pupils to a visually impaired student", () => {
    const result = recommend({ ...base, track: "general", support: "visual" }, praha5);
    expect(result.schools[0]?.name).toMatch(/pro zrakově postižené/i);
    expect(result.schools[0]?.supportMatch).toBe(true);
  });

  it("does not show schools for another kind of support", () => {
    const result = recommend({ ...base, support: "hearing" }, praha5);
    expect(result.schools.some((school) => school.support === "visual")).toBe(false);
  });

  it("never recommends institutions where pupils are placed by a court", () => {
    for (const support of ["none", "svp"]) {
      for (const track of ["any", "vyucni"]) {
        const names = recommend({ ...base, interest: "practical", activity: "practical", track, support }).schools.map((school) => school.name);
        expect(names.filter((name) => isPlacementInstitution(name)), `${support}/${track}`).toEqual([]);
      }
    }
  });

  it("puts SVP schools that match the interests first for a student with special educational needs", () => {
    const result = recommend({ interest: "hospitality", subject: "practical", workplace: "hospitality", activity: "practical", track: "vyucni", support: "svp" }, praha5);
    expect(result.schools[0]?.supportMatch).toBe(true);
    expect(result.schools[0]?.score).toBeGreaterThan(0);
  });

  it("offers E-level programs to visually impaired students only at schools for them", () => {
    const result = recommend({ ...base, track: "vyucni", support: "visual" });
    const eAtMainstream = result.schools.filter((school) => school.support === null)
      .flatMap((school) => school.programs.filter((program) => programLevel(program.code) === "E"));
    expect(eAtMainstream).toEqual([]);
  });

  it("offers E-level programs and praktická škola only with special educational needs", () => {
    const levels = (support: string) => new Set(recommend({ ...base, track: "vyucni", support }).schools
      .flatMap((school) => school.programs.map((program) => programLevel(program.code))));
    expect(levels("none").has("E")).toBe(false);
    expect(levels("svp").has("E")).toBe(true);
  });
});

describe("gymnázium track uses real gymnázium profiles", () => {
  it("puts an IT-focused option first for a programming fan", () => {
    const [first] = recommend({ interest: "digital", subject: "digital", workplace: "digital", activity: "digital", track: "general", support: "none" }).schools;
    expect(first?.matchesMain).toBe(true);
    expect(first?.programs[0]?.categories).toContain("digital");
  });

  it("puts a sport gymnázium first for a sport fan", () => {
    const totals = { ...emptyTotals(), sport: 3 };
    const [first] = rankSchools({ schools: summaries, programsById, totals, track: "general" }).schools;
    expect(first?.programs[0]?.categories).toContain("sport");
  });

  it("does not treat other programs of a school as the gymnázium's focus", () => {
    const totals = { ...emptyTotals(), business: 5 };
    const result = rankSchools({ schools: summaries, programsById, totals, track: "general", primaryInterest: "business" });
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
    const prigo = rankSchools({ schools: summaries, programsById, totals, track: "general", primaryInterest: "health" }).schools
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

describe("special-needs schools are recognised", () => {
  it.each([
    ["Gymnázium pro zrakově postižené a Střední odborná škola pro zrakově postižené, Praha 5, Radlická 115", "visual"],
    ["Střední škola, základní škola a mateřská škola pro sluchově postižené, Praha 5, Holečkova 4", "hearing"],
    ["Jedličkův ústav a Mateřská škola a Základní škola a Střední škola", "physical"],
    ["Odborné učiliště pro žáky s více vadami, s.r.o.", "svp"],
    ["Základní škola speciální a Praktická škola, Praha 6, Rooseveltova 8", "svp"],
  ])("%s", (name, expected) => expect(classifySupport(name, ["79-41-K/41"])).toBe(expected));

  it("treats a school with only E/C programs as an SVP school", () => {
    expect(classifySupport("Střední odborné učiliště", ["41-52-E/02", "78-62-C/02"])).toBe("svp");
  });

  it.each(["Gymnázium Jana Keplera", "Sportovní gymnázium, Kladno, Plzeňská 3103", "Střední odborná škola Jarov"])(
    "not %s",
    (name) => expect(classifySupport(name, ["79-41-K/41", "41-52-H/01"])).toBeNull(),
  );
});

describe("sampled sets of answers", () => {
  const answerSets = allAnswerSets();

  it("covers the whole quiz", () => {
    expect(answerSets.length).toBe(QUESTIONS.reduce((count, question) => count * question.options.length, 1));
  });

  // A regular sample of all combinations; the strides are coprime with every question's option count,
  // so each track, support and main interest appears many times.
  it.each([
    ["without home", null, 13],
    ["from Brno", brno, 31],
  ] as const)("holds the recommendation rules %s", (_label, home, stride) => {
    const failures: string[] = [];
    for (const answers of answerSets.filter((_, index) => index % stride === 0)) {
      const track = studyTrack(answers);
      const support = supportNeed(answers);
      const result = recommend(answers, home);
      const describeCase = JSON.stringify(answers);

      if (track === "any" && result.schools.length === 0) failures.push(`no results: ${describeCase}`);
      for (const school of result.schools) {
        if (school.support !== null && school.support !== support) {
          failures.push(`school for other support ${school.name}: ${describeCase}`);
        }
        const ownSupportSchool = support !== null && school.support === support;
        for (const program of school.programs) {
          if (isNotForNinthGraders(program.code) || (!ownSupportSchool && !levelAllowed(program, track, support))) {
            failures.push(`program ${program.code} on track ${track}: ${describeCase}`);
          }
        }
      }
      // Schools for the requested support come first; after them, main-interest schools first.
      const firstNonSupport = result.schools.findIndex((school) => !school.supportMatch);
      if (firstNonSupport >= 0 && result.schools.slice(firstNonSupport).some((school) => school.supportMatch)) {
        failures.push(`support schools not first: ${describeCase}`);
      }
      const mainstream = result.schools.filter((school) => !school.supportMatch);
      if (mainstream.some((school) => school.matchesMain) && !mainstream[0]?.matchesMain) {
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
    const answers: QuizAnswers = { interest: "people", subject: "general", workplace: "people", activity: "people", track: "any", support: "none" };
    const first = recommend(answers).schools.map((school) => school.id);
    const second = recommend(answers).schools.map((school) => school.id);
    expect(second).toEqual(first);
  });
});
