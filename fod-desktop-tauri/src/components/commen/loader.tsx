import React from "react";

const Loader = () => {
    return (
        <div className="fixed top-0 right-0 bottom-0 left-0 flex items-center justify-center z-[1000] text-white bg-white h-screen w-screen">
            <div className="fixed top-0 right-0 bottom-0 left-0 bg-black bg-opacity-50"></div>
            <div className="relative w-8 h-8 animate-spin text-center"></div>
        </div>
    );
}

export default Loader;

export const BarLoader = () => (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="relative w-8 h-8 rounded-md">
            {Array.from({ length: 12 }).map((_, i) => (
                <div
                    key={i}
                    className={`absolute w-1 h-4 bg-gray-700 left-1/2 top-1/3 opacity-0 rounded-full animate-fade458 bar${i + 1}`}
                    style={{ transform: `rotate(${i * 30}deg) translate(0, -130%)`, animationDelay: `-${1.1 - i * 0.1}s` }}
                ></div>
            ))}
        </div>
    </div>
);

export const CircleLoader = () => (
    <div className="absolute inset-0 bg-opacity-10 z-10">
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl w-4 h-4 rounded-full relative animate-mulShdSpin"></div>
    </div>
);
