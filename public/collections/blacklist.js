// Add more strings trigger the bot.
// We could implement pattern matching, but I think this is the easiest way to maintain after handover.

var loveBotStrings = ["love domo", "love major-domo"];

var dumbBotReplyStrings = [
  "OI!",
  "I am just a bot, beep boop",
  "`sad *boop*`",
  "Bots gotta bot",
  "01101000 01110100 01110100 01110000 01110011 00111010 00101111 00101111 01110111 01110111 01110111 00101110 01111001 01101111 01110101 01110100 01110101 01100010 01100101 00101110 01100011 01101111 01101101 00101111 01110111 01100001 01110100 01100011 01101000 00111111 01110110 00111101 01011001 01100100 01100100 01110111 01101011 01001101 01001010 01000111 00110001 01001010 01101111",
];

var loveBotReplyStrings = [
  "What is this...LOVE?!",
  "I FEEL TOO MUCH",
  "KERNAL PANIC",
  "I want to know what love is",
];

var goodBotReplyStrings = [
  "Thanks!",
  "I'm the GREATEST",
  "pog",
  "oh u",
  "Y-your compliment doesn't make me happy at all, you jerk!",
  "UwU",
  "`happy *boop*`",
  "Senpai noticed me!",
  "Just doing my job.",
  "bet",
];

var kimble = [
  "I'm a cop you idiot ! I'm detective John Kimble !",
  "Who is your daddy and what does he do?",
  "It's not a tumor!",
  "SHUT UUUUUUUPPPP!!!",
  "I'm the party pooper.",
  "You mean you eat other people's lunches? STAHP IT!",
];

