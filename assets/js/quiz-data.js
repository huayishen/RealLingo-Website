/* Shared, flow-agnostic reference data for the onboarding quiz pages.
   Loaded before quiz-engine.js and before each flow page's own config. */

const LANGUAGES = [
  {key:'arabic',  label:'Arabic', variants:[
    {key:'fusha',     label:'Fusha / MSA'},
    {key:'gulf',      label:'Gulf Arabic'},
    {key:'egyptian',  label:'Egyptian Arabic'},
    {key:'levantine', label:'Levantine Arabic'},
    {key:'maghrebi',  label:'Maghrebi Arabic'},
    {key:'other_ar',  label:'Other variants'},
  ]},
  {key:'chinese', label:'Chinese', variants:[
    {key:'mandarin',  label:'Mandarin Chinese'},
    {key:'cantonese', label:'Cantonese'},
    {key:'taiwanese', label:'Taiwanese Mandarin'},
    {key:'hokkien',   label:'Hokkien / Taiwanese'},
    {key:'other_zh',  label:'Other varieties'},
  ]},
  {key:'korean',  label:'Korean',  variants:[]},
  {key:'french',  label:'French',  variants:[]},
  {key:'spanish', label:'Spanish', variants:[]},
];

const LANG_LEVELS = [
  {k:'beginner',     l:'Beginner'},
  {k:'intermediate', l:'Intermediate'},
  {k:'working',      l:'Working Professional'},
  {k:'fluent',       l:'Fluent'},
  {k:'native',       l:'Native'},
];

const PAIR_LANGUAGES = ['Arabic','Chinese','Korean','French','Spanish','English'];

const CURRENCIES = [
  {g:'Gulf',      opts:[['SAR','Saudi Riyal'],['AED','UAE Dirham'],['QAR','Qatari Riyal'],['KWD','Kuwaiti Dinar'],['BHD','Bahraini Dinar'],['OMR','Omani Rial']]},
  {g:'Asia',      opts:[['CNY','Chinese Yuan'],['SGD','Singapore Dollar'],['KRW','Korean Won']]},
  {g:'Americas',  opts:[['USD','US Dollar'],['CAD','Canadian Dollar']]},
];

const PLATFORMS = [
  {key:'instagram', label:'Instagram',      ph:'@yourhandle'},
  {key:'tiktok',    label:'TikTok',         ph:'@yourhandle'},
  {key:'snapchat',  label:'Snapchat',       ph:'@yourhandle'},
  {key:'youtube',   label:'YouTube',        ph:'Channel name or URL'},
  {key:'red',       label:'RED (Xiaohongshu)', ph:'@yourhandle'},
  {key:'wechat',    label:'WeChat',         ph:'WeChat ID'},
];

const INDUSTRIES = [
  'Technology','Finance','Healthcare','Legal','Marketing','Education',
  'Entertainment','Tourism & Hospitality','Media & Journalism','Government',
  'Non-profit','Retail','Manufacturing','Real Estate','Consulting',
  'Sports','Fashion','Food & Beverage','Aviation','Logistics & Supply Chain',
];

const COUNTRIES = [
  /* Prioritized */
  'China','Saudi Arabia','Korea (South)','Singapore','Egypt','Japan','Algeria','Morocco',
  'Tunisia','Jordan','Lebanon','Syria','Iraq',
  'Afghanistan','Albania','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia',
  'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium',
  'Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria',
  'Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic',
  'Chad','Chile','Colombia','Comoros','Congo (Democratic Republic)','Congo (Republic)',
  'Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica',
  'Dominican Republic','Ecuador','El Salvador','Equatorial Guinea','Eritrea','Estonia',
  'Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana',
  'Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary',
  'Iceland','India','Indonesia','Iran','Ireland','Israel','Italy','Jamaica',
  'Kazakhstan','Kenya','Kiribati','Korea (North)','Kosovo','Kuwait','Kyrgyzstan',
  'Laos','Latvia','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
  'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania',
  'Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Mozambique',
  'Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
  'North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea',
  'Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda',
  'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino',
  'São Tomé and Príncipe','Senegal','Serbia','Seychelles','Sierra Leone',
  'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Sudan','Spain','Sri Lanka',
  'Sudan','Suriname','Sweden','Switzerland','Taiwan','Tajikistan','Tanzania','Thailand',
  'Timor-Leste','Togo','Tonga','Trinidad and Tobago','Turkey','Turkmenistan','Tuvalu',
  'Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
  'Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe'
];

/* The 6 "service provider" professions — shared by the branch-selector
   (Section 2 "I'm hiring..." / Section 3 "I work as..."), the Hire flow's
   own "I'm hiring for..." question, the Join-Us flow's ROLE_DISPLAY, and
   review-page label formatting. `as` is the "I am ___" phrasing used by
   Join-Us; `label` is the plain noun-phrase used everywhere else. */
const SERVICE_ROLES = [
  {key:'tutor',          label:'Tutor',                    as:'a tutor'},
  {key:'translator',     label:'Translator / Interpreter',  as:'a translator / interpreter'},
  {key:'influencer',     label:'Influencer',                as:'an influencer'},
  {key:'tourGuide',      label:'Tour Guide',                as:'a tour guide'},
  {key:'languageEvent',  label:'Event Organizer',           as:'an event organizer'},
  {key:'languageTalent', label:'Language Talent',           as:'a language talent'},
];
