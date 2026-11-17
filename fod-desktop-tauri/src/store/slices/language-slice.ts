import { createSlice } from '@reduxjs/toolkit';

export interface LanguageStateType {
  lang: 'en' | 'hindi';
}

const getInitialLang = (): 'en' | 'hindi' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('ZOID_LANG');
    if (saved === 'hindi') return 'hindi';
  }
  return 'en';
};

const initialState: LanguageStateType = {
  lang: getInitialLang(),
};

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {
    setLanguage(state, action) {
      const next: 'en' | 'hindi' = action.payload === 'hindi' ? 'hindi' : 'en';
      if (typeof window !== 'undefined') {
        localStorage.setItem('ZOID_LANG', next);
      }
      state.lang = next;
    },
  },
});

export const { setLanguage } = languageSlice.actions;
export default languageSlice.reducer;