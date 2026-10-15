import React from 'react'

// import notificationSound from '@/assets/audios/notificationSound'; 

function Global({ children }:any) {
  // const audioRef = useRef(new Audio(notificationSound)); 
  return (
    <div>
      {/* <ReactAudioPlayer ref={audioRef} src={notificationSound} /> */}
      {children}
    </div>
  )
}

export default Global