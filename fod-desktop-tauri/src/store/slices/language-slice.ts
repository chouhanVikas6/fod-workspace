import { createSlice } from '@reduxjs/toolkit';
export interface LanguageStateType{
  lang:string;
}
const initialState:LanguageStateType={
  lang: 'en'

}
const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {
    setLanguage(state, action) {
        return {
          ...state,
          lang: action.payload // Update language based on the payload
        };
      },
  },
});

export const { setLanguage } = languageSlice.actions;
export default languageSlice.reducer;