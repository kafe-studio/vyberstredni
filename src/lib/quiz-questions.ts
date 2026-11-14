import { emptyTotals, isCategory, isStudyTrack, type Category, type StudyTrack } from "./interest-test";
import { isSupportType, type SupportType } from "./special-needs";

export type QuizOption = { value: string; label: string; icon: string };
export type Question = { id: string; prompt: string; hint?: string; weight: number; options: QuizOption[] };

/** The first question names the student's main interest; it breaks ties between equally strong interests. */
export const PRIMARY_QUESTION_ID = "interest";
/** Picks the study track instead of an interest. */
export const TRACK_QUESTION_ID = "track";
/** Optional special support (disability or special educational needs); never stored or sent anywhere. */
export const SUPPORT_QUESTION_ID = "support";

/** Option values are interest categories (see interest-test.ts), except the study track question. */
export const QUESTIONS: readonly Question[] = [
  {
    id: "interest",
    prompt: "Co tě baví nejvíc?",
    hint: "Vyber jednu věc, která tě láká nejvíc.",
    weight: 2,
    options: [
      { value: "digital", label: "Počítače a programování", icon: "💻" },
      { value: "electro", label: "Elektřina a elektronika", icon: "⚡" },
      { value: "engineering", label: "Stroje a práce s kovem", icon: "⚙️" },
      { value: "cars", label: "Auta, motorky a doprava", icon: "🚗" },
      { value: "building", label: "Stavby a stavění", icon: "🧱" },
      { value: "wood", label: "Dřevo a nábytek", icon: "🪵" },
      { value: "science", label: "Chemie a pokusy", icon: "🧪" },
      { value: "nature", label: "Příroda a zvířata", icon: "🌿" },
      { value: "health", label: "Péče o zdraví lidí", icon: "🩺" },
      { value: "beauty", label: "Kadeřnictví a kosmetika", icon: "💇" },
      { value: "safety", label: "Hasiči, policie a armáda", icon: "🚒" },
      { value: "design", label: "Kreslení, foto a design", icon: "🎨" },
      { value: "music", label: "Hudba, tanec a divadlo", icon: "🎵" },
      { value: "fashion", label: "Móda a šití", icon: "🧵" },
      { value: "business", label: "Obchod a peníze", icon: "💼" },
      { value: "languages", label: "Cizí jazyky", icon: "🌍" },
      { value: "hospitality", label: "Vaření, hotely a cestování", icon: "🍳" },
      { value: "people", label: "Práce s dětmi a lidmi", icon: "🤝" },
      { value: "sport", label: "Sport a pohyb", icon: "🏃" },
    ],
  },
  {
    id: "subject",
    prompt: "Který předmět ve škole máš nejradši?",
    weight: 1,
    options: [
      { value: "science", label: "Matematika, fyzika, chemie", icon: "🧮" },
      { value: "nature", label: "Přírodopis", icon: "🐞" },
      { value: "digital", label: "Informatika", icon: "🖱️" },
      { value: "design", label: "Výtvarná výchova", icon: "🖌️" },
      { value: "music", label: "Hudební výchova", icon: "🎵" },
      { value: "languages", label: "Cizí jazyky", icon: "🗣️" },
      { value: "general", label: "Čeština, dějepis, společenské vědy", icon: "📚" },
      { value: "practical", label: "Pracovní činnosti a dílny", icon: "🔨" },
      { value: "sport", label: "Tělocvik", icon: "🏃" },
    ],
  },
  {
    id: "workplace",
    prompt: "Kde by sis představil/a svou práci?",
    weight: 1,
    options: [
      { value: "digital", label: "U počítače", icon: "🖥️" },
      { value: "engineering", label: "V dílně nebo továrně", icon: "🏭" },
      { value: "building", label: "Na stavbě", icon: "🏗️" },
      { value: "cars", label: "V autoservisu nebo za volantem", icon: "🚚" },
      { value: "science", label: "V laboratoři", icon: "🔬" },
      { value: "health", label: "V nemocnici", icon: "🏥" },
      { value: "beauty", label: "V kadeřnictví nebo salonu", icon: "💅" },
      { value: "design", label: "V ateliéru nebo studiu", icon: "📸" },
      { value: "music", label: "Na pódiu", icon: "🎭" },
      { value: "business", label: "V kanceláři nebo obchodě", icon: "🏢" },
      { value: "languages", label: "V zahraničí nebo s cizinci", icon: "✈️" },
      { value: "hospitality", label: "V hotelu nebo restauraci", icon: "🏨" },
      { value: "safety", label: "U hasičů, policie nebo v armádě", icon: "🚒" },
      { value: "people", label: "Ve škole nebo školce", icon: "🏫" },
      { value: "nature", label: "Venku v přírodě", icon: "🌳" },
    ],
  },
  {
    id: "activity",
    prompt: "Co bys dělal/a nejraději?",
    weight: 1,
    options: [
      { value: "practical", label: "Vyrobit něco vlastníma rukama", icon: "🛠️" },
      { value: "wood", label: "Vyrobit něco ze dřeva", icon: "🪚" },
      { value: "design", label: "Vymyslet, jak něco bude vypadat", icon: "✏️" },
      { value: "fashion", label: "Ušít si oblečení", icon: "🪡" },
      { value: "beauty", label: "Udělat někomu účes nebo make-up", icon: "💄" },
      { value: "science", label: "Spočítat a vyřešit úlohu", icon: "🧠" },
      { value: "business", label: "Zorganizovat akci", icon: "📋" },
      { value: "people", label: "Pomoct někomu, kdo to potřebuje", icon: "💬" },
      { value: "nature", label: "Postarat se o zvíře", icon: "🐕" },
      { value: "electro", label: "Zapojit elektriku nebo elektroniku", icon: "🔌" },
      { value: "cars", label: "Opravit auto nebo motorku", icon: "🏍️" },
      { value: "engineering", label: "Opravit rozbitý stroj", icon: "🔧" },
      { value: "languages", label: "Domluvit se s cizincem", icon: "🌐" },
      { value: "music", label: "Zahrát nebo zazpívat", icon: "🎸" },
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
  {
    id: "support",
    prompt: "Potřebuješ ve škole zvláštní podporu?",
    hint: "Například kvůli zdravotnímu postižení. Odpověď zůstává jen v tvém prohlížeči.",
    weight: 0,
    options: [
      { value: "none", label: "Ne, nepotřebuji", icon: "🙂" },
      { value: "visual", label: "Ano – mám zrakové postižení", icon: "👓" },
      { value: "hearing", label: "Ano – mám sluchové postižení", icon: "🦻" },
      { value: "physical", label: "Ano – mám tělesné postižení", icon: "♿" },
      { value: "svp", label: "Ano – jiné speciální vzdělávací potřeby", icon: "🧩" },
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

export const supportNeed = (answers: QuizAnswers): SupportType | null => {
  const value = answers[SUPPORT_QUESTION_ID];
  return value && isSupportType(value) ? value : null;
};
