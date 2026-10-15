import { createSlice } from '@reduxjs/toolkit';

export interface ThemeStateType{
  theme:string;
}
const initialState:ThemeStateType={
  theme: 'light',
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
    setTheme(state, action) {
      state.theme = action.payload === 'dark' ? 'dark' : 'light';
    },
  },
});

export const { toggleTheme, setTheme } = themeSlice.actions;
export default themeSlice.reducer;