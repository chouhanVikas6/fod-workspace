import { NextPageContext } from 'next';

// Function to set a cookie
export function setCookie(name: string, value: string, days: number) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

// Function to get a cookie by name
export function getCookie(name: string, ctx?: NextPageContext): string | undefined {
    const cookieStr = ctx ? ctx.req?.headers.cookie : document.cookie;
    if (!cookieStr) return undefined;

    const cookieName = `${name}=`;
    const decodedCookie = decodeURIComponent(cookieStr);
    const cookieArray = decodedCookie.split(';');
    
    for(let i = 0; i < cookieArray.length; i++) {
        let cookie = cookieArray[i].trim();
        if (cookie.indexOf(cookieName) === 0) {
            return cookie.substring(cookieName.length, cookie.length);
        }
    }
    return undefined;
}
