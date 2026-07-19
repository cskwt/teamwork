import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { LanguageProvider, useLang } from './contexts/LanguageContext';
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
import OperationsScreen from './components/board/OperationsScreen';
import NotificationPopup from './components/layout/NotificationPopup';
import './App.css';

const AppInner: React.FC = () => {
  const { state, loaded } = useApp();
  const { currentUser, departments } = state;

  const [activePage, setActivePage] = useState<string>(() => {
    const saved = localStorage.getItem('tw_active_page');
    return saved || 'projects';
  });
  const [activeDeptId, setActiveDeptId] = useState<string | null>(() => {
    const saved = localStorage.getItem('tw_active_dept');
    return saved || departments[0]?.id || null;
  });

  const { tr } = useLang();

  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 24, background: '#f8fafc' }}>
      <img
        src={require('./assets/teamwork-logo-spin.png')}
        alt="loading"
        style={{ width: 120, height: 120, objectFit: 'contain', animation: 'spin 1.6s linear infinite' }}
      />
      <p style={{ color: '#6b7280', fontSize: 15, fontWeight: 500 }}>{tr.loading}...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!currentUser) return <LoginPage />;

  const activeDept = departments.find((d) => d.id === activeDeptId);

  useEffect(() => {
    localStorage.setItem('tw_active_page', activePage);
  }, [activePage]);

  useEffect(() => {
    if (activeDeptId) localStorage.setItem('tw_active_dept', activeDeptId);
  }, [activeDeptId]);

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
      case 'operations':
        return <OperationsScreen />;
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
  <LanguageProvider>
    <AppProvider>
      <AppInner />
    </AppProvider>
  </LanguageProvider>
);

export default App;
