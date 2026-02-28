// global.d.ts
import { IpcRenderer } from 'electron';

declare global {
  interface Window {
    electron: {
      ipcRenderer: IpcRenderer;
    };
    api: {
      startTimer: () => void;
      stopTimer: () => void;
    };
  }
}
