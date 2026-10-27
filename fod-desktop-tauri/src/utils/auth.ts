import { jwtDecode, JwtPayload } from "./jwt";
import axiosClient from "./axios";

export interface UserProfile extends JwtPayload {
    id?: string;
    userName?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    isActive?: boolean;
    iat?: number;
    [key: string]: any;
}

function normalizeUser(user: UserProfile | null): UserProfile | null {
    if (!user) return null;
    const normalized = { ...user };
    if (!normalized.username && normalized.userName) {
        normalized.username = normalized.userName;
    }
    if (!normalized.userName && normalized.username) {
        normalized.userName = normalized.username;
    }
    return normalized;
}

export class Auth {
    static login = async (token: string, user?: UserProfile) => {
        try {
            localStorage.setItem("TOKEN_KEY", token);
            if (user) {
                const norm = normalizeUser(user);
                localStorage.setItem("USER_KEY", JSON.stringify(norm));
            }
            return { success: true, token };
        } catch (error: any) {
            console.error('Login failed:', error);
            return { success: false, error: error };
        }
    };

    static logout = async () => {
        try {
            await axiosClient({
                method: "POST",
                url: "/api/auth/logout",
            }).catch(() => {});
        } catch (error) {
            // Ignore error on logout
        } finally {
            localStorage.removeItem("TOKEN_KEY");
            localStorage.removeItem("USER_KEY");
        }
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

    static getCurrentUser = (): UserProfile | null => {
        try {
            const storedUser = localStorage.getItem("USER_KEY");
            if (storedUser) {
                const parsed = JSON.parse(storedUser);
                if (parsed) {
                    return normalizeUser(parsed);
                }
            }
        } catch (e) {
            // ignore JSON parse error
        }
        const token = localStorage.getItem("TOKEN_KEY");
        if (!token) {
            return null;
        }
        try {
            const decoded = jwtDecode<UserProfile>(token);
            return normalizeUser(decoded);
        } catch (error) {
            console.error('Token decoding failed:', error);
            return null;
        }
    };

    static fetchCurrentUser = async (): Promise<UserProfile | null> => {
        const token = localStorage.getItem("TOKEN_KEY");
        if (!token) {
            return null;
        }
        try {
            const res = await axiosClient({
                method: "GET",
                url: "/api/auth/me",
            });
            if (res.data?.user) {
                const norm = normalizeUser(res.data.user);
                localStorage.setItem("USER_KEY", JSON.stringify(norm));
                return norm;
            }
            return Auth.getCurrentUser();
        } catch (error) {
            console.warn('Fetch current user failed, falling back to local user:', error);
            return Auth.getCurrentUser();
        }
    };

    static authToken = () => {
        return localStorage?.getItem("TOKEN_KEY");
    }
}

export function getUserDisplayName(user: UserProfile | null | undefined): string {
    if (!user) return 'User';
    if (user.userName) return user.userName;
    if (user.username) return user.username;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (fullName) return fullName;
    return 'User';
}

export const isAuthenticated = Auth.isAuthenticated;
export const getCurrentUser = Auth.getCurrentUser;
export const fetchCurrentUser = Auth.fetchCurrentUser;
export const authToken = Auth.authToken;
export const logout = Auth.logout;