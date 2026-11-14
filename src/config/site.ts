export const siteConfig = {
  name: "Vyber střední",
  description:
    "Najdi střední školu, která ti sedí. Prohlédni si oficiální katalog škol a konzervatoří v Praze a Středočeském kraji, včetně soukromých škol.",
  url: "https://georgeduckling.com/vyberstredni/",
  lang: "cs",
  locale: "cs_CZ",
  author: "Jiří Kačírek",
  /** Project operator, shown with the contact details in the footer. */
  operator: { name: "George Duckling", url: "https://georgeduckling.com/" },
  twitter: "",
  ogImage: "/og-image.png",
  phone: "+420 739 238 874",
  email: "kacirek.jiri@gmail.com",
  address: "",
  socialLinks: {
    instagram: "https://instagram.com/georgeduckling",
    facebook: "https://facebook.com/georgeduckling",
  },
  /** Other projects by the same author, listed in the footer. Entries without a url are shown as plain text. */
  otherProjects: [
    { name: "SOS Fotograf", description: "foto/grafická pohotovost", url: "https://sosfotograf.cz/" },
    { name: "George Duckling", description: "portál seniorních profesionálů", url: "https://georgeduckling.com/" },
    { name: "Pingupedia", description: "", url: "" },
    { name: "OnlyPeoples", description: "", url: "" },
  ],
  /** Main navigation; the quiz is rendered separately as the call-to-action button. */
  navLinks: [
    { text: "Školy", href: "/skoly/" },
    { text: "Obory", href: "/obory/" },
    { text: "Oblíbené", href: "/oblibene/" },
  ],
  quizLink: { text: "Test zájmů", href: "/test/" },
};
