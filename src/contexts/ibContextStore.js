import { createContext, useContext } from 'react'

const IBContext = createContext();

export const useIB = () => {
  const context = useContext(IBContext);
  if (!context) {
    throw new Error('useIB must be used within an IBProvider');
  }
  return context;
};

export default IBContext
