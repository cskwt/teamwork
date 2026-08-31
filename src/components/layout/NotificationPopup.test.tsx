import React from 'react';
import { render, screen } from '@testing-library/react';
import NotificationPopup from './NotificationPopup';
import { useApp } from '../../contexts/AppContext';
import { AppNotification, User } from '../../types';

jest.mock('../../contexts/AppContext', () => ({
  useApp: jest.fn(),
}));

const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

const actor: User = {
  id: 'u-actor',
  username: 'actor',
  password: 'x',
  fullName: 'أحمد المنفذ',
  role: 'member',
  avatar: photo,
  createdAt: '',
};

const receiver: User = {
  id: 'u-me',
  username: 'me',
  password: 'x',
  fullName: 'المستلم',
  role: 'member',
  createdAt: '',
};

const transferNotif: AppNotification = {
  id: 'n-new',
  type: 'updated',
  userId: 'u-me',
  orderId: 'o1',
  orderNumber: '5360',
  clientName: 'ساره الصراف',
  actorId: 'u-actor',
  actorName: 'أحمد المنفذ',
  actorAvatar: photo,
  message: 'نُقلت طلبية: ساره الصراف إلى قسم التسليم',
  createdAt: new Date().toISOString(),
  read: false,
};

const mockApp = (notifications: AppNotification[]) => {
  (useApp as jest.Mock).mockReturnValue({
    state: {
      currentUser: receiver,
      notifications,
      orders: [],
      orderRequests: [],
      users: [actor, receiver],
    },
    dispatch: jest.fn(),
  });
};

describe('NotificationPopup', () => {
  test('places the mover profile photo beside a new transfer notification', () => {
    mockApp([]);
    const { rerender } = render(<NotificationPopup />);
    expect(screen.queryByText('إشعار جديد')).not.toBeInTheDocument();

    mockApp([transferNotif]);
    rerender(<NotificationPopup />);

    expect(screen.getByText('إشعار جديد')).toBeInTheDocument();
    expect(screen.getByText('#5360 — ساره الصراف')).toBeInTheDocument();
    expect(screen.getByText('نُقلت طلبية: ساره الصراف إلى قسم التسليم')).toBeInTheDocument();
    expect(screen.getByText('أحمد المنفذ')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'أحمد المنفذ' });
    expect(img).toHaveAttribute('src', photo);
    expect(img.closest('.notif-popup-main')).toBeTruthy();
  });
});
