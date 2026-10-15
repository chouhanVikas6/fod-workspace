import React, { useMemo } from "react";
import { RxAvatar } from "react-icons/rx";
import { getCurrentUser, Auth } from "@/utils/auth";

// User profile tab — reads the signed-in user's claims from the JWT
// (id/userName/role/firstName/lastName/isActive, see api/auth/login.ts).
const Profile = () => {
    const user = useMemo(() => (getCurrentUser() || {}) as any, []);

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.userName || 'Unknown user';

    const rows: Array<[string, React.ReactNode]> = [
        ['Username', user.userName || '—'],
        ['Role', user.role ? String(user.role).toUpperCase() : '—'],
        ['User ID', user.id ?? '—'],
        ['Status', user.isActive === false ? 'Inactive' : 'Active'],
    ];

    return (
        <div className="relative w-full h-[80vh] bg-gray-100 overflow-y-auto p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-5">User Profile</h2>
            <div className="max-w-md bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-4 mb-5">
                    <RxAvatar className="w-16 h-16 text-gray-400" />
                    <div>
                        <div className="text-lg font-semibold text-gray-800">{fullName}</div>
                        <div className="text-sm text-gray-500">{user.role ? String(user.role).toUpperCase() : 'No role'}</div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                    {rows.map(([label, value]) => (
                        <React.Fragment key={label}>
                            <span className="text-gray-500">{label}</span>
                            <span className="text-right font-medium text-gray-800">{value}</span>
                        </React.Fragment>
                    ))}
                </div>
                <button
                    onClick={() => { Auth.logout(); window.location.reload(); }}
                    className="mt-6 w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded-lg active:scale-95 transition"
                >
                    Log out
                </button>
            </div>
        </div>
    );
};

export default Profile;
