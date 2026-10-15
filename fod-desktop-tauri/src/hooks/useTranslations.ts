import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import hindi from '../messages/hindi.json';

const languages: Record<string, any> = {
  en,
  fr,
  hindi,
};

// Reactive translator: re-renders when the Redux `language.lang` changes.
// Falls back to English for any key missing in the active locale, and finally
// to the raw key so nothing renders blank.
export function useTranslations(namespace: string) {
  const lang = useSelector((state: RootState) => state.language.lang);
  const active = languages[lang] || languages['en'];
  const nsMessages = active[namespace] || {};
  const enMessages = (languages['en'] as any)[namespace] || {};

  return (key: string) => nsMessages[key] ?? enMessages[key] ?? key;
}
