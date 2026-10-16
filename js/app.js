// Entry point of the PWA. It only composes: everything lives in js/presentation/shell/ (UI), js/application/ (use cases)
// and the adapters they receive. Will become js/main.js in the layered target (see docs/ARCHITECTURE.md).
import { iniciar } from './presentation/shell/boot.js';

iniciar();
