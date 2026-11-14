import { emptyTotals, isCategory, isStudyTrack, type Category, type StudyTrack } from "./interest-test";

export type QuizOption = { value: string; label: string; icon: string };
export type Question = { id: string; prompt: string; hint?: string; weight: number; options: QuizOption[] };

/** The first question names the student's main interest; it breaks ties between equally strong interests. */
export const PRIMARY_QUESTION_ID = "interest";
/** The last question picks the study track instead of an interest. */
export const TRACK_QUESTION_ID = "track";

/** Option values are interest categories (see interest-test.ts), except the study track question. */
export const QUESTIONS: readonly Question[] = [
  {
    id: "interest",
    prompt: "Co tě baví nejvíc?",
    hint: "Vyber jednu věc, která tě láká nejvíc.",
    weight: 2,
    options: [
      { value: "digital", label: "Počítače a programování", icon: "💻" },
      { value: "engineering", label: "Technika, stroje a auta", icon: "⚙️" },
      { value: "nature", label: "Příroda a zvířata", icon: "🌿" },
      { value: "health", label: "Péče o zdraví lidí", icon: "🩺" },
      { value: "design", label: "Kreslení, foto a video", icon: "🎨" },
      { value: "business", label: "Obchod a peníze", icon: "💼" },
      { value: "hospitality", label: "Vaření a cestování", icon: "🍳" },
      { value: "people", label: "Práce s dětmi a lidmi", icon: "🤝" },
    ],
  },
  {
    id: "subject",
    prompt: "Který předmět ve škole máš nejradši?",
    weight: 1,
    options: [
      { value: "science", label: "Matematika, fyzika, chemie", icon: "🧪" },
      { value: "nature", label: "Přírodopis", icon: "🐞" },
      { value: "digital", label: "Informatika", icon: "🖱️" },
      { value: "design", label: "Výtvarka nebo hudebka", icon: "🎵" },
      { value: "general", label: "Jazyky, dějepis, společenské vědy", icon: "📚" },
      { value: "practical", label: "Pracovní činnosti a dílny", icon: "🔨" },
      { value: "sport", label: "Tělocvik a sport", icon: "🏃" },
    ],
  },
  {
    id: "workplace",
    prompt: "Kde by sis představil/a svou práci?",
    weight: 1,
    options: [
      { value: "digital", label: "U počítače", icon: "🖥️" },
      { value: "engineering", label: "V dílně nebo na stavbě", icon: "🏗️" },
      { value: "science", label: "V laboratoři", icon: "🔬" },
      { value: "health", label: "V nemocnici", icon: "🏥" },
      { value: "design", label: "V ateliéru nebo studiu", icon: "📸" },
      { value: "business", label: "V kanceláři nebo obchodě", icon: "🏢" },
      { value: "hospitality", label: "V hotelu nebo restauraci", icon: "🏨" },
      { value: "safety", label: "U hasičů nebo policie", icon: "🚒" },
      { value: "people", label: "Ve škole nebo školce", icon: "🏫" },
      { value: "nature", label: "Venku v přírodě", icon: "🌳" },
    ],
  },
  {
    id: "activity",
    prompt: "Co bys dělal/a nejraději?",
    weight: 1,
    options: [
      { value: "practical", label: "Vyrobit něco vlastníma rukama", icon: "🪚" },
      { value: "design", label: "Vymyslet, jak něco bude vypadat", icon: "✏️" },
      { value: "science", label: "Spočítat a vyřešit úlohu", icon: "🧮" },
      { value: "business", label: "Zorganizovat akci", icon: "📋" },
      { value: "people", label: "Pomoct někomu, kdo to potřebuje", icon: "💬" },
      { value: "nature", label: "Postarat se o zvíře", icon: "🐕" },
      { value: "engineering", label: "Opravit rozbitý stroj", icon: "🔧" },
      { value: "digital", label: "Naprogramovat hru nebo aplikaci", icon: "🎮" },
    ],
  },
  {
    id: "track",
    prompt: "Jakou školu chceš?",
    hint: "Nevadí, když ještě nevíš.",
    weight: 0,
    options: [
      { value: "general", label: "Gymnázium – široký základ, pak vysoká škola", icon: "🎓" },
      { value: "maturita", label: "Odborná škola s maturitou", icon: "📘" },
      { value: "vyucni", label: "Učební obor s výučním listem", icon: "🛠️" },
      { value: "any", label: "Ještě nevím", icon: "🤔" },
    ],
  },
];

export type QuizAnswers = Readonly<Record<string, string | undefined>>;

/** Sums the weighted interest answers. */
export const computeTotals = (answers: QuizAnswers): Record<Category, number> => {
  const totals = emptyTotals();
  for (const question of QUESTIONS) {
    const value = answers[question.id];
    if (value && isCategory(value)) totals[value] += question.weight;
  }
  return totals;
};

export const primaryInterest = (answers: QuizAnswers): Category | null => {
  const value = answers[PRIMARY_QUESTION_ID];
  return value && isCategory(value) ? value : null;
};

export const studyTrack = (answers: QuizAnswers): StudyTrack => {
  const value = answers[TRACK_QUESTION_ID] ?? "any";
  return isStudyTrack(value) ? value : "any";
};
