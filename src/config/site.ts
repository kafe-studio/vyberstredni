export const siteConfig = {
  name: "Vyber střední",
  description:
    "Katalog středních škol a konzervatoří z celého Česka, včetně soukromých, církevních a speciálních škol.",
  url: "https://jaknaskolu.cz/vyberstredni/",
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
  /** Donation account; the QR image (QR Platba) encodes the same IBAN. */
  support: {
    account: "670100-2232934629/6210",
    iban: "CZ95 6210 6701 0022 3293 4629",
    qrImage: "/images/support-qr.png",
  },
  /** The project's own profiles (Jak na školu); also the schema.org sameAs links. */
  socialLinks: {
    instagram: "https://www.instagram.com/jaknaskolu/",
    facebook: "https://www.facebook.com/jaknaskolu",
  },
  /** The author's personal profiles, shown next to his name in the footer. */
  authorSocialLinks: {
    instagram: "https://instagram.com/georgeduckling",
    facebook: "https://www.facebook.com/jirikacirekzhostomic",
  },
  /** Other projects by the same author, listed in the footer. Entries without a url are shown as plain text. */
  otherProjects: [
    { name: "SOS Fotograf", description: "foto/grafická pohotovost", url: "https://sosfotograf.cz/" },
    { name: "George Duckling", description: "portál seniorních profesionálů", url: "https://georgeduckling.com/" },
    { name: "Pingupedia", description: "encyklopedie tučňáků pro děti", url: "https://pingupedia.hrava.wiki/" },
    { name: "OnlyPeoples", description: "zábavné testy a kvízy", url: "https://onlypeoples.win/" },
  ],
  /** Main navigation; the quiz is rendered separately as the call-to-action button. */
  navLinks: [
    { text: "Školy", href: "/skoly/" },
    { text: "Obory", href: "/obory/" },
    { text: "Oblíbené", href: "/oblibene/" },
  ],
  quizLink: { text: "Test zájmů", href: "/test/" },
};
