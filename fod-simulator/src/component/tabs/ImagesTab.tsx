import { useState } from 'react';
import { useSimulatorStore } from '../../store';
import { Folder, FolderCheck, Image as ImageIcon, Hash, Sparkles, CheckCircle2 } from 'lucide-react';

export default function ImagesTab() {
  const { folderImages, currentFolderPath, scanImagesFolder, loading } = useSimulatorStore();
  const [inputPath, setInputPath] = useState(
    currentFolderPath || '/home/zoid/workspace/fod-desktop-tauri/fod-images'
  );

  const handleScan = () => {
    if (inputPath.trim()) {
      scanImagesFolder(inputPath.trim());
    }
  };

  const sampleItem = folderImages[0];

  return (
    <div className="flex flex-col gap-6 select-none transition-colors">
      {/* Folder Picker Header */}
      <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] p-5 rounded-xl shadow-xs dark:shadow-md flex flex-col gap-4 transition-colors">
        <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400 font-semibold text-sm">
          <Folder className="w-4 h-4" />
          <span>LOCAL FOD IMAGES FOLDER FEEDER</span>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="/path/to/fod/images"
            className="flex-1 bg-slate-50 border border-slate-300 dark:bg-[#161d2b] dark:border-[#263246] px-3.5 py-2 rounded-lg text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleScan}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {loading ? <span className="animate-spin">⏳</span> : <FolderCheck className="w-4 h-4" />}
            {loading ? 'Scanning...' : 'Load Folder'}
          </button>
        </div>

        {/* Quick Suggestions */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
          <span className="font-medium">Presets:</span>
          <button
            onClick={() => {
              setInputPath('/home/zoid/workspace/fod-simulator/sample_images');
              scanImagesFolder('/home/zoid/workspace/fod-simulator/sample_images');
            }}
            className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer bg-slate-100 dark:bg-[#182130] px-2 py-0.5 rounded border border-slate-200 dark:border-[#26344d]"
          >
            /home/zoid/workspace/fod-simulator/sample_images
          </button>
          <button
            onClick={() => {
              setInputPath('/home/zoid/workspace/fod-desktop-tauri/fod-images');
              scanImagesFolder('/home/zoid/workspace/fod-desktop-tauri/fod-images');
            }}
            className="text-[11px] font-mono text-slate-600 dark:text-slate-400 hover:underline cursor-pointer bg-slate-100 dark:bg-[#182130] px-2 py-0.5 rounded border border-slate-200 dark:border-[#26344d]"
          >
            /home/zoid/workspace/fod-desktop-tauri/fod-images
          </button>
        </div>
      </div>

      {/* Results / Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Feeder Mode & Stats */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] p-5 rounded-xl shadow-xs dark:shadow-md flex flex-col gap-4 transition-colors">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Feeder Pipeline Status
          </span>

          {folderImages.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{folderImages.length} Real Images Indexed</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The simulator will cycle through or randomly sample these real camera frames, compute their SHA-256
                hashes, and stream them via gRPC.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-semibold">
                <Sparkles className="w-4 h-4" />
                <span>Synthetic Pattern Generator (Active)</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No local folder loaded yet. The simulator is currently generating dynamic synthetic 640x480 test pattern
                frames with bounding boxes, class colors, and valid SHA-256 CAS hashes.
              </p>
            </div>
          )}
        </div>

        {/* Card 2: Sample Frame Preview */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] p-5 rounded-xl shadow-xs dark:shadow-md flex flex-col gap-3 lg:col-span-2 transition-colors">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Active Frame Inspection
          </span>

          {sampleItem ? (
            <div className="flex items-center gap-5 flex-wrap">
              {sampleItem.thumbnail_base64 && (
                <div className="w-36 h-28 rounded-lg overflow-hidden border border-slate-200 dark:border-[#29364d] bg-slate-100 dark:bg-black flex items-center justify-center">
                  <img
                    src={sampleItem.thumbnail_base64}
                    alt={sampleItem.filename}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5 text-xs font-mono">
                <div className="text-slate-900 dark:text-white font-bold">{sampleItem.filename}</div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-md">{sampleItem.path}</div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Size: {(sampleItem.size_bytes / 1024).toFixed(1)} KB
                </div>
                <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 text-[11px] pt-1">
                  <Hash className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>CAS Verification Ready</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 dark:bg-[#151c2a] dark:border-[#242e40] rounded-lg">
              <div className="w-24 h-20 bg-slate-200 dark:bg-[#1c2436] rounded border border-slate-300 dark:border-[#2d3a52] flex items-center justify-center text-slate-500">
                <ImageIcon className="w-8 h-8 opacity-40" />
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-col gap-1">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Synthetic Pattern Ready</span>
                <span>Resolves to 640x480 JPEG with metadata overlay.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Thumbnail Gallery (First 24 images) */}
      {folderImages.length > 0 && (
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] p-5 rounded-xl shadow-xs dark:shadow-md flex flex-col gap-3 transition-colors">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Indexed Frames Gallery ({folderImages.length})
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-64 overflow-y-auto p-1">
            {folderImages.slice(0, 32).map((img, i) => (
              <div
                key={i}
                className="group relative rounded-lg overflow-hidden border border-slate-200 dark:border-[#242f44] bg-slate-100 dark:bg-black aspect-video flex items-center justify-center"
              >
                {img.thumbnail_base64 ? (
                  <img src={img.thumbnail_base64} alt={img.filename} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-[9px] font-mono text-slate-200 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.filename}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
