import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('localforage', () => ({ config: jest.fn(), getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }));

test('opens the login screen when there is no saved session and the network is unavailable', async () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  render(<App />);
  expect(await screen.findByPlaceholderText('أدخل اسم المستخدم')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('أدخل كلمة المرور')).toBeInTheDocument();
});
