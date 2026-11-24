import { readHistoryValue, writeHistoryValue } from "./history-state";
import { isCategory, type Category } from "./interest-test";
import { QUESTIONS } from "./quiz-questions";

/**
 * Remembers the interest quiz (answers, home, commute limit, whether results were shown) in this browser only,
 * until the student presses "Resetovat test a bydliště". Nothing is sent anywhere.
 */
const STORAGE_KEY = "vyberstredni-quiz";

export type SavedHome = {
  label: string;
  latitude: number;
  longitude: number;
  /** Region and town select values; empty for a device location. */
  region: string;
  town: string;
};

export type SavedQuiz = {
  answers: Record<string, string>;
  home: SavedHome | null;
  maxDistance: string;
  completed: boolean;
  /** Interests switched off on the results page; cleared whenever the answers change. */
  offInterests: Category[];
};

const validValues = new Map(QUESTIONS.map((question) => [question.id, new Set(question.options.map((option) => option.value))]));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const readHome = (value: unknown): SavedHome | null => {
  if (!isRecord(value)) return null;
  const { label, latitude, longitude, region, town } = value;
  if (typeof label !== "string" || typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    label,
    latitude,
    longitude,
    region: typeof region === "string" ? region : "",
    town: typeof town === "string" ? town : "",
  };
};

/** The saved quiz, with unknown questions or answers (e.g. after the quiz changed) dropped. */
export const loadQuiz = (): SavedQuiz | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const answers: Record<string, string> = {};
    if (isRecord(parsed.answers)) {
      for (const [questionId, value] of Object.entries(parsed.answers)) {
        if (typeof value === "string" && validValues.get(questionId)?.has(value)) answers[questionId] = value;
      }
    }
    const home = readHome(parsed.home);
    const maxDistance = typeof parsed.maxDistance === "string" && /^\d*$/.test(parsed.maxDistance) ? parsed.maxDistance : "";
    const allAnswered = QUESTIONS.every((question) => question.id in answers);
    if (Object.keys(answers).length === 0 && !home) return null;
    const offInterests = Array.isArray(parsed.offInterests)
      ? parsed.offInterests.filter((value): value is Category => typeof value === "string" && isCategory(value))
      : [];
    return { answers, home, maxDistance, completed: parsed.completed === true && allAnswered, offInterests };
  } catch {
    return null;
  }
};

export const saveQuiz = (quiz: SavedQuiz) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quiz));
  } catch {
    // Storage may be unavailable (private mode, blocked site data); the quiz still works for this visit.
  }
};

/** The student's home, shared by the quiz and the school pages. */
export const loadHome = (): SavedHome | null => loadQuiz()?.home ?? null;

/** Changes only the home and keeps the quiz answers; the shown results are recomputed for the new home next time. */
export const saveHome = (home: SavedHome) => {
  const saved = loadQuiz();
  saveQuiz({
    answers: saved?.answers ?? {},
    home,
    maxDistance: saved?.maxDistance ?? "",
    completed: saved?.completed ?? false,
    offInterests: saved?.offInterests ?? [],
  });
};

export const clearQuiz = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  clearResultsView();
};

/**
 * How the results looked when a school was opened from them: sort, number of cards shown and the school.
 * Kept on the results page's history entry, so it comes back only on Back (or a reload), never on a new visit.
 */
export type ResultsView = { sort: string; shown: number; schoolId: string };
const VIEW_KEY = "vyberstredniResultsView";

export const saveResultsView = (view: ResultsView) => {
  writeHistoryValue(VIEW_KEY, view);
};

export const loadResultsView = (): ResultsView | null => {
  const value = readHistoryValue(VIEW_KEY);
  if (!isRecord(value)) return null;
  const { sort, shown, schoolId } = value;
  if (typeof sort !== "string" || typeof schoolId !== "string" || typeof shown !== "number" || !Number.isInteger(shown) || shown < 0) return null;
  return { sort, shown, schoolId };
};

export const clearResultsView = () => {
  writeHistoryValue(VIEW_KEY, undefined);
};
