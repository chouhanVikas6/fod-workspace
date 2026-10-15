import { jwtDecode } from "./jwt";

export class Auth {
    static login = async (token: string) => {
        try {
            localStorage.setItem("TOKEN_KEY", token);
            return { success: true, token };
        } catch (error: any) {
            console.error('Login failed:', error);
            return { success: false, error: error };
        }
    };

    static logout = () => {
        localStorage.removeItem("TOKEN_KEY");
    };

    static isAuthenticated = () => {
        const token = localStorage?.getItem("TOKEN_KEY");
        if (!token) {
            return false;
        }
        try {
            const decoded = jwtDecode(token);
            return !!decoded;
        } catch (error) {
            console.error('Token decoding failed:', error);
            return false;
        }
    };

    static getCurrentUser = () => {
        const token = localStorage.getItem("TOKEN_KEY");
        if (!token) {
            return null;
        }
        try {
            const decoded = jwtDecode(token);
            return decoded;
        } catch (error) {
            console.error('Token decoding failed:', error);
            return null;
        }
    };

    static authToken = () => {
        return localStorage?.getItem("TOKEN_KEY");
    }
}

export const isAuthenticated = Auth.isAuthenticated;
export const getCurrentUser = Auth.getCurrentUser;
export const authToken = Auth.authToken;