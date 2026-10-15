import React from "react";

const CircleLoader = () => {
  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 flex items-center justify-center z-50 bg-black bg-opacity-50 h-screen w-screen">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full opacity-20 animate-spin">
        {/* Replace the content with your loader animation */}
      </div>
    </div>
  );
};

export default CircleLoader;
