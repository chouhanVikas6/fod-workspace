export function base64ToBinary(base64:string) {
    const binaryString = atob(base64.split(",")[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
  
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
  
    return bytes.buffer;
  }

  export function base64ToUint8Array(base64:string) {
    // Decode the Base64 string
    const binaryString = atob(base64);
    // Create a new Uint8Array to hold the decoded data
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    
    // Populate the Uint8Array with the decoded data
    for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  }