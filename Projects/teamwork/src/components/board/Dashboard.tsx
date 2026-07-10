import React from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, RadialBarChart, RadialBar
} from 'recharts';
import { Package, CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { getPriorityConfig, getColumnStatus, formatDate, isOverdue } from '../../utils/helpers';
import { useLang } from '../../contexts/LanguageContext';
import Header from '../layout/Header';

interface DashboardProps {
  onNavigate: (page: string) => void;
  onSelectDept: (id: string) => void;
}

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onSelectDept }) => {
  const { state } = useApp();
  const { lang } = useLang();
  const priorityConfig = getPriorityConfig(lang);
  const { orders, departments, currentUser } = state;

  const isAdmin = currentUser?.role === 'admin';
  const activeOrders = orders.filter((o) => !o.deletedAt);
  const myOrders = isAdmin ? activeOrders : activeOrders.filter((o) =>
    o.assignedUsers?.includes(currentUser?.id || '') || o.departmentId === currentUser?.departmentId
  );

  const recentOrders = [...myOrders]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  const allActive = activeOrders.filter((o) => o.status !== 'cancelled');
  const totalOrders = allActive.length;
  const doneOrders = allActive.filter((o) => o.status === 'done').length;
  const inProgressOrders = allActive.filter((o) => o.status === 'in_progress' || o.status === 'review').length;
  const overdueOrders = allActive.filter((o) => isOverdue(o.dueDate) && o.status !== 'done').length;
  const newOrders = allActive.filter((o) => o.status === 'new').length;
  const completionRate = totalOrders > 0 ? Math.round((doneOrders / totalOrders) * 100) : 0;

  // Pie chart: status breakdown
  const statusData = [
    { name: 'منجزة', value: doneOrders, color: '#10b981' },
    { name: 'قيد التنفيذ', value: inProgressOrders, color: '#f59e0b' },
    { name: 'جديدة', value: newOrders, color: '#6366f1' },
    { name: 'متأخرة', value: overdueOrders, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // Bar chart: orders per department
  const deptBarData = [...departments].reverse().map((d) => {
    const dOrders = allActive.filter((o) => o.departmentId === d.id);
    return {
      name: d.name.replace('قسم ', ''),
      total: dOrders.length,
      منجز: dOrders.filter((o) => o.status === 'done').length,
      نشط: dOrders.filter((o) => o.status !== 'done').length,
      color: d.color,
    };
  });

  // Priority distribution
  const priorityData = [
    { name: 'عاجل', value: allActive.filter((o) => o.priority === 'urgent').length, color: '#ef4444' },
    { name: 'عالية', value: allActive.filter((o) => o.priority === 'high').length, color: '#f59e0b' },
    { name: 'متوسطة', value: allActive.filter((o) => o.priority === 'medium').length, color: '#6366f1' },
    { name: 'عادية', value: allActive.filter((o) => o.priority === 'low').length, color: '#10b981' },
  ].filter((d) => d.value > 0);

  const stats = [
    { label: 'متأخرة', value: overdueOrders, icon: <AlertTriangle size={20} />, color: '#ef4444', bg: '#fef2f2' },
    { label: 'منجزة', value: doneOrders, icon: <CheckCircle size={20} />, color: '#10b981', bg: '#ecfdf5' },
    { label: 'قيد التنفيذ', value: inProgressOrders, icon: <Clock size={20} />, color: '#f59e0b', bg: '#fffbeb' },
    { label: 'إجمالي الطلبيات', value: totalOrders, icon: <Package size={20} />, color: '#6366f1', bg: '#eef2ff' },
  ];

  return (
    <div className="page">
      <Header title="لوحة الإنجاز" subtitle={`مرحباً، ${currentUser?.fullName}`} />
      <div className="page-content">

        {/* Top stat cards */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {stats.map((s) => (
            <div key={s.label} className="stat-card" style={{ '--stat-color': s.color } as any}>
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              <div className="stat-info">
                <span className="stat-value" style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row 1 */}
        <div className="dash-charts-row">

          {/* Donut: status */}
          <div className="dash-chart-card">
            <h4 className="dash-chart-title">توزيع حالات الطلبيات</h4>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    dataKey="value" labelLine={false} label={renderCustomLabel}>
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [v, n]} />
                  <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ fontSize: 11, color: '#374151' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="dash-empty">لا توجد بيانات</div>}
          </div>

          {/* Pie: priority */}
          <div className="dash-chart-card">
            <h4 className="dash-chart-title">توزيع الأولوية</h4>
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={priorityData} cx="50%" cy="50%" outerRadius={90}
                    dataKey="value" labelLine={false} label={renderCustomLabel}>
                    {priorityData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ fontSize: 11, color: '#374151' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="dash-empty">لا توجد بيانات</div>}
          </div>

          {/* Completion rate radial */}
          <div className="dash-chart-card dash-chart-center">
            <h4 className="dash-chart-title">نسبة الإنجاز الكلية</h4>
            <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%"
                  data={[{ value: completionRate, fill: '#10b981' }]} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#e5e7eb' }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>{completionRate}%</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>مكتملة</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{doneOrders}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>منجزة</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#6366f1' }}>{totalOrders - doneOrders}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>متبقية</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bar chart: dept comparison */}
        <div className="dash-chart-card dash-chart-wide">
          <h4 className="dash-chart-title">الطلبيات حسب القسم</h4>
          {deptBarData.some((d) => d.total > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deptBarData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip />
                <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ fontSize: 11, color: '#374151' }}>{v}</span>} />
                <Bar dataKey="نشط" stackId="a" fill="#6366f1" radius={[0, 0, 4, 4]} />
                <Bar dataKey="منجز" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="dash-empty">لا توجد بيانات</div>}
        </div>

        {/* Recent Orders Table */}
        <div className="dashboard-card recent-orders">
          <div className="card-title-row">
            <h3><TrendingUp size={18} /> آخر الطلبيات</h3>
            <button className="link-btn" onClick={() => onNavigate('orders')}>عرض الكل</button>
          </div>
          <div className="orders-table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>القسم</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const dept = departments.find((d) => d.id === o.departmentId);
                  const st = getColumnStatus(o, departments);
                  const pr = priorityConfig[o.priority] || priorityConfig['medium'];
                  const overdue = isOverdue(o.dueDate) && o.status !== 'done';
                  return (
                    <tr key={o.id} className={`table-row ${overdue ? 'row-overdue' : ''}`}
                      onClick={() => { onSelectDept(o.departmentId); onNavigate('board'); }}>
                      <td className="order-title-cell">{o.clientName}</td>
                      <td>
                        <span className="dept-chip" style={{ background: dept?.color + '22', color: dept?.color }}>
                          {dept?.name}
                        </span>
                      </td>
                      <td><span className="badge" style={{ background: pr.bg, color: pr.color }}>{pr.label}</span></td>
                      <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                      <td className="time-cell">{formatDate(o.updatedAt)}</td>
                    </tr>
                  );
                })}
                {recentOrders.length === 0 && (
                  <tr><td colSpan={5} className="empty-row">لا توجد طلبيات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
