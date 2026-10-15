import { getCurrentUser } from "@/utils/auth";
import React, { useState, useEffect } from "react";
import { RxAvatar } from "react-icons/rx";
const LoginInfo = () => {
  var [date, setDate] = useState(new Date());

  //running every second for dataTime update
  useEffect(() => {
    var timer = setInterval(() => setDate(new Date()), 1000);
    return function cleanup() {
      clearInterval(timer);
    };
  });

  return (
    <div className="flex h-full w-[40%]  justify-around  px-2">
      <div className="data_time flex  items-center whitespace-nowrap ">
        <span className="  text-[#7F7F88] ">
          {date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </span>
        <span className="  text-[#A5A5B0] ">
          {date.toLocaleDateString("en-US", {
            weekday: "short",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      <div className="icon-name">
        <RxAvatar className="login-icon" />
        <span className="">{getCurrentUser()?.username || 'User_user1'}</span>
      </div>
    </div>
  );
};

export default LoginInfo;
