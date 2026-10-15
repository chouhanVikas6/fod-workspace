import React from 'react';
import MissionControlPanel from './MissionControlPanel';
import MissionProgress from './MissionProgress';
const OperationSideBarStyle={
  width:6,
  background :'#FCFCFC',
  borderColor:'#DDDDE7'
}

const OperationSideBar = ({tab,setTab}) => {
  const { width, background, borderColor } = OperationSideBarStyle;

  return (
    <div
      className={`h-full flex flex-col justify-between items-center border-r`}
      style={{ width: `${width}%`, background, borderRightColor: borderColor }}
    >
      <MissionControlPanel tab={tab} setTab={setTab}/>
      <MissionProgress />
    </div>
  );
};

export default OperationSideBar;