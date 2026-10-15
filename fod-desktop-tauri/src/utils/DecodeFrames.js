import msgpack from 'msgpack-lite';
import { Buffer } from 'buffer';


export const decodeFrame = (frame) => {
    try {
      let toDecode;
  
       if(frame.hasOwnProperty("data")){
         toDecode = frame.data
       }
       else{
        console.log("returning", frame)
         return frame;
       }

     console.log({frame})
    //   const decodedData = msgpack.decode(new Uint8Array(toDecode));
  // console.log({decodeFrame})
      // Convert the decoded frame to base64
      const base64Frame = toDecode.toString('base64');
  console.log({base64Frame})
      // Perform any additional processing based on the decoded data
      return  base64Frame 
    } catch (error) {
      console.error('Error decoding frame:', error);
      return null;
    }
  };

  const convertBufferToBase64 = (bufferObj) => {
    console.log(bufferObj)
    // Check if the input is valid
    if (bufferObj.type === 'Buffer' && Array.isArray(bufferObj.data)) {
      // Check if the data array contains valid byte values
      if (bufferObj.data.every(byte => typeof byte === 'number' && byte >= 0 && byte <= 255)) {
        // Create a Buffer from the byte array
        const buffer = Buffer.from(bufferObj.data);
        
        // Convert the Buffer to a base64 string
        const base64String = buffer.toString('base64');
        
        return base64String;
      } else {
        throw new Error('Invalid byte values in data array. Ensure all values are numbers between 0 and 255.');
      }
    } else {
      throw new Error('Invalid input: expected an object with type "Buffer" and data as an array.');
    }
  };

const convertToBase64 = (data) => {
  try {
    data=Buffer.from(data.data);
    // Log the incoming data type
    console.log('Received data:', data);

    if (data?.type?.toLowerCase() === 'buffer' && Array.isArray(data.data)) {
      // Convert the array to a Buffer
      const buffer = Buffer.from(data.data);
      console.log('Converted WebSocket data to Buffer:', buffer);

      // Convert Buffer to base64
      const base64String = buffer.toString('base64');
      console.log('Base64 String from WebSocket data:', base64String);
      return base64String;
    } else if (Buffer.isBuffer(data)) {
      // If the data is already a Buffer (e.g., from the database)
      console.log('Received Buffer from database:', data);

      // Convert Buffer to base64
      const base64String = convertBufferToBase64(data);
      console.log('Base64 String from database data:', base64String);
      return base64String;
    } else {
      console.error('Invalid data type. Expected Buffer or Buffer-like object.');
      return null;
    }
  } catch (error) {
    console.error('Error processing data:', error);
    return null;
  }
};

const convertToBytes = (input) => {
  if (Array.isArray(input)) {
    // Check if all elements are integers in the range 0-255
    if (input.every(num => Number.isInteger(num) && num >= 0 && num <= 255)) {
      return Buffer.from(input); // Convert to Buffer
    } else {
      throw new Error("Input array contains non-integer values or values out of byte range.");
    }
  } else if (Buffer.isBuffer(input)) {
    return input; // Already a Buffer, return as is
  } else {
    throw new Error("Input is neither an array of integers nor a Buffer.");
  }
};

export const base64decodedFrame = (frame) =>{

  console.log({frame})
  if(!!frame.data){
    console.log("catch me1")
    frame=Buffer.from(frame.data);
    frame=frame.toString('base64');
  }else{
    console.log("catch me2")
    frame=Buffer.from(frame);
    frame=frame.toString('base64');
  }
  console.log({frame})
    let base64String = 'data:image/jpeg;base64,';
    if (frame) {
      try {
        base64String += frame;
        // console.log('Base64 String:', base64String); // Log base64 string
      } catch (error) {
        console.error('Error converting ArrayBuffer to base64:', error);
      }
    }
    return base64String;
  }
  
export const decodeFods = async (DataToDecode)=>{
  
    const decodedPayload = await Promise.all(
      DataToDecode.map(async (item) => {
        const decodedFrame = decodeFrame(item.FodPoint.frame);
        const decodedFodPoint = { ...item.FodPoint, frame: decodedFrame };
       // adding new key imgModal in fod help to show loading modal on image and disable fod Card button until response received  
        return { ...item, FodPoint: decodedFodPoint,imgModal:false };
      })
    );
    // console.log(decodedPayload)
    return decodedPayload
  }

export const decodeFodPoints = async (DataToDecode)=>{
  console.log({DataToDecode})
    const decodedPayload = await Promise.all(
        DataToDecode.map(async (item) => {
          const decodedFrame = base64decodedFrame(item.frame);
          const decodedFodPoint = { ...item, frame: decodedFrame };
          return decodedFodPoint;
        })
      );
      console.log({decodedPayload})
      return decodedPayload
}
