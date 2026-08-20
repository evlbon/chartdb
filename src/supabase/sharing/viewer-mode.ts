import { createContext, useContext } from 'react';

// Режим зрителя: включается на странице /shared/:token. Слоты внутри канвы
// (canvas-slot) по нему отключают перетаскивание/соединение узлов — сама
// канва апстрима в readonly запрещает только удаление.
export const viewerModeContext = createContext(false);

export const useViewerMode = (): boolean => useContext(viewerModeContext);
