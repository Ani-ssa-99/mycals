import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => path.endsWith(".wasm") ? new URL("./zxing_reader.wasm", import.meta.url).href : prefix + path,
  },
});
export { BarcodeDetector };
