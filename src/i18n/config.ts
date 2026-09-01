// Keep these values URL-safe and use the same identifiers in Astro's i18n
// config, content frontmatter, and hreflang generation.
export const supportedLocales = ["en", "pt-br", "hi", "es", "de", "fr", "ja"] as const;

export type Locale = (typeof supportedLocales)[number];

export interface LanguageLink {
  locale: Locale;
  label: string;
  href: string;
  /** Whether this link points to the equivalent page instead of a locale fallback. */
  isEquivalent?: boolean;
}

export interface LocalizedLinks {
  navigation: LanguageLink[];
  seo: LanguageLink[];
}

export const localeLabels: Record<Locale, string> = {
  en: "English",
  "pt-br": "Português (BR)",
  hi: "हिन्दी",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
};

/** BCP 47 tags used by <html lang>, hreflang, Open Graph, and JSON-LD. */
export const localeTags: Record<Locale, string> = {
  en: "en",
  "pt-br": "pt-BR",
  hi: "hi",
  es: "es",
  de: "de",
  fr: "fr",
  ja: "ja",
};

export const ui = {
  en: {
    openNavigation: "Open navigation",
    sections: "Sections",
    search: "Search documentation…",
    subscribe: "Subscribe",
    sponsor: "Sponsor",
    jobs: "Jobs",
    changeFontSize: "Change font size",
    github: "GitHub",
  },
  "pt-br": {
    openNavigation: "Abrir navegação",
    sections: "Seções",
    search: "Pesquisar documentação…",
    subscribe: "Assinar",
    sponsor: "Apoiar",
    jobs: "Vagas",
    changeFontSize: "Alterar tamanho da fonte",
    github: "GitHub",
  },
  hi: {
    openNavigation: "नेविगेशन खोलें",
    sections: "अनुभाग",
    search: "दस्तावेज़ खोजें…",
    subscribe: "सब्सक्राइब करें",
    sponsor: "सपोर्ट करें",
    jobs: "नौकरियाँ",
    changeFontSize: "फ़ॉन्ट आकार बदलें",
    github: "GitHub",
  },
  es: {
    openNavigation: "Abrir navegación",
    sections: "Secciones",
    search: "Buscar documentación…",
    subscribe: "Suscribirse",
    sponsor: "Apoyar",
    jobs: "Empleos",
    changeFontSize: "Cambiar tamaño de fuente",
    github: "GitHub",
  },
  de: {
    openNavigation: "Navigation öffnen",
    sections: "Abschnitte",
    search: "Dokumentation durchsuchen…",
    subscribe: "Abonnieren",
    sponsor: "Unterstützen",
    jobs: "Jobs",
    changeFontSize: "Schriftgröße ändern",
    github: "GitHub",
  },
  fr: {
    openNavigation: "Ouvrir la navigation",
    sections: "Sections",
    search: "Rechercher dans la documentation…",
    subscribe: "S’abonner",
    sponsor: "Soutenir",
    jobs: "Emplois",
    changeFontSize: "Modifier la taille du texte",
    github: "GitHub",
  },
  ja: {
    openNavigation: "ナビゲーションを開く",
    sections: "セクション",
    search: "ドキュメントを検索…",
    subscribe: "購読する",
    sponsor: "支援する",
    jobs: "求人",
    changeFontSize: "文字サイズを変更",
    github: "GitHub",
  },
} satisfies Record<Locale, Record<string, string>>;

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && supportedLocales.includes(value as Locale));
}

export function localeTag(locale: Locale): string {
  return localeTags[locale];
}
