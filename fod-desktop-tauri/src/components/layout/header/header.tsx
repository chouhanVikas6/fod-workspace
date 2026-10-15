import React from "react";
import HealthBar from "./healthBar";
import LoginInfo from "./loginInfo";



const Header = () => {

  return (
    <div className="flex items-center justify-between px-5 py-0 w-full h-full bg-[#FCFCFC] border-b border-[#DDDDE7]">
      <div className="flex items-center h-full">
        <p className="text-[#4c4c4c] font-normal text-[32px] font-[Arial, Helvetica, sans-serif]">ZOID</p>
      </div>
      <div className="flex items-center justify-end w-[75%] h-full text-[#7F7F88]">
        <HealthBar />
        <LoginInfo />
      </div>
    </div>
  );
};

export default Header;
