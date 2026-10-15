// src/components/InitialLoader.js

import React from 'react';
import './Loader.css'; // Optional: Create this CSS file for styles
import Zoid_logo from "../../Assets/images/zoid_logo.png";
import Image from 'next/image';

const InitialLoader = () => {
    //CSS new to be rewrite
    //High quality image needed
    
  return (
    <div className="splash-screen">
      <Image src={Zoid_logo} alt="Company Logo" className="logo" />
    </div>
  );
};

export default InitialLoader;
