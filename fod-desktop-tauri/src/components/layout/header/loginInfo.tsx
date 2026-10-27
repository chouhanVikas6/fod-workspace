import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { RxAvatar, RxChevronDown, RxPerson, RxExit, RxCross2 } from "react-icons/rx";
import { Auth, UserProfile, getUserDisplayName } from "@/utils/auth";

const LoginInfo: React.FC = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date>(new Date());
  const [user, setUser] = useState<UserProfile | null>(() => Auth.getCurrentUser());
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch real logged in user from backend /api/auth/me
  useEffect(() => {
    let isMounted = true;
    Auth.fetchCurrentUser()
      .then((fetchedUser) => {
        if (isMounted && fetchedUser) {
          setUser(fetchedUser);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch logged-in user profile:", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        setIsProfileModalOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    setIsProfileModalOpen(false);
    await Auth.logout();
    navigate("/login");
  };

  const displayName = getUserDisplayName(user);
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const userRole = user?.role ? String(user.role).toUpperCase() : "GUEST";
  const userLoginName = user?.userName || user?.username || displayName;

  return (
    <>
      <div className="flex h-full items-center justify-end space-x-5 px-3 flex-shrink-0 select-none">
        {/* Date & Time */}
        <div className="flex flex-col justify-center items-end text-right whitespace-nowrap leading-tight">
          <span className="text-[15px] font-semibold text-gray-700">
            {date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </span>
          <span className="text-[13px] text-gray-400">
            {date.toLocaleDateString("en-US", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>

        {/* Separator */}
        <div className="h-7 w-[1px] bg-gray-200" />

        {/* User profile dropdown trigger */}
        <div ref={dropdownRef} className="relative flex items-center h-full">
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-100/90 active:bg-gray-200/70 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-haspopup="true"
            aria-expanded={isDropdownOpen}
            title="User menu"
          >
            <RxAvatar className="w-8 h-8 text-gray-500 flex-shrink-0" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold text-gray-800 max-w-[140px] truncate">
                {displayName}
              </span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {userRole}
              </span>
            </div>
            <RxChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-150">
              {/* User preview header */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 rounded-t-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <RxAvatar className="w-8 h-8" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {fullName || displayName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      @{userLoginName}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-blue-50 text-blue-700 rounded-full border border-blue-200/60">
                      {userRole}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action items */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  <RxPerson className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">User Profile</span>
                </button>

                <div className="my-1 border-t border-gray-100" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <RxExit className="w-4 h-4 text-red-500" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Modal Dialog */}
      {isProfileModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setIsProfileModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center space-x-2">
                <RxPerson className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-900">User Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none"
                title="Close"
              >
                <RxCross2 className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
                  <RxAvatar className="w-14 h-14" />
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-lg font-bold text-gray-900 truncate">
                    {fullName || displayName}
                  </h4>
                  <p className="text-sm text-gray-500 truncate">@{userLoginName}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 rounded-full border border-blue-200/60">
                    {userRole}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500">Username</span>
                  <span className="font-semibold text-gray-800">{userLoginName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500">First Name</span>
                  <span className="font-semibold text-gray-800">{user?.firstName || "—"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500">Last Name</span>
                  <span className="font-semibold text-gray-800">{user?.lastName || "—"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500">Role</span>
                  <span className="font-semibold text-gray-800">{userRole}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500">User ID</span>
                  <span
                    className="font-mono text-xs text-gray-700 max-w-[200px] truncate"
                    title={user?.id || ""}
                  >
                    {user?.id || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500">Status</span>
                  <span className="inline-flex items-center space-x-1.5 font-semibold text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{user?.isActive === false ? "Inactive" : "Active"}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50/70 border-t border-gray-100">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:outline-none"
              >
                <RxExit className="w-4 h-4" />
                <span>Log out</span>
              </button>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg shadow-sm transition-colors focus:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LoginInfo;
