
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppContextProvider } from './context/AppContext';

console.log("BUILD_ID: gemini-backend-only-v-final");

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("No se encontró el elemento root");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppContextProvider>
      <App />
    </AppContextProvider>
  </React.StrictMode>
);
