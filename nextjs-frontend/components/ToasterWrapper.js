'use client';
import { Toaster } from 'react-hot-toast';

export default function ToasterWrapper() {
  return (
    <Toaster
      position="bottom-center"
      containerStyle={{
        bottom: 32,
      }}
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '10px',
          fontSize: '0.875rem',
          maxWidth: 'min(420px, 92vw)',
          padding: '12px 16px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
        },
        error: {
          style: {
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
          },
        },
        success: {
          style: {
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
          },
        },
      }}
    />
  );
}
