const countryList = [
  // Anfitriones (CONCACAF)
  ["CA", "Canadá"],
  ["US", "Estados Unidos"],
  ["MX", "México"],
  // CONCACAF adicionales
  ["CW", "Curazao"],
  ["HT", "Haití"],
  ["PA", "Panamá"],
  // CONMEBOL
  ["AR", "Argentina"],
  ["BR", "Brasil"],
  ["CO", "Colombia"],
  ["EC", "Ecuador"],
  ["PY", "Paraguay"],
  ["UY", "Uruguay"],
  // UEFA
  ["DE", "Alemania"],
  ["AT", "Austria"],
  ["BE", "Bélgica"],
  ["CZ", "Chequia"],
  ["SE", "Suecia"],
  ["HR", "Croacia"],
  ["GB-SCT", "Escocia"],
  ["ES", "España"],
  ["FR", "Francia"],
  ["GB-ENG", "Inglaterra"],
  ["BA", "Bosnia y Herzegovina"],
  ["NO", "Noruega"],
  ["NL", "Países Bajos"],
  ["PT", "Portugal"],
  ["CH", "Suiza"],
  ["TR", "Türkiye"],
  // CAF
  ["DZ", "Argelia"],
  ["CV", "Cabo Verde"],
  ["CI", "Costa de Marfil"],
  ["EG", "Egipto"],
  ["GH", "Ghana"],
  ["MA", "Marruecos"],
  ["CD", "Rep. Democrática del Congo"],
  ["SN", "Senegal"],
  ["ZA", "Sudáfrica"],
  ["TN", "Túnez"],
  // AFC
  ["SA", "Arabia Saudí"],
  ["AU", "Australia"],
  ["KR", "Corea del Sur"],
  ["IQ", "Iraq"],
  ["IR", "Irán"],
  ["JP", "Japón"],
  ["JO", "Jordania"],
  ["QA", "Qatar"],
  ["UZ", "Uzbekistán"],
  // OFC
  ["NZ", "Nueva Zelanda"],
];

export const countryCatalog = countryList
  .map(([code, name]) => ({
    code,
    name,
    flagUrl: `https://flagcdn.com/w80/${code.toLowerCase()}.png`,
  }))
  .sort((left, right) => left.name.localeCompare(right.name, "es"));

export const countryCatalogByCode = new Map(countryCatalog.map((country) => [country.code, country]));
