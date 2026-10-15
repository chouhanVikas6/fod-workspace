import React from 'react';

const Image = ({ src, alt, className, width, height, onClick, style }: any) => {
  const imgSrc = src && typeof src === 'object' && 'src' in src ? src.src : src;
  return (
    <img 
      src={imgSrc} 
      alt={alt} 
      className={className} 
      width={width} 
      height={height} 
      onClick={onClick}
      style={style}
    />
  );
};

export default Image;
