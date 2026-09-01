import { getRelativeLocaleUrl } from "astro:i18n";
import {
  localeLabels,
  supportedLocales,
  type LanguageLink,
  type Locale,
  type LocalizedLinks,
} from "./config";

/** Navigation offers a working fallback; SEO only advertises real equivalents. */
export function postLocaleLinks(
  slug: string,
  translations: Partial<Record<Locale, string>>,
): LocalizedLinks {
  const navigation: LanguageLink[] = supportedLocales.map((locale) => {
    const translatedSlug = locale === "en" ? slug : translations[locale];
    return {
      locale,
      label: localeLabels[locale],
      isEquivalent: Boolean(translatedSlug),
      href: translatedSlug
        ? getRelativeLocaleUrl(locale, `posts/${translatedSlug}`)
        : getRelativeLocaleUrl(locale, ""),
    };
  });

  const seo: LanguageLink[] = [
    { locale: "en", label: localeLabels.en, href: getRelativeLocaleUrl("en", `posts/${slug}`) },
    ...supportedLocales
      .filter((locale): locale is Exclude<Locale, "en"> => locale !== "en" && Boolean(translations[locale]))
      .map((locale) => ({
        locale,
        label: localeLabels[locale],
        href: getRelativeLocaleUrl(locale, `posts/${translations[locale]}`),
      })),
  ];

  return { navigation, seo };
}

export function homeLocaleLinks(): LanguageLink[] {
  return supportedLocales.map((locale) => ({
    locale,
    label: localeLabels[locale],
    href: getRelativeLocaleUrl(locale, ""),
    isEquivalent: true,
  }));
}

/** Navigation links for pages without a translated equivalent. */
export function fallbackLocaleLinks(): LanguageLink[] {
  return homeLocaleLinks().map((link) => ({ ...link, isEquivalent: false }));
}
