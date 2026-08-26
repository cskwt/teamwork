import React from 'react';
import { render, screen } from '@testing-library/react';
import NotifActorAvatar, { resolveNotifActor } from './NotifActorAvatar';
import { AppNotification, Order, User } from '../../types';

const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

const baseNotif = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  type: 'updated',
  userId: 'u-receiver',
  orderId: 'o1',
  orderNumber: '5360',
  clientName: 'ساره الصراف',
  message: 'نُقلت طلبية: ساره الصراف إلى قسم التسليم',
  createdAt: new Date().toISOString(),
  read: false,
  ...over,
});

describe('resolveNotifActor', () => {
  test('uses the snapshot photo when the live user avatar was stripped', () => {
    const users: User[] = [{
      id: 'u-actor',
      username: 'actor',
      password: 'x',
      fullName: 'أحمد المنفذ',
      role: 'member',
      avatar: '',
      createdAt: '',
    }];
    const resolved = resolveNotifActor(
      baseNotif({ actorId: 'u-actor', actorName: 'أحمد المنفذ', actorAvatar: photo }),
      users,
    );
    expect(resolved.name).toBe('أحمد المنفذ');
    expect(resolved.avatar).toBe(photo);
  });

  test('does not treat the order creator as the mover', () => {
    const users: User[] = [{
      id: 'u-creator',
      username: 'creator',
      password: 'x',
      fullName: 'منشئ الطلبية',
      role: 'member',
      avatar: photo,
      createdAt: '',
    }];
    const orders: Order[] = [{
      id: 'o1',
      orderNumber: '5360',
      clientName: 'ساره الصراف',
      departmentId: 'd1',
      status: 'new',
      createdBy: 'u-creator',
      createdAt: '',
      updatedAt: '',
    } as Order];
    const resolved = resolveNotifActor(baseNotif({ type: 'updated' }), users, orders);
    expect(resolved.avatar).toBeUndefined();
    expect(resolved.name).toBe('');
  });
});

describe('NotifActorAvatar', () => {
  test('renders the actor profile photo beside the notification', () => {
    render(
      <NotifActorAvatar
        notification={baseNotif({
          actorId: 'u-actor',
          actorName: 'أحمد المنفذ',
          actorAvatar: photo,
        })}
        size={56}
        force
      />,
    );
    const img = screen.getByRole('img', { name: 'أحمد المنفذ' });
    expect(img).toHaveAttribute('src', photo);
    expect(screen.getByTestId('notif-actor-avatar')).toBeInTheDocument();
  });
});
