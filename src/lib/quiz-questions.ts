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
    prompt: "Co tě fakt baví?",
    hint: "Vyber jednu věc, u které zapomeneš na čas.",
    weight: 2,
    options: [
      { value: "digital", label: "Hry, apky a programování", icon: "💻" },
      { value: "electro", label: "Elektronika a všechno s dráty", icon: "⚡" },
      { value: "engineering", label: "Stroje, kov a svařování", icon: "⚙️" },
      { value: "cars", label: "Auta, motorky a všechno, co jezdí", icon: "🚗" },
      { value: "building", label: "Stavění a baráky", icon: "🧱" },
      { value: "wood", label: "Dřevo a výroba nábytku", icon: "🪵" },
      { value: "science", label: "Chemie a pokusy v laborce", icon: "🧪" },
      { value: "nature", label: "Zvířata a příroda", icon: "🌿" },
      { value: "health", label: "Zdravotnictví a první pomoc", icon: "🩺" },
      { value: "beauty", label: "Vlasy, nehty a make-up", icon: "💇" },
      { value: "safety", label: "Hasiči, policie a armáda", icon: "🚒" },
      { value: "design", label: "Kreslení, foto, editování a design", icon: "🎨" },
      { value: "music", label: "Hudba, tanec a herectví", icon: "🎵" },
      { value: "fashion", label: "Móda, outfity a šití", icon: "🧵" },
      { value: "business", label: "Byznys a peníze", icon: "💼" },
      { value: "languages", label: "Angličtina a další jazyky", icon: "🌍" },
      { value: "hospitality", label: "Vaření, jídlo a cestování", icon: "🍳" },
      { value: "people", label: "Lidi a práce s dětmi", icon: "🤝" },
      { value: "sport", label: "Sport, posilka a pohyb", icon: "🏃" },
    ],
  },
  {
    id: "subject",
    prompt: "Na který předmět se ve škole aspoň trochu těšíš?",
    hint: "Klidně i na ten nejmíň otravný.",
    weight: 1,
    options: [
      { value: "science", label: "Matika, fyzika, chemie", icon: "🧮" },
      { value: "nature", label: "Přírodopis", icon: "🐞" },
      { value: "digital", label: "Informatika", icon: "🖱️" },
      { value: "design", label: "Výtvarka", icon: "🖌️" },
      { value: "music", label: "Hudebka", icon: "🎵" },
      { value: "languages", label: "Angličtina nebo jiný jazyk", icon: "🗣️" },
      { value: "general", label: "Čeština, děják, občanka", icon: "📚" },
      { value: "practical", label: "Pracovky a dílny", icon: "🔨" },
      { value: "sport", label: "Tělák", icon: "🏃" },
    ],
  },
  {
    id: "workplace",
    prompt: "Kde by ses viděl/a za pár let v práci?",
    weight: 1,
    options: [
      { value: "digital", label: "U počítače, klidně z domova", icon: "🖥️" },
      { value: "engineering", label: "V dílně nebo ve fabrice", icon: "🏭" },
      { value: "building", label: "Na stavbě", icon: "🏗️" },
      { value: "cars", label: "V servisu nebo za volantem", icon: "🚚" },
      { value: "science", label: "V laborce", icon: "🔬" },
      { value: "health", label: "V nemocnici nebo na záchrance", icon: "🏥" },
      { value: "beauty", label: "Ve vlastním salonu", icon: "💅" },
      { value: "design", label: "V ateliéru nebo studiu", icon: "📸" },
      { value: "music", label: "Na pódiu", icon: "🎭" },
      { value: "business", label: "V kanclu nebo v obchodě", icon: "🏢" },
      { value: "languages", label: "Někde v zahraničí", icon: "✈️" },
      { value: "hospitality", label: "V restauraci nebo hotelu", icon: "🏨" },
      { value: "safety", label: "U hasičů, policie nebo v armádě", icon: "🚒" },
      { value: "people", label: "Ve škole, školce nebo na táboře", icon: "🏫" },
      { value: "nature", label: "Venku, hlavně ne zavřený/á uvnitř", icon: "🌳" },
    ],
  },
  {
    id: "activity",
    prompt: "Co bys klidně dělal/a celé odpoledne?",
    weight: 1,
    options: [
      { value: "practical", label: "Vyrobit něco vlastníma rukama", icon: "🛠️" },
      { value: "wood", label: "Vyrobit něco ze dřeva", icon: "🪚" },
      { value: "design", label: "Vymyslet design, logo nebo plakát", icon: "✏️" },
      { value: "fashion", label: "Předělat si oblečení nebo něco ušít", icon: "🪡" },
      { value: "beauty", label: "Udělat někomu vlasy, nehty nebo make-up", icon: "💄" },
      { value: "science", label: "Vyřešit těžkou úlohu nebo hádanku", icon: "🧠" },
      { value: "business", label: "Zorganizovat akci nebo výlet pro partu", icon: "📋" },
      { value: "people", label: "Pomoct někomu, kdo to zrovna potřebuje", icon: "💬" },
      { value: "nature", label: "Starat se o zvíře", icon: "🐕" },
      { value: "electro", label: "Rozebrat a zapojit nějakou elektroniku", icon: "🔌" },
      { value: "cars", label: "Vrtat se v autě nebo motorce", icon: "🏍️" },
      { value: "engineering", label: "Opravit něco, co nejde", icon: "🔧" },
      { value: "languages", label: "Pokecat s někým anglicky", icon: "🌐" },
      { value: "music", label: "Hrát, zpívat nebo tancovat", icon: "🎸" },
      { value: "digital", label: "Udělat vlastní hru nebo apku", icon: "🎮" },
    ],
  },
  {
    id: "track",
    prompt: "Jakou školu bys chtěl/a?",
    hint: "Ještě to nevíš? V pohodě, to má spousta lidí.",
    weight: 0,
    options: [
      { value: "general", label: "Gympl a potom vejška", icon: "🎓" },
      { value: "maturita", label: "Obor s maturitou, kde se naučím něco konkrétního", icon: "📘" },
      { value: "vyucni", label: "Učňák s výučním listem, hlavně prakticky", icon: "🛠️" },
      { value: "any", label: "Fakt nevím", icon: "🤔" },
    ],
  },
  {
    id: "support",
    prompt: "Potřebuješ ve škole nějakou podporu navíc?",
    hint: "Třeba kvůli zdravotnímu postižení. Odpověď zůstane jen v tvém prohlížeči, nikam ji neposíláme.",
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
