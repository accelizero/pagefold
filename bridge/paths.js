import os from 'node:os';
import path from 'node:path';
export const dataDir=path.resolve(process.env.PAGEFOLD_DATA_DIR||path.join(os.homedir(),'.local','share','pagefold'));
export const socketPath=path.join(dataDir,'bridge.sock');
