import * as fs from 'fs';
import * as path from 'path';

export async function writeJpegFile(base64Image: string, savePath: string): Promise<string> {
    try {
        const publicPath = './fod-images';
        const base64Data = base64Image.replace(/^data:image\/jpeg;base64,/, '');
        const buffer= Buffer.from(base64Data, 'base64');
        
        // Ensure the directory exists
        const dirPath = publicPath+path.dirname(savePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const fileName = path.basename(savePath);
        // Write the buffer to the file
        fs.writeFileSync(dirPath+'/'+fileName, buffer);
        return savePath;
    } catch (error) {
        console.error('Error writing JPEG file:', error);
        throw new Error('Failed to write image file');
    }
}