// COMPATIBILITY SHIM (delete once nothing imports it): the sign-in module no longer exists. The app has no sign-in and no user
// identity; it only connects to the person's Google Drive. The implementation is js/infrastructure/driveConnection.js.
import { driveConnection } from './infrastructure/driveConnection.js';

export const auth = driveConnection;
export default driveConnection;
