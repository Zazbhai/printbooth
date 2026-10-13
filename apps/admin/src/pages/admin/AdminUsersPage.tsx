import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  UsersThree,
  ShieldCheck,
  Crown,
  HardDrives,
  Headset,
  Plus,
  MagnifyingGlass,
  Key,
  Prohibit,
  LockOpen,
  Trash,
  PencilSimple,
  CheckCircle,
  X,
  Eye,
  EyeSlash,
  Storefront,
  User,
  ArrowsClockwise,
  ArrowSquareOut,
  Sparkle,
} from '@phosphor-icons/react'
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  changeAdminPassword,
  blockAdminUser,
  unblockAdminUser,
  deleteAdminUser,
  type AdminUserRecord,
} from '@/lib/api'
import './AdminUsersPage.css'

type TabType = 'admins' | 'all' | 'merchants' | 'customers'

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<TabType>('admins')
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<AdminUserRecord[]>([])
  const [merchants, setMerchants] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalAdmins: 0,
    activeAdmins: 0,
    blockedAdmins: 0,
    totalMerchants: 0,
    totalCustomers: 0,
    totalUsers: 0,
  })

  // Filter states
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'SUPERADMIN' | 'OPERATIONS' | 'SUPPORT'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL')

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // ── Modals State ──
  // 1. Add Admin Modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'OPERATIONS' as 'SUPERADMIN' | 'OPERATIONS' | 'SUPPORT',
    phone: '',
    notes: '',
  })
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false)
  const [addError, setAddError] = useState('')

  // 2. Change Password Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [selectedAdminForPassword, setSelectedAdminForPassword] = useState<AdminUserRecord | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  // 3. Edit Admin Modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedAdminForEdit, setSelectedAdminForEdit] = useState<AdminUserRecord | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    username: '',
    role: 'OPERATIONS' as 'SUPERADMIN' | 'OPERATIONS' | 'SUPPORT',
    phone: '',
    notes: '',
  })
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  // 4. Block Confirmation Modal
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [selectedAdminForBlock, setSelectedAdminForBlock] = useState<AdminUserRecord | null>(null)
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false)

  // 5. Delete Confirmation Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedAdminForDelete, setSelectedAdminForDelete] = useState<AdminUserRecord | null>(null)
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false)

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true)
      const data = await getAdminUsers()
      if (data) {
        setAdmins(data.admins || [])
        setMerchants(data.merchants || [])
        setCustomers(data.customers || [])
        if (data.stats) {
          setStats(data.stats)
        }
      }
    } catch (err) {
      console.error('[AdminUsersPage] Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev))
    }, 3500)
  }

  // Password Generator
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
    let pass = ''
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pass
  }

  // ── Filtered Admins ──
  const filteredAdmins = useMemo(() => {
    return admins.filter((a) => {
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.phone && a.phone.includes(q)) ||
        a.adminId.toLowerCase().includes(q)

      const matchesRole = roleFilter === 'ALL' || a.role === roleFilter
      const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [admins, search, roleFilter, statusFilter])

  // ── Handlers ──
  const handleOpenAddModal = () => {
    const defaultPass = generateRandomPassword()
    setAddForm({
      name: '',
      email: '',
      username: '',
      password: defaultPass,
      role: 'OPERATIONS',
      phone: '',
      notes: '',
    })
    setShowAddPassword(true)
    setAddError('')
    setAddModalOpen(true)
  }

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setAddError('')
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.username.trim()) {
      setAddError('Please fill in all required fields.')
      return
    }

    setIsSubmittingAdd(true)
    try {
      const res = await createAdminUser(addForm)
      if (res?.success) {
        showToast(`Administrator "${addForm.name}" created successfully.`)
        setAddModalOpen(false)
        fetchData()
      } else {
        setAddError(res?.error || 'Failed to create administrator.')
      }
    } catch (err: any) {
      setAddError(err.response?.data?.error || err.message || 'Error creating administrator.')
    } finally {
      setIsSubmittingAdd(false)
    }
  }

  const handleOpenPasswordModal = (admin: AdminUserRecord) => {
    setSelectedAdminForPassword(admin)
    const gen = generateRandomPassword()
    setNewPassword(gen)
    setConfirmPassword(gen)
    setShowChangePassword(true)
    setPasswordError('')
    setPasswordModalOpen(true)
  }

  const handleChangePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (!selectedAdminForPassword) return

    if (!newPassword.trim() || newPassword.length < 4) {
      setPasswordError('Password must be at least 4 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setIsSubmittingPassword(true)
    try {
      await changeAdminPassword(selectedAdminForPassword.adminId, newPassword)
      showToast(`Password updated for ${selectedAdminForPassword.name}.`)
      setPasswordModalOpen(false)
      fetchData()
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || err.message || 'Failed to update password.')
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  const handleOpenEditModal = (admin: AdminUserRecord) => {
    setSelectedAdminForEdit(admin)
    setEditForm({
      name: admin.name,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      phone: admin.phone || '',
      notes: admin.notes || '',
    })
    setEditError('')
    setEditModalOpen(true)
  }

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEditError('')
    if (!selectedAdminForEdit) return

    setIsSubmittingEdit(true)
    try {
      await updateAdminUser(selectedAdminForEdit.adminId, editForm)
      showToast(`Administrator profile for "${editForm.name}" updated.`)
      setEditModalOpen(false)
      fetchData()
    } catch (err: any) {
      setEditError(err.response?.data?.error || err.message || 'Failed to update administrator.')
    } finally {
      setIsSubmittingEdit(false)
    }
  }

  const handleToggleBlock = (admin: AdminUserRecord) => {
    if (admin.isRoot) {
      showToast('Cannot suspend the primary root administrator.')
      return
    }
    setSelectedAdminForBlock(admin)
    setBlockModalOpen(true)
  }

  const handleConfirmBlockAction = async () => {
    if (!selectedAdminForBlock) return
    setIsSubmittingBlock(true)
    try {
      if (selectedAdminForBlock.status === 'ACTIVE') {
        await blockAdminUser(selectedAdminForBlock.adminId)
        showToast(`Administrator "${selectedAdminForBlock.name}" has been suspended.`)
      } else {
        await unblockAdminUser(selectedAdminForBlock.adminId)
        showToast(`Administrator "${selectedAdminForBlock.name}" has been reactivated.`)
      }
      setBlockModalOpen(false)
      fetchData()
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Failed to update status.')
    } finally {
      setIsSubmittingBlock(false)
    }
  }

  const handleOpenDeleteModal = (admin: AdminUserRecord) => {
    if (admin.isRoot) {
      showToast('Cannot delete the primary root administrator.')
      return
    }
    setSelectedAdminForDelete(admin)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedAdminForDelete) return
    setIsSubmittingDelete(true)
    try {
      await deleteAdminUser(selectedAdminForDelete.adminId)
      showToast(`Administrator "${selectedAdminForDelete.name}" permanently deleted.`)
      setDeleteModalOpen(false)
      fetchData()
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Failed to delete administrator.')
    } finally {
      setIsSubmittingDelete(false)
    }
  }

  return (
    <div className="admin-users-page">
      {/* ── Top Header ── */}
      <div className="users-header">
        <div className="users-header__title-group">
          <span className="users-header__badge">
            <ShieldCheck size={14} weight="bold" />
            <span>Platform Governance & RBAC</span>
          </span>
          <h1 className="users-header__title">Admin Users</h1>
          <p className="users-header__sub">
            Supervise platform administrators, credential permissions, access statuses, and directory accounts across the network.
          </p>
        </div>

        <div className="users-header__actions">
          <button
            type="button"
            className="btn-secondary-dark"
            onClick={fetchData}
            title="Refresh User Data"
          >
            <ArrowsClockwise size={16} weight="bold" className={loading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
          <button
            type="button"
            className="btn-primary-lime"
            onClick={handleOpenAddModal}
          >
            <Plus size={16} weight="bold" />
            <span>Add New Admin</span>
          </button>
        </div>
      </div>

      {/* ── Top Metrics Grid ── */}
      <div className="users-metrics-grid">
        <div className="metric-card">
          <div className="metric-card__icon-box lime">
            <ShieldCheck size={24} weight="duotone" />
          </div>
          <div className="metric-card__info">
            <span className="metric-card__label">Total Admins</span>
            <span className="metric-card__value">{stats.totalAdmins}</span>
            <span className="metric-card__sub">Platform operators</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-card__icon-box cyan">
            <CheckCircle size={24} weight="duotone" />
          </div>
          <div className="metric-card__info">
            <span className="metric-card__label">Active Clearances</span>
            <span className="metric-card__value">{stats.activeAdmins}</span>
            <span className="metric-card__sub">Healthy access state</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-card__icon-box red">
            <Prohibit size={24} weight="duotone" />
          </div>
          <div className="metric-card__info">
            <span className="metric-card__label">Suspended Admins</span>
            <span className="metric-card__value">{stats.blockedAdmins}</span>
            <span className="metric-card__sub">Revoked permissions</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-card__icon-box purple">
            <UsersThree size={24} weight="duotone" />
          </div>
          <div className="metric-card__info">
            <span className="metric-card__label">Directory Total</span>
            <span className="metric-card__value">{stats.totalUsers}</span>
            <span className="metric-card__sub">Admins, hosts & customers</span>
          </div>
        </div>
      </div>

      {/* ── Segmented Navigation Tabs ── */}
      <div className="users-tabs-bar">
        <div className="users-tabs-group">
          <button
            type="button"
            className={`users-tab-btn ${activeTab === 'admins' ? 'active' : ''}`}
            onClick={() => setActiveTab('admins')}
          >
            <ShieldCheck size={16} weight="bold" />
            <span>Administrators</span>
            <span className="users-tab-btn__badge">{admins.length}</span>
          </button>
          <button
            type="button"
            className={`users-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <UsersThree size={16} weight="bold" />
            <span>All Directory Accounts</span>
            <span className="users-tab-btn__badge">{stats.totalUsers}</span>
          </button>
          <button
            type="button"
            className={`users-tab-btn ${activeTab === 'merchants' ? 'active' : ''}`}
            onClick={() => setActiveTab('merchants')}
          >
            <Storefront size={16} weight="bold" />
            <span>Merchant Partners</span>
            <span className="users-tab-btn__badge">{merchants.length}</span>
          </button>
          <button
            type="button"
            className={`users-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            <User size={16} weight="bold" />
            <span>Campus Customers</span>
            <span className="users-tab-btn__badge">{customers.length}</span>
          </button>
        </div>

        {activeTab === 'merchants' && (
          <Link
            to="/admin/merchants"
            className="btn-secondary-dark"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            <span>Open Merchant Hardware Console</span>
            <ArrowSquareOut size={14} />
          </Link>
        )}
      </div>

      {/* ── Search & Filter Controls (for Admins & Directory) ── */}
      <div className="users-filters-row">
        <div className="users-search-box">
          <MagnifyingGlass size={18} className="users-search-box__icon" />
          <input
            type="text"
            className="users-search-input"
            placeholder={
              activeTab === 'admins'
                ? 'Search admin by name, email, username or phone…'
                : 'Search accounts by identity, phone, or email…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {activeTab === 'admins' && (
          <>
            <select
              className="users-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
            >
              <option value="ALL">All Roles</option>
              <option value="SUPERADMIN">Super Administrator</option>
              <option value="OPERATIONS">Fleet Operations</option>
              <option value="SUPPORT">Support Engineer</option>
            </select>

            <select
              className="users-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Clearances</option>
              <option value="BLOCKED">Suspended / Blocked</option>
            </select>
          </>
        )}
      </div>

      {/* ── TAB 1: ADMINISTRATORS ── */}
      {activeTab === 'admins' && (
        <div className="users-table-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Role & Scope</th>
                <th>Access Status</th>
                <th>Contact</th>
                <th>Security & Activity</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-table-state">
                      <ShieldCheck className="empty-table-state__icon" />
                      <p className="empty-table-state__text">
                        No administrators found matching your search and filter criteria.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => {
                  const roleClass = (admin.role || 'OPERATIONS').toLowerCase()
                  const isSuper = admin.role === 'SUPERADMIN' || admin.isRoot

                  return (
                    <tr key={admin.adminId}>
                      {/* Identity */}
                      <td>
                        <div className="user-identity-cell">
                          <div className={`user-avatar ${roleClass}`}>
                            {isSuper ? (
                              <Crown size={18} weight="fill" />
                            ) : admin.role === 'SUPPORT' ? (
                              <Headset size={18} weight="bold" />
                            ) : (
                              <HardDrives size={18} weight="bold" />
                            )}
                          </div>
                          <div className="user-identity__details">
                            <div className="user-identity__name-row">
                              <span className="user-identity__name">{admin.name}</span>
                              {admin.isRoot && (
                                <span className="user-identity__root-pill">ROOT SUPERUSER</span>
                              )}
                            </div>
                            <div className="user-identity__meta">
                              <span>@{admin.username}</span>
                              <span>•</span>
                              <span>{admin.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td>
                        <span className={`role-badge ${roleClass}`}>
                          {isSuper ? (
                            <>
                              <Crown size={12} weight="fill" />
                              <span>Super Administrator</span>
                            </>
                          ) : admin.role === 'SUPPORT' ? (
                            <>
                              <Headset size={12} weight="bold" />
                              <span>Support Lead</span>
                            </>
                          ) : (
                            <>
                              <HardDrives size={12} weight="bold" />
                              <span>Fleet Operations</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`status-pill ${
                            admin.status === 'BLOCKED' ? 'blocked' : 'active'
                          }`}
                        >
                          {admin.status === 'BLOCKED' ? 'Suspended' : 'Active'}
                        </span>
                      </td>

                      {/* Contact */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                            {admin.phone || '—'}
                          </span>
                          {admin.notes && (
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              {admin.notes}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Activity */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            Last login:{' '}
                            <strong style={{ color: '#e2e8f0' }}>
                              {admin.lastLogin
                                ? new Date(admin.lastLogin).toLocaleDateString('en-IN', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Recent'}
                            </strong>
                          </span>
                          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            ID: {admin.adminId}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions-group" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="action-icon-btn warning"
                            onClick={() => handleOpenPasswordModal(admin)}
                            title="Change Administrator Password"
                          >
                            <Key size={15} weight="bold" />
                          </button>

                          <button
                            type="button"
                            className={`action-icon-btn ${
                              admin.status === 'ACTIVE' ? 'danger' : 'success'
                            }`}
                            onClick={() => handleToggleBlock(admin)}
                            disabled={admin.isRoot}
                            title={
                              admin.isRoot
                                ? 'Root administrator cannot be suspended'
                                : admin.status === 'ACTIVE'
                                ? 'Suspend Access'
                                : 'Restore Access'
                            }
                          >
                            {admin.status === 'ACTIVE' ? (
                              <Prohibit size={15} weight="bold" />
                            ) : (
                              <LockOpen size={15} weight="bold" />
                            )}
                          </button>

                          <button
                            type="button"
                            className="action-icon-btn"
                            onClick={() => handleOpenEditModal(admin)}
                            title="Edit Profile"
                          >
                            <PencilSimple size={15} weight="bold" />
                          </button>

                          <button
                            type="button"
                            className="action-icon-btn danger"
                            onClick={() => handleOpenDeleteModal(admin)}
                            disabled={admin.isRoot}
                            title={
                              admin.isRoot
                                ? 'Root administrator cannot be deleted'
                                : 'Permanently Delete Admin'
                            }
                          >
                            <Trash size={15} weight="bold" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 2: ALL DIRECTORY ACCOUNTS ── */}
      {activeTab === 'all' && (
        <div className="users-table-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Account Identity</th>
                <th>Classification</th>
                <th>Access Status</th>
                <th>Associated Hub / Identifier</th>
                <th>Record Created</th>
              </tr>
            </thead>
            <tbody>
              {/* Admins */}
              {admins.map((a) => (
                <tr key={`all-adm-${a.adminId}`}>
                  <td>
                    <div className="user-identity-cell">
                      <div className="user-avatar superadmin">
                        <ShieldCheck size={18} weight="bold" />
                      </div>
                      <div className="user-identity__details">
                        <span className="user-identity__name">{a.name}</span>
                        <span className="user-identity__meta">{a.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="role-badge superadmin">Platform Admin</span>
                  </td>
                  <td>
                    <span className={`status-pill ${a.status === 'BLOCKED' ? 'blocked' : 'active'}`}>
                      {a.status === 'BLOCKED' ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Central Infrastructure</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-IN') : 'Primary'}
                    </span>
                  </td>
                </tr>
              ))}

              {/* Merchants */}
              {merchants.map((m) => (
                <tr key={`all-mer-${m.merchantId}`}>
                  <td>
                    <div className="user-identity-cell">
                      <div className="user-avatar merchant">
                        <Storefront size={18} weight="bold" />
                      </div>
                      <div className="user-identity__details">
                        <span className="user-identity__name">{m.name}</span>
                        <span className="user-identity__meta">{m.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="role-badge merchant">Merchant Host</span>
                  </td>
                  <td>
                    <span className={`status-pill ${m.status === 'BLOCKED' ? 'blocked' : 'active'}`}>
                      {m.status === 'BLOCKED' ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.84rem', color: '#c8ff00', fontWeight: 600 }}>
                      {m.storeName} ({m.kioskId})
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-IN') : 'Registered'}
                    </span>
                  </td>
                </tr>
              ))}

              {/* Customers */}
              {customers.map((c) => (
                <tr key={`all-cust-${c.userId}`}>
                  <td>
                    <div className="user-identity-cell">
                      <div className="user-avatar customer">
                        <User size={18} weight="bold" />
                      </div>
                      <div className="user-identity__details">
                        <span className="user-identity__name">{c.identifier}</span>
                        <span className="user-identity__meta">{c.email || c.phone || 'Campus User'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="role-badge customer">Campus Customer</span>
                  </td>
                  <td>
                    <span className="status-pill active">Verified</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
                      {c.totalOrders} print orders (₹{c.totalSpent})
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 3: MERCHANT PARTNERS ── */}
      {activeTab === 'merchants' && (
        <div className="users-table-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Venue Partner</th>
                <th>Assigned Kiosk Hub</th>
                <th>Store Login Username</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.merchantId}>
                  <td>
                    <div className="user-identity-cell">
                      <div className="user-avatar merchant">
                        <Storefront size={18} weight="bold" />
                      </div>
                      <div className="user-identity__details">
                        <span className="user-identity__name">{m.name}</span>
                        <span className="user-identity__meta">{m.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600, color: '#ffffff' }}>{m.storeName}</span>
                      <span style={{ fontSize: '0.76rem', color: '#c8ff00' }}>Kiosk: {m.kioskId}</span>
                    </div>
                  </td>
                  <td>
                    <code style={{ background: '#111114', padding: '3px 8px', borderRadius: 4, color: '#cbd5e1' }}>
                      @{m.username || 'merchant_kiosk'}
                    </code>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>{m.phone}</span>
                  </td>
                  <td>
                    <span className={`status-pill ${m.status === 'BLOCKED' ? 'blocked' : 'active'}`}>
                      {m.status === 'BLOCKED' ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 4: CAMPUS CUSTOMERS ── */}
      {activeTab === 'customers' && (
        <div className="users-table-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Customer Identity</th>
                <th>Phone / Email</th>
                <th>Total Orders</th>
                <th>Pages Printed</th>
                <th>Total Spent</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.userId}>
                  <td>
                    <div className="user-identity-cell">
                      <div className="user-avatar customer">
                        <User size={18} weight="bold" />
                      </div>
                      <span className="user-identity__name">{c.identifier}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
                      {c.phone || c.email || '—'}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: '#ffffff' }}>{c.totalOrders}</strong>
                  </td>
                  <td>
                    <span style={{ color: '#cbd5e1' }}>{c.totalPages} pgs</span>
                  </td>
                  <td>
                    <span style={{ color: '#c8ff00', fontWeight: 700 }}>₹{c.totalSpent}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(c.lastActive).toLocaleDateString('en-IN')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 1: ADD NEW ADMIN (Portal Rendering for Zero Layout Shift)
          ═══════════════════════════════════════════════════════════════════ */}
      {addModalOpen &&
        createPortal(
          <div className="modal-backdrop-overlay" onClick={() => setAddModalOpen(false)}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal__header">
                <div className="admin-modal__title-group">
                  <div className="admin-modal__icon-badge lime">
                    <Plus size={20} weight="bold" />
                  </div>
                  <div>
                    <h3 className="admin-modal__title">Create Administrator</h3>
                    <p className="admin-modal__sub">Grant platform operator access and credentials</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal__close-btn"
                  onClick={() => setAddModalOpen(false)}
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit}>
                <div className="admin-modal__body">
                  {addError && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                    }}>
                      {addError}
                    </div>
                  )}

                  <div className="admin-form-group">
                    <label className="admin-form-label">Full Name *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="e.g. Vikramaditya Joshi"
                      required
                      value={addForm.name}
                      onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Email Address *</label>
                    <input
                      type="email"
                      className="admin-form-input"
                      placeholder="e.g. vikram@printbooth.in"
                      required
                      value={addForm.email}
                      onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Console Username *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="e.g. vikram_ops"
                      required
                      value={addForm.username}
                      onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      <span>Initial Password *</span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#c8ff00',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onClick={() => setAddForm((f) => ({ ...f, password: generateRandomPassword() }))}
                      >
                        <Sparkle size={12} weight="fill" />
                        <span>Generate Random</span>
                      </button>
                    </label>
                    <div className="input-with-button-wrap">
                      <input
                        type={showAddPassword ? 'text' : 'password'}
                        className="admin-form-input"
                        placeholder="Secure Password"
                        required
                        value={addForm.password}
                        onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="generate-pass-btn"
                        onClick={() => setShowAddPassword(!showAddPassword)}
                        title={showAddPassword ? 'Hide password' : 'Show password'}
                      >
                        {showAddPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Administrative Role</label>
                    <select
                      className="admin-form-select"
                      value={addForm.role}
                      onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as any }))}
                    >
                      <option value="OPERATIONS">Fleet Operations (Hardware, Kiosks, Telemetry)</option>
                      <option value="SUPPORT">Support Engineer (Help Desk, Alerts, Supplies)</option>
                      <option value="SUPERADMIN">Super Administrator (Full System Governance)</option>
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Phone Number (Optional)</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="+91 98XXX XXXXX"
                      value={addForm.phone}
                      onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Operational Notes (Optional)</label>
                    <textarea
                      className="admin-form-textarea"
                      rows={2}
                      placeholder="Role scope or campus jurisdiction notes..."
                      value={addForm.notes}
                      onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="admin-modal__footer">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setAddModalOpen(false)}
                    disabled={isSubmittingAdd}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-lime"
                    disabled={isSubmittingAdd}
                  >
                    <span>{isSubmittingAdd ? 'Provisioning…' : 'Create Admin'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 2: CHANGE PASSWORD (Portal Rendering)
          ═══════════════════════════════════════════════════════════════════ */}
      {passwordModalOpen &&
        selectedAdminForPassword &&
        createPortal(
          <div className="modal-backdrop-overlay" onClick={() => setPasswordModalOpen(false)}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal__header">
                <div className="admin-modal__title-group">
                  <div className="admin-modal__icon-badge amber">
                    <Key size={20} weight="bold" />
                  </div>
                  <div>
                    <h3 className="admin-modal__title">Update Password</h3>
                    <p className="admin-modal__sub">
                      Credentials for {selectedAdminForPassword.name} (@{selectedAdminForPassword.username})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal__close-btn"
                  onClick={() => setPasswordModalOpen(false)}
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleChangePasswordSubmit}>
                <div className="admin-modal__body">
                  {passwordError && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                    }}>
                      {passwordError}
                    </div>
                  )}

                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      <span>New Password *</span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#c8ff00',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          const p = generateRandomPassword()
                          setNewPassword(p)
                          setConfirmPassword(p)
                        }}
                      >
                        Generate Random
                      </button>
                    </label>
                    <div className="input-with-button-wrap">
                      <input
                        type={showChangePassword ? 'text' : 'password'}
                        className="admin-form-input"
                        placeholder="Enter new password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="generate-pass-btn"
                        onClick={() => setShowChangePassword(!showChangePassword)}
                      >
                        {showChangePassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Confirm New Password *</label>
                    <input
                      type={showChangePassword ? 'text' : 'password'}
                      className="admin-form-input"
                      placeholder="Repeat new password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="admin-modal__footer">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setPasswordModalOpen(false)}
                    disabled={isSubmittingPassword}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-lime"
                    disabled={isSubmittingPassword}
                  >
                    <span>{isSubmittingPassword ? 'Saving…' : 'Update Password'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 3: EDIT ADMIN (Portal Rendering)
          ═══════════════════════════════════════════════════════════════════ */}
      {editModalOpen &&
        selectedAdminForEdit &&
        createPortal(
          <div className="modal-backdrop-overlay" onClick={() => setEditModalOpen(false)}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal__header">
                <div className="admin-modal__title-group">
                  <div className="admin-modal__icon-badge lime">
                    <PencilSimple size={20} weight="bold" />
                  </div>
                  <div>
                    <h3 className="admin-modal__title">Edit Administrator</h3>
                    <p className="admin-modal__sub">Update profile details for {selectedAdminForEdit.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal__close-btn"
                  onClick={() => setEditModalOpen(false)}
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit}>
                <div className="admin-modal__body">
                  {editError && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                    }}>
                      {editError}
                    </div>
                  )}

                  <div className="admin-form-group">
                    <label className="admin-form-label">Full Name *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Email Address *</label>
                    <input
                      type="email"
                      className="admin-form-input"
                      required
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Username *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      required
                      value={editForm.username}
                      onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                    />
                  </div>

                  {!selectedAdminForEdit.isRoot && (
                    <div className="admin-form-group">
                      <label className="admin-form-label">Role Classification</label>
                      <select
                        className="admin-form-select"
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as any }))}
                      >
                        <option value="OPERATIONS">Fleet Operations</option>
                        <option value="SUPPORT">Support Engineer</option>
                        <option value="SUPERADMIN">Super Administrator</option>
                      </select>
                    </div>
                  )}

                  <div className="admin-form-group">
                    <label className="admin-form-label">Phone</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Notes</label>
                    <textarea
                      className="admin-form-textarea"
                      rows={2}
                      value={editForm.notes}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="admin-modal__footer">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setEditModalOpen(false)}
                    disabled={isSubmittingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-lime"
                    disabled={isSubmittingEdit}
                  >
                    <span>{isSubmittingEdit ? 'Saving…' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 4: BLOCK / UNBLOCK CONFIRMATION
          ═══════════════════════════════════════════════════════════════════ */}
      {blockModalOpen &&
        selectedAdminForBlock &&
        createPortal(
          <div className="modal-backdrop-overlay" onClick={() => setBlockModalOpen(false)}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal__header">
                <div className="admin-modal__title-group">
                  <div className={`admin-modal__icon-badge ${selectedAdminForBlock.status === 'ACTIVE' ? 'red' : 'lime'}`}>
                    {selectedAdminForBlock.status === 'ACTIVE' ? (
                      <Prohibit size={20} weight="bold" />
                    ) : (
                      <LockOpen size={20} weight="bold" />
                    )}
                  </div>
                  <div>
                    <h3 className="admin-modal__title">
                      {selectedAdminForBlock.status === 'ACTIVE' ? 'Suspend Administrator' : 'Reactivate Administrator'}
                    </h3>
                    <p className="admin-modal__sub">{selectedAdminForBlock.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal__close-btn"
                  onClick={() => setBlockModalOpen(false)}
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <div className="admin-modal__body">
                <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>
                  {selectedAdminForBlock.status === 'ACTIVE'
                    ? `Are you sure you want to suspend administrator "${selectedAdminForBlock.name}"? They will immediately lose access to the PrintBooth operations console and all hardware telemetry controls.`
                    : `Reactivate administrator access for "${selectedAdminForBlock.name}"? They will be able to log in to the console immediately.`}
                </p>
              </div>

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setBlockModalOpen(false)}
                  disabled={isSubmittingBlock}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={selectedAdminForBlock.status === 'ACTIVE' ? 'btn-modal-danger' : 'btn-primary-lime'}
                  onClick={handleConfirmBlockAction}
                  disabled={isSubmittingBlock}
                >
                  <span>
                    {isSubmittingBlock
                      ? 'Processing…'
                      : selectedAdminForBlock.status === 'ACTIVE'
                      ? 'Yes, Suspend Access'
                      : 'Yes, Reactivate Access'}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 5: DELETE CONFIRMATION
          ═══════════════════════════════════════════════════════════════════ */}
      {deleteModalOpen &&
        selectedAdminForDelete &&
        createPortal(
          <div className="modal-backdrop-overlay" onClick={() => setDeleteModalOpen(false)}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal__header">
                <div className="admin-modal__title-group">
                  <div className="admin-modal__icon-badge red">
                    <Trash size={20} weight="bold" />
                  </div>
                  <div>
                    <h3 className="admin-modal__title">Delete Administrator</h3>
                    <p className="admin-modal__sub">{selectedAdminForDelete.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal__close-btn"
                  onClick={() => setDeleteModalOpen(false)}
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <div className="admin-modal__body">
                <p style={{ fontSize: '0.9rem', color: '#f87171', lineHeight: 1.5, margin: 0 }}>
                  This action is permanent and cannot be undone. All security clearances and access keys for{' '}
                  <strong>{selectedAdminForDelete.name}</strong> (@{selectedAdminForDelete.username}) will be permanently erased.
                </p>
              </div>

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={isSubmittingDelete}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-danger"
                  onClick={handleConfirmDelete}
                  disabled={isSubmittingDelete}
                >
                  <span>{isSubmittingDelete ? 'Deleting…' : 'Delete Administrator'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── Toast Alert ── */}
      {toastMessage && (
        <div className="floating-toast-alert">
          <CheckCircle size={18} weight="fill" color="#c8ff00" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
