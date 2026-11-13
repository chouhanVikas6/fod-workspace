
import React from "react";
import HealthBar from "./healthBar";
import LoginInfo from "./loginInfo";
import Zoid_logo from "@/assets/images/svg/zoid_logo.svg";

const Header = () => {
  return (
    <div className="header-native-theme relative flex items-center justify-between px-6 py-0 w-full h-full
      bg-white dark:bg-[#292D33]
      border-b border-slate-200 dark:border-[#252B35]
      transition-colors duration-200 select-none">

      {/* Brand logo & title */}
      <div className="flex items-center h-full flex-shrink-0">
        <div className="flex items-center space-x-2.5 cursor-pointer">
          <img
            src={Zoid_logo}
            alt="ZOID Logo"
            className="w-6 h-6 object-contain"
          />

          <p className="text-slate-900 dark:text-white font-serif font-bold text-lg tracking-[0.05em]">
            ZOID
          </p>
        </div>
      </div>

      {/* Health status & User info */}
      <div className="flex items-center justify-end flex-1 h-full space-x-4">
        <HealthBar />
        <LoginInfo />
      </div>
    </div>
  );
};

export default Header;
