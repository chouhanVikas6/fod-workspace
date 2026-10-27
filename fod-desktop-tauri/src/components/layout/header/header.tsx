import React from "react";
import HealthBar from "./healthBar";
import LoginInfo from "./loginInfo";



const Header = () => {

  return (
    <div className="relative flex items-center justify-between px-6 py-0 w-full h-full bg-white/95 backdrop-blur-sm border-b border-slate-200/90 shadow-sm z-50 select-none">
      <div className="flex items-center h-full flex-shrink-0 space-x-2.5 mr-4">
        {/* <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm shadow-blue-500/20">
          <span className="text-white font-black text-base tracking-tighter">Z</span>
        </div> */}
        <p className="text-slate-900 font-extrabold text-xl tracking-wider font-sans">ZOID</p>
      </div>
      <div className="flex items-center justify-end flex-1 h-full space-x-4">
        <HealthBar />
        <LoginInfo />
      </div>
    </div>
  );
};

export default Header;
