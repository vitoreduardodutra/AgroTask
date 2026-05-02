import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Login from '../pages/Login/Login';
import ForgotPassword from '../pages/ForgotPassword/ForgotPassword';
import ResetPassword from '../pages/ResetPassword/ResetPassword';
import Dashboard from '../pages/Dashboard/Dashboard';
import Tasks from '../pages/Tasks/Tasks';
import NewTask from '../pages/NewTask/NewTask';
import TaskDetails from '../pages/TaskDetails/TaskDetails';
import EditTask from '../pages/EditTask/EditTask';
import Evidences from '../pages/Evidences/Evidences';
import RegisterChoice from '../pages/RegisterChoice/RegisterChoice';
import RegisterAdmin from '../pages/RegisterAdmin/RegisterAdmin';
import RegisterEmployee from '../pages/RegisterEmployee/RegisterEmployee';
import FarmManagement from '../pages/FarmManagement/FarmManagement';
import Reports from '../pages/Reports/Reports';

function getStoredAuth() {
  const token = localStorage.getItem('agrotask_token');
  const user = JSON.parse(localStorage.getItem('agrotask_user') || 'null');
  const farm = JSON.parse(localStorage.getItem('agrotask_farm') || 'null');
  const membership = JSON.parse(
    localStorage.getItem('agrotask_membership') || 'null'
  );

  return {
    token,
    user,
    farm,
    membership,
  };
}

function isAuthenticated() {
  const { token, user, farm, membership } = getStoredAuth();

  return Boolean(token && user && farm && membership);
}

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { membership } = getStoredAuth();

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  if (membership?.role !== 'ADMIN') {
    return <Navigate to="/tasks" replace />;
  }

  return children;
}

function PublicOnlyRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPassword />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <PublicOnlyRoute>
              <ResetPassword />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterChoice />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register/admin"
          element={
            <PublicOnlyRoute>
              <RegisterAdmin />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register/employee"
          element={
            <PublicOnlyRoute>
              <RegisterEmployee />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <Tasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/new-task"
          element={
            <AdminRoute>
              <NewTask />
            </AdminRoute>
          }
        />
        <Route
          path="/farm"
          element={
            <AdminRoute>
              <FarmManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <AdminRoute>
              <Reports />
            </AdminRoute>
          }
        />
        <Route
          path="/task-details/:id"
          element={
            <ProtectedRoute>
              <TaskDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit-task/:id"
          element={
            <ProtectedRoute>
              <EditTask />
            </ProtectedRoute>
          }
        />
        <Route
          path="/evidences/:id"
          element={
            <ProtectedRoute>
              <Evidences />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated() ? '/dashboard' : '/'} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
