function calculateJSONObjectSizeByte(obj) {
    if(typeof obj!="object") throw Error("Invalid Type Not a Json")
    const jsonString = JSON.stringify(obj);
    const bytes = Buffer.byteLength(jsonString, 'utf8');
    return bytes;
}

module.exports = {calculateJSONObjectSizeByte};