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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 24, background: '#0f172a' }}>
      <div style={{ background: '#000', borderRadius: '50%', padding: 0, width: 110, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'spin 1.6s linear infinite' }}>
        <img
          src={require('./assets/teamwork-logo-spin.png')}
          alt="loading"
          style={{ width: 110, height: 110, objectFit: 'contain', mixBlendMode: 'screen', borderRadius: '50%' }}
        />
      </div>
      <p style={{ color: '#94a3b8', fontSize: 15, fontWeight: 500 }}>جاري تحميل البيانات...</p>
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
