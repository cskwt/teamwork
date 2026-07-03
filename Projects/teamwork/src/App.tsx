import React, { useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import LoginPage from './components/auth/LoginPage';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './components/board/Dashboard';
import ProjectsPage from './components/board/ProjectsPage';
import KanbanBoard from './components/board/KanbanBoard';
import OrdersPage from './components/orders/OrdersPage';
import DepartmentsPage from './components/departments/DepartmentsPage';
import UsersPage from './components/departments/UsersPage';
import TrashPage from './components/board/TrashPage';
import SettingsPage from './components/board/SettingsPage';
import NotificationPopup from './components/layout/NotificationPopup';
import './App.css';

const AppInner: React.FC = () => {
  const { state, loaded } = useApp();
  const { currentUser, departments } = state;

  const [activePage, setActivePage] = useState('projects');
  const [activeDeptId, setActiveDeptId] = useState<string | null>(departments[0]?.id || null);

  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#6b7280', fontSize: 14 }}>جاري تحميل البيانات...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!currentUser) return <LoginPage />;

  const activeDept = departments.find((d) => d.id === activeDeptId);

  const handleNavigate = (page: string) => setActivePage(page);

  const handleOpenBoard = (deptId: string) => {
    setActiveDeptId(deptId);
    setActivePage('board');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} onSelectDept={handleOpenBoard} />;
      case 'projects':
        return <ProjectsPage onOpenBoard={handleOpenBoard} />;
      case 'board':
        return activeDept
          ? <KanbanBoard department={activeDept} onBack={() => setActivePage('projects')} />
          : <ProjectsPage onOpenBoard={handleOpenBoard} />;
      case 'orders':
      case 'my-tasks':
        return <OrdersPage />;
      case 'departments':
        return <DepartmentsPage />;
      case 'users':
        return <UsersPage />;
      case 'settings':
        return <SettingsPage />;
      case 'archive':
        return <OrdersPage archiveMode />;
      case 'trash':
        return <TrashPage />;
      default:
        return <ProjectsPage onOpenBoard={handleOpenBoard} />;
    }
  };

  return (
    <div className="app-root">
      <NotificationPopup />
      <TopBar onNavigate={handleNavigate} />
      <div className="app-body">
        {/* Sidebar on the RIGHT (RTL) */}
        <Sidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          activeDeptId={activeDeptId}
          onSelectDept={setActiveDeptId}
        />
        <main className="main-area">
          {renderPage()}
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <AppInner />
  </AppProvider>
);

export default App;
