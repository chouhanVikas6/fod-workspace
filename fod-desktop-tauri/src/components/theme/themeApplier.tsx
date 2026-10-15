import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

// Applies the persisted Redux theme to <html> as the `theme-dark` class, which
// globals.css turns into the inverted (night) colour scheme. Renders nothing.
export default function ThemeApplier() {
    const theme = useSelector((state: RootState) => state.theme.theme);
    useEffect(() => {
        document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    }, [theme]);
    return null;
}