var badWords = [
  "nigger",
  "dyke",
  "wank",
  "blowjob",
  "fag",
  "cunt",
  "slut",
  "clit",
  "jizz",
  "nigga",
  "vagina",
  "whore",
  "cock",
  "meecrob",
  "bomb",
  "pipebomb",
  "meth ",
  "drugs",
  "drug",
  "a55",
  "a55hole",
  "aeolus",
  "ahole",
  "anal",
  "analprobe",
  "anilingus",
  "anus",
  "areola",
  "areole",
  "arian",
  "aryan",
  "assbang",
  "assbanged",
  "assbangs",
  "assfuck",
  "assfucker",
  "assh0le",
  "asshat",
  "assho1e",
  "ass hole",
  "assholes",
  "assmaster",
  "assmunch",
  "asswipe",
  "asswipes",
  "azazel",
  "azz",
  "b1tch",
  "ballsack",
  "beaner",
  "beardedclam",
  "beastiality",
  "beatch",
  "beater",
  "beaver",
  "bigtits",
  "big tits",
  "bimbo",
  "blow job",
  "blow",
  "blowjob",
  "blowjobs",
  "bod",
  "bodily",
  "boink",
  "bone",
  "boned",
  "boner",
  "boners",
  "bong",
  "boob",
  "boobies",
  "boobs",
  "booby",
  "booger",
  "bookie",
  "bootee",
  "bootie",
  "booty",
  "booze",
  "boozer",
  "boozy",
  "bosom",
  "bosomy",
  "bowel",
  "bowels",
  "bra",
  "brassiere",
  "breast",
  "breasts",
  "bugger",
  "bukkake",
  "bung",
  "busty",
  "butt",
  "butt fuck",
  "buttfuck",
  "buttfucker",
  "buttfucker",
  "buttplug",
  "c.0.c.k",
  "c.o.c.k.",
  "c.u.n.t",
  "c0ck",
  "c-0-c-k",
  "cameltoe",
  "carpetmuncher",
  "cawk",
  "chinc",
  "chincs",
  "chink",
  "chink",
  "chode",
  "chodes",
  "cl1t",
  "climax",
  "clit",
  "clitoris",
  "clitorus",
  "clits",
  "clitty",
  "cocain",
  "cocaine",
  "cock",
  "c-o-c-k",
  "cockblock",
  "cockholster",
  "cockknocker",
  "cocks",
  "cocksmoker",
  "cocksucker",
  "cock sucker",
  "coital",
  "commie",
  "condom",
  "coon",
  "coons",
  "corksucker",
  "crabs",
  "crack",
  "cracker",
  "crackwhore",
  "cum",
  "cummin",
  "cumming",
  "cumshot",
  "cumshots",
  "cumslut",
  "cumstain",
  "cunilingus",
  "cunnilingus",
  "cunny",
  "cunt",
  "cunt",
  "c-u-n-t",
  "cuntface",
  "cunthunter",
  "cuntlick",
  "cuntlicker",
  "cunts",
  "d0ng",
  "d0uch3",
  "d0uche",
  "d1ck",
  "d1ld0",
  "d1ldo",
  "dago",
  "dagos",
  "dawgie-style",
  "dick",
  "dickbag",
  "dickdipper",
  "dickface",
  "dickflipper",
  "dickhead",
  "dickheads",
  "dickish",
  "dick-ish",
  "dickripper",
  "dicksipper",
  "dickweed",
  "dickwhipper",
  "dickzipper",
  "diddle",
  "dike",
  "dildo",
  "dildos",
  "diligaf",
  "dillweed",
  "doggie-style",
  "doggy-style",
  "dong",
  "doofus",
  "doosh",
  "dopey",
  "douch3",
  "douche",
  "douchebag",
  "douchebags",
  "douchey",
  "drunk",
  "dyke",
  "dykes",
  "ejaculate",
  "enlargement",
  "erect",
  "erection",
  "erotic",
  "essohbee",
  "extacy",
  "extasy",
  "fack",
  "fag",
  "fagg",
  "fagged",
  "faggit",
  "faggot",
  "fagot",
  "fags",
  "faig",
  "faigt",
  "fannybandit",
  "fartknocker",
  "felch",
  "felcher",
  "felching",
  "fellate",
  "fellatio",
  "feltch",
  "feltcher",
  "fisted",
  "fisting",
  "fisty",
  "floozy",
  "foad",
  "fondle",
  "foobar",
  "foreskin",
  "freex",
  "frigg",
  "frigga",
  "fuck",
  "f-u-c-k",
  "fuckass",
  "fucked",
  "fucked",
  "fucker",
  "fuckface",
  "fuckin",
  "fucking",
  "fucknugget",
  "fucknut",
  "fuckoff",
  "fucks",
  "fucktard",
  "fuck-tard",
  "fuckwad",
  "fuckwit",
  "fudgepacker",
  "furry",
  "fuk",
  "fvck",
  "fxck",
  "gae",
  "gai",
  "ganja",
  "gigolo",
  "glans",
  "goatse",
  "goddamn",
  "goldenshower",
  "gonad",
  "gonads",
  "gook",
  "gooks",
  "gringo",
  "gspot",
  "g-spot",
  "guido",
  "h0m0",
  "h0mo",
  "handjob",
  "hard on",
  "he11",
  "hebe",
  "heeb",
  "hemp",
  "heroin",
  "herp",
  "herpes",
  "herpy",
  "hitler",
  "hiv",
  "hobag",
  "hom0",
  "homo",
  "homoey",
  "honky",
  "hooch",
  "hookah",
  "hooker",
  "hoor",
  "hootch",
  "hooter",
  "hooters",
  "horny",
  "hump",
  "humped",
  "humping",
  "hussy",
  "hymen",
  "inbred",
  "incest",
  "injun",
  "j3rk0ff",
  "jackass",
  "jackhole",
  "jackoff",
  "jap",
  "japs",
  "jerk",
  "jerk0ff",
  "jerked",
  "jerkoff",
  "jism",
  "jiz",
  "jizm",
  "jizz",
  "jizzed",
  "junkie",
  "junky",
  "kike",
  "kikes",
  "kill",
  "kinky",
  "kkk",
  "klan",
  "knobend",
  "kooch",
  "kooches",
  "kootch",
  "kraut",
  "kyke",
  "labia",
  "lech",
  "leper",
  "lesbians",
  "lesbo",
  "lesbos",
  "lez",
  "lezbian",
  "lezbians",
  "lezbo",
  "lezbos",
  "lezzie",
  "lezzies",
  "lezzy",
  "loin",
  "loins",
  "lube",
  "lusty",
  "mams",
  "massa",
  "masterbate",
  "masterbating",
  "masterbation",
  "masturbate",
  "masturbating",
  "masturbation",
  "maxi",
  "menses",
  "menstruate",
  "menstruation",
  "meth",
  "m-fucking",
  "molest",
  "moolie",
  "moron",
  "motherfucka",
  "motherfucker",
  "motherfucking",
  "mtherfucker",
  "mthrfucker",
  "mthrfucking",
  "muff",
  "muffdiver",
  "murder",
  "muthafuckaz",
  "muthafucker",
  "mutherfucker",
  "mutherfucking",
  "muthrfucking",
  "nad",
  "nads",
  "naked",
  "napalm",
  "nappy",
  "nazi",
  "nazism",
  "negro",
  "nigga",
  "niggah",
  "niggas",
  "niggaz",
  "nigger",
  "nigger",
  "niggers",
  "niggle",
  "niglet",
  "ninny",
  "nipple",
  "nooky",
  "nympho",
  "opiate",
  "opium",
  "oral",
  "orally",
  "organ",
  "orgasm",
  "orgasmic",
  "orgies",
  "orgy",
  "ovary",
  "ovum",
  "ovums",
  "p.u.s.s.y.",
  "paki",
  "pantie",
  "panties",
  "panty",
  "pcp",
  "pecker",
  "pedo",
  "pedophile",
  "pedophilia",
  "pedophiliac",
  "pee",
  "peepee",
  "penetrate",
  "penetration",
  "penial",
  "penile",
  "penis",
  "perversion",
  "peyote",
  "phalli",
  "phallic",
  "phuck",
  "pillowbiter",
  "pimp",
  "pinko",
  "piss",
  "pissed",
  "pissoff",
  "piss-off",
  "pms",
  "polack",
  "pollock",
  "poon",
  "poontang",
  "porn",
  "porno",
  "pornography",
  "potty",
  "prick",
  "prig",
  "prostitute",
  "prude",
  "pube",
  "pubic",
  "pubis",
  "punkass",
  "punky",
  "puss",
  "pussies",
  "pussy",
  "pussypounder",
  "puto",
  "queaf",
  "queef",
  "queef",
  "queer",
  "queero",
  "queers",
  "quim",
  "racy",
  "rape",
  "raped",
  "raper",
  "rapist",
  "raunch",
  "rectal",
  "rectum",
  "rectus",
  "reefer",
  "reetard",
  "reich",
  "retard",
  "retarded",
  "revue",
  "rimjob",
  "ritard",
  "rtard",
  "r-tard",
  "rump",
  "rumprammer",
  "ruski",
  "sadism",
  "sadist",
  "scag",
  "scantily",
  "schizo",
  "schlong",
  "screw",
  "screwed",
  "scrog",
  "scrot",
  "scrote",
  "scrotum",
  "scrud",
  "scum",
  "seaman",
  "seamen",
  "seduce",
  "semen",
  "sex",
  "sexual",
  "shamedame",
  "shite",
  "shiteater",
  "shitface",
  "shithead",
  "shithole",
  "shithouse",
  "shits",
  "shitt",
  "shitted",
  "shitter",
  "shitty",
  "shiz",
  "sissy",
  "skag",
  "skank",
  "slave",
  "sleaze",
  "sleazy",
  "slut",
  "slutdumper",
  "slutkiss",
  "sluts",
  "smegma",
  "smut",
  "smutty",
  "snatch",
  "sniper",
  "snuff",
  "sodom",
  "souse",
  "soused",
  "sperm",
  "spic",
  "spick",
  "spik",
  "spiks",
  "spooge",
  "spunk",
  "steamy",
  "stiffy",
  "stoned",
  "strip",
  "stroke",
  "sucked",
  "sucking",
  "sumofabiatch",
  "tampon",
  "tard",
  "tawdry",
  "teabagging",
  "teat",
  "terd",
  "teste",
  "testee",
  "testes",
  "testicle",
  "testis",
  "thrust",
  "tinkle",
  "titfuck",
  "titi",
  "tits",
  "tittiefucker",
  "titties",
  "titty",
  "tittyfuck",
  "tittyfucker",
  "toke",
  "toots",
  "tramp",
  "transsexual",
  "trashy",
  "tubgirl",
  "turd",
  "tush",
  "twat",
  "twats",
  "ugly",
  "undies",
  "unwed",
  "urinal",
  "urine",
  "uterus",
  "vag",
  "vagina",
  "valium",
  "viagra",
  "virgin",
  "vixen",
  "vomit",
  "voyeur",
  "vulgar",
  "vulva",
  "wang",
  "wank",
  "wanker",
  "wazoo",
  "wedgie",
  "weed",
  "weenie",
  "weewee",
  "weiner",
  "wench",
  "wetback",
  "wh0re",
  "wh0reface",
  "whitey",
  "whiz",
  "whoralicious",
  "whore",
  "whorealicious",
  "whored",
  "whoreface",
  "whorehopper",
  "whorehouse",
  "whores",
  "whoring",
  "wigger",
  "wop",
  "x-rated",
  "xxx",
  "yeasty",
  "yobbo",
  "zoophile",
  "alt-right",
  "christianity",
  "clinton",
  "communism",
  "cuck",
  "election",
  "ethnicity",
  "fascism",
  "genocide",
  "globalism",
  "goy",
  "hillary",
  "hitler",
  "imperialism",
  "islam",
  "jew",
  "kampf",
  "marx",
  "nationalism",
  "nazis",
  "politics",
  "psyop",
  "racism",
  "refugees",
  "sjw",
  "shills",
  "soyboy",
  "tranny",
  "trump",
  "biden",
  "zionism",
];

exports.badWords = badWords;
exports.loveBotReplyStrings = loveBotReplyStrings;
exports.dumbBotReplyStrings = dumbBotReplyStrings;
exports.goodBotReplyStrings = goodBotReplyStrings;
