import React from "react";
import { set_selectedQueue } from "@/store/slices/mapReducer-slice";
import { useSelector, useDispatch } from "react-redux";
import Selected  from "@/assets/images/svg/map/selected.svg";
import { RootState } from "@/store";
import Image from "next/image";

function Tickbox({color="bg-[#FF8360]"}) {
  return ( 
    // change this bg color to change checkbox color
    <div className={`w-4 h-4  ${color} flex items-center justify-center overflow-hidden rounded-[3px]`}>
      <Image src={Selected} alt="" width={12} height={12}/>
    </div>
  );
}

export default function FilterBox() {
  const dispatch = useDispatch();
  const selected_queue = useSelector((state:RootState) => state.MapReducer.selectedQueue);

  function checkSelected(item) {
    return selected_queue.includes(item);
  }

  return (
    <div className="absolute bottom-[100%]  ">
      <div className="bg-white w-[160px] rounded-[6px] flex flex-col items-start justify-between px-[7px]">
   
   
        <button
          className={`flex items-center py-2  font-semibold`}
          onClick={() => {
            dispatch(set_selectedQueue('ACCEPTED'));
          }}
        >
          {checkSelected('ACCEPTED') ? <Tickbox color="bg-red-500" /> : <div className="w-4 h-4 border-[1px] border-[#D8D8D8] rounded-[3px]" />}
          <span className={`ml-2 ${
            selected_queue.includes('ACCEPTED')
              ? "text-red-500"
              : "text-gray-400 "
          }`}>Accepted FOD</span>
        </button>
        <button
          className={`flex items-center py-2 font-semibold${
            checkSelected('CLEARED')
              ? "text-blue-500 "
              : "text-gray-600 hover:text-blue-500"
          }`}
          onClick={() => {
            dispatch(set_selectedQueue('CLEARED'));
          }}
        >
          {checkSelected('CLEARED') ? <Tickbox color="bg-green-500"  /> : <div className="w-4 h-4 border-[1px] border-[#D8D8D8] rounded-[3px]" />}
          <span className={`ml-2 ${
            selected_queue.includes('CLEARED')
              ? "text-green-500"
              : "text-gray-400 "
          }`}>Cleared FOD</span>
        </button>
        <button
          className={`flex items-center py-2  font-semibold`}
          onClick={() => {
            dispatch(set_selectedQueue('REJECTED'));
          }}
        >
          {checkSelected('REJECTED') ? <Tickbox color="bg-gray-500" /> : <div className="w-4 h-4 border-[1px] border-[#D8D8D8] rounded-[3px]" />}
          <span className={`ml-2 ${
            selected_queue.includes('REJECTED')
              ? "text-gray-500"
              : "text-gray-400 "
          }`}>Rejected FOD</span>
        </button>
        {/* <button
          className={`flex items-center py-2 ${
            checkSelected(0)
              ? "text-blue-500 font-semibold"
              : "text-gray-600 hover:text-blue-500"
          }`}
          onClick={() => {
            dispatch(set_selectedQueue(0));
          }}
        >
          {checkSelected(0) ? <Tickbox /> : <div className="w-4 h-4 border-[1px] border-[#D8D8D8] rounded-[3px]" />}
          <span className="ml-2">Car’s Location</span>
        </button> */}
        <button
          className={`flex items-center py-2  font-semibold`}
          onClick={() => {
            dispatch(set_selectedQueue('NEW'));
          }}
        >
          {checkSelected('NEW') ? <Tickbox color="bg-yellow-500" /> : <div className="w-4 h-4 border-[1px] border-[#D8D8D8] rounded-[3px]" />}
          <span className={`ml-2 ${
            selected_queue.includes('NEW')
              ? "text-yellow-500"
              : "text-gray-400 "
          }`}>NEW FOD</span>
        </button>

        <button
          className={`flex items-center py-2  font-semibold`}
          onClick={() => {
            dispatch(set_selectedQueue('MISSED'));
          }}
        >
          {checkSelected('MISSED') ? <Tickbox color="bg-orange-500" /> : <div className="w-4 h-4 border-[1px] border-[#D8D8D8] rounded-[3px]" />}
          <span className={`ml-2 ${
            selected_queue.includes('MISSED')
              ? "text-orange-500"
              : "text-gray-400 "
          }`}>Missed FOD</span>
        </button>
    
      </div>
      <div className="endtip"></div>
    </div>
  );
}
