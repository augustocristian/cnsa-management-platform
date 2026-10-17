// Entry point of the PWA (referenced by index.html). It only starts the composition root: js/composicion/ builds the real
// adapters, wires them into the application services and runs the presentation (js/presentation/shell/).
import { iniciar } from './composicion/boot.js';

iniciar();
