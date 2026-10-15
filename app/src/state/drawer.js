import { createContext, useContext } from 'react';

export const DrawerContext = createContext(() => {});
export const useOpenVendor = () => useContext(DrawerContext);

// Expos: open an event or a venue panel from anywhere.
export const ExpoDrawerContext = createContext({ openEvent: () => {}, openVenue: () => {} });
export const useExpoDrawers = () => useContext(ExpoDrawerContext);
