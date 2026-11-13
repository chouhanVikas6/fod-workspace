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
      <div className="flex h-full items-center justify-end space-x-3.5 px-1 flex-shrink-0 select-none">
  {/* Date & Time */}
  <div className="flex flex-col justify-center items-end text-right whitespace-nowrap leading-tight">
    <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
      {date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </span>

    <span className="text-[11px] text-slate-500 dark:text-[#8C939C] font-medium mt-0.5">
      {date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </span>
  </div>

  {/* Separator */}
  <div className="h-4 w-[1px] bg-slate-300 dark:bg-[#4A5059] mx-0.5" />

  {/* User profile dropdown trigger */}
  <div ref={dropdownRef} className="relative flex items-center h-full">
    <button
      type="button"
      onClick={() => setIsDropdownOpen((prev) => !prev)}
      className="flex items-center space-x-2 px-1.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#373C43]/50 active:bg-slate-200 dark:active:bg-[#373C43] transition-colors focus:outline-none"
      aria-haspopup="true"
      aria-expanded={isDropdownOpen}
      title="User menu"
    >
      <div className="w-8 h-8 rounded-full border-[1.5px] border-[#4B9BE2] flex items-center justify-center text-[#4B9BE2] shrink-0">
        <RxPerson className="w-4 h-4" />
      </div>

      <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
        {displayName || "User1"}
      </span>
    </button>
 
          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#292D33] rounded-xl shadow-xl border border-slate-200 dark:border-[#383D44] py-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-150">
              {/* User preview header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-[#383D44] bg-slate-50 dark:bg-[#22262B] rounded-t-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#353A42] text-[#5AA7EA] border border-slate-300 dark:border-[#454B53] flex items-center justify-center flex-shrink-0">
                    <RxAvatar className="w-8 h-8" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {fullName || displayName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#8E95A2] truncate">
                      @{userLoginName}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-200 dark:bg-[#31475D] dark:text-[#5AA7EA] dark:border-[#5AA7EA]/40 rounded-md">
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
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#353A42] hover:text-[#5AA7EA] dark:hover:text-[#5AA7EA] transition-colors cursor-pointer"
                >
                  <RxPerson className="w-4 h-4 text-slate-500 dark:text-[#8E95A2]" />
                  <span className="font-medium">User Profile</span>
                </button>

                <div className="my-1 border-t border-slate-200 dark:border-[#383D44]" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <RxExit className="w-4 h-4 text-rose-500" />
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => setIsProfileModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md bg-white dark:bg-[#292D33] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#383D44] overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#383D44] bg-slate-50 dark:bg-[#22262B]">
              <div className="flex items-center space-x-2">
                <RxPerson className="w-5 h-5 text-[#5AA7EA]" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">User Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#353A42] transition-colors focus:outline-none cursor-pointer"
                title="Close"
              >
                <RxCross2 className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-slate-200 dark:border-[#383D44]">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#353A42] text-[#5AA7EA] flex items-center justify-center border border-slate-300 dark:border-[#454B53] flex-shrink-0">
                  <RxAvatar className="w-14 h-14" />
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                    {fullName || displayName}
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-[#8E95A2] truncate">@{userLoginName}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-[#31475D] dark:text-[#5AA7EA] dark:border-[#5AA7EA]/40 rounded-md">
                    {userRole}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-[#383D44]/70">
                  <span className="text-slate-500 dark:text-[#8E95A2]">Username</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{userLoginName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-[#383D44]/70">
                  <span className="text-slate-500 dark:text-[#8E95A2]">First Name</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{user?.firstName || "—"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-[#383D44]/70">
                  <span className="text-slate-500 dark:text-[#8E95A2]">Last Name</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{user?.lastName || "—"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-[#383D44]/70">
                  <span className="text-slate-500 dark:text-[#8E95A2]">Role</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{userRole}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-[#383D44]/70">
                  <span className="text-slate-500 dark:text-[#8E95A2]">User ID</span>
                  <span
                    className="font-mono text-xs text-slate-700 dark:text-slate-300 max-w-[200px] truncate"
                    title={user?.id || ""}
                  >
                    {user?.id || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 dark:text-[#8E95A2]">Status</span>
                  <span className="inline-flex items-center space-x-1.5 font-semibold text-[#00B957]">
                    <span className="w-2 h-2 rounded-full bg-[#00B957]" />
                    <span>{user?.isActive === false ? "Inactive" : "Active"}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-[#22262B] border-t border-slate-200 dark:border-[#383D44]">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors focus:outline-none cursor-pointer"
              >
                <RxExit className="w-4 h-4" />
                <span>Log out</span>
              </button>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#353A42] hover:bg-slate-100 dark:hover:bg-[#3E444D] border border-slate-300 dark:border-[#454B53] rounded-lg shadow-xs transition-colors focus:outline-none cursor-pointer"
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
