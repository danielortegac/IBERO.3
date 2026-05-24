
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import { AppContextProvider } from './context/AppContext';

console.log("BUILD_ID: goatify-v18-brand-admin-tailwind-storage-mj");

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
