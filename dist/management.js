/**
 * Sheetwise Management Client System
 * Handles:
 * 1. Customer Dashboard (Listing, Search, Add, Edit, Delete)
 * 2. Customer Profile & Activity (Projects & Quick Cuts unified list, New Project)
 * 3. Wood Cutting Integration (Project saving, Quick Cut saving with Confirmation Dialogs)
 */

(function () {
  'use strict';

  // State for Navigation and Current Context
  const AppState = {
    currentUser: null,        // Logged-in user object {id, name, email}
    currentView: 'customers', // 'login' | 'customers' | 'profile' | 'cutting'
    currentCustomer: null,    // Customer object currently opened in profile
    currentProject: null,     // Project object if working on a project
    currentQuickRecord: null, // Quick record object if editing an existing quick record
    quickCustomer: null,      // Customer object selected/typed in quick cut mode
    isQuickCut: false,        // True if currently in quick cut mode
    saveStatus: 'idle',       // 'idle' | 'saving' | 'saved' | 'dirty'
  };

  // Utility helpers
  const dom = {
    id: id => document.getElementById(id),
    show: el => { if (el) el.removeAttribute('hidden'); },
    hide: el => { if (el) el.setAttribute('hidden', ''); },
    text: (el, t) => { if (el) el.textContent = t; },
    val: (el, v) => { if (el) { if (v !== undefined) el.value = v; return el.value; } },
    create: (tag, attrs = {}, children = []) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      for (const c of children) {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
      }
      return e;
    }
  };

  // API Client
  const API = {
    async getCustomers(q = '') {
      const res = await fetch('/api/customers' + (q ? '?q=' + encodeURIComponent(q) : ''));
      if (!res.ok) throw new Error('Failed to load customers');
      return await res.json();
    },
    async getCustomer(id) {
      const res = await fetch(`/api/customers/${id}`);
      if (!res.ok) throw new Error('Customer not found');
      return await res.json();
    },
    async getCustomerActivity(id) {
      const res = await fetch(`/api/customers/${id}/activity`);
      if (!res.ok) throw new Error('Failed to load customer activity');
      return await res.json();
    },
    async createCustomer(data) {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create customer');
      return await res.json();
    },
    async updateCustomer(id, data) {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update customer');
      return await res.json();
    },
    async deleteCustomer(id) {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete customer');
      return await res.json();
    },
    async checkCustomer(name) {
      const res = await fetch('/api/customers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) return { exists: false, customer: null };
      return await res.json();
    },
    async createProject(data) {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create project');
      return await res.json();
    },
    async getProject(id) {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Project not found');
      return await res.json();
    },
    async deleteProject(id) {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete project');
      return await res.json();
    },
    async getRecord(id) {
      const res = await fetch(`/api/records/${id}`);
      if (!res.ok) throw new Error('Record not found');
      return await res.json();
    },
    async deleteRecord(id) {
      const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete record');
      return await res.json();
    },
    async saveQuickRecord(data) {
      const res = await fetch('/api/records/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save quick record');
      return await res.json();
    },
    async saveProjectRecord(data) {
      const res = await fetch('/api/records/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save project record');
      return await res.json();
    },
    async login(username, password) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email: username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      return data;
    }
  };

  // Router & Navigation
  function navigateTo(view, params = {}) {
    // If not logged in and not trying to login, show login view
    if (!AppState.currentUser && view !== 'login') {
      view = 'login';
    }

    AppState.currentView = view;
    // Update active nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.target === view);
    });

    const vLogin = dom.id('view-login');
    const vCustomers = dom.id('view-customers');
    const vProfile = dom.id('view-profile');
    const vCutting = dom.id('view-cutting');

    dom.hide(vLogin);
    dom.hide(vCustomers);
    dom.hide(vProfile);
    dom.hide(vCutting);

    if (view === 'login') {
      dom.show(vLogin);
      setupAuthView();
    } else if (view === 'customers') {
      dom.show(vCustomers);
      loadCustomersDashboard();
    } else if (view === 'profile') {
      dom.show(vProfile);
      if (params.customerId) {
        loadCustomerProfile(params.customerId);
      }
    } else if (view === 'cutting') {
      dom.show(vCutting);
      setupCuttingInterface(params);
    }
  }

  // -------------------------------------------------------------
  // AUTH VIEW: LOGIN
  // -------------------------------------------------------------
  function setupAuthView() {
    dom.val(dom.id('auth-username'), '');
    dom.val(dom.id('auth-password'), '');
    const errEl = dom.id('auth-error');
    if (errEl) {
      errEl.textContent = '';
      dom.hide(errEl);
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = (dom.val(dom.id('auth-username')) || '').trim();
    const password = dom.val(dom.id('auth-password')) || '';
    const rememberMe = dom.id('auth-remember') ? dom.id('auth-remember').checked : true;
    const errEl = dom.id('auth-error');
    const btnSubmit = dom.id('btn-auth-submit');

    if (!username || !password) {
      showAuthError('Please fill in both username and password.');
      return;
    }

    try {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Signing in…';
      if (errEl) dom.hide(errEl);

      const res = await API.login(username, password);

      // Successful auth
      AppState.currentUser = res.user;
      if (rememberMe) {
        try {
          localStorage.setItem('sheetwise_user', JSON.stringify(res.user));
          sessionStorage.removeItem('sheetwise_user');
        } catch {}
      } else {
        try {
          sessionStorage.setItem('sheetwise_user', JSON.stringify(res.user));
          localStorage.removeItem('sheetwise_user');
        } catch {}
      }

      updateUserWidget();
      navigateTo('customers');
    } catch (err) {
      showAuthError(err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Sign In →';
    }
  }

  function showAuthError(msg) {
    const errEl = dom.id('auth-error');
    if (errEl) {
      errEl.textContent = msg;
      dom.show(errEl);
    }
  }

  function updateUserWidget() {
    const widget = dom.id('user-profile-widget');
    const nameEl = dom.id('user-display-name');
    if (!widget) return;

    if (AppState.currentUser) {
      dom.text(nameEl, `👤 ${AppState.currentUser.name || AppState.currentUser.username || 'Admin'}`);
      dom.show(widget);
    } else {
      dom.hide(widget);
    }
  }

  function handleLogout() {
    AppState.currentUser = null;
    try {
      localStorage.removeItem('sheetwise_user');
      sessionStorage.removeItem('sheetwise_user');
    } catch {}
    updateUserWidget();
    navigateTo('login');
  }

  // -------------------------------------------------------------
  // PAGE ONE: CUSTOMERS DASHBOARD
  // -------------------------------------------------------------
  let cachedCustomers = [];

  async function loadCustomersDashboard() {
    const grid = dom.id('customers-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">Loading customers…</div>';

    try {
      const searchVal = dom.val(dom.id('customer-search-input')) || '';
      cachedCustomers = await API.getCustomers(searchVal);
      renderCustomersList(cachedCustomers);
    } catch (err) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9b5a54">Failed to load customers: ${err.message}</div>`;
    }
  }

  function renderCustomersList(customers) {
    const grid = dom.id('customers-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!customers || customers.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div style="font-size:32px;margin-bottom:8px">👥</div>
          <h3>No customers found</h3>
          <p>Get started by adding your first customer or try a different search.</p>
          <button id="btn-empty-add-cust" class="btn-primary">+ Add Customer</button>
        </div>
      `;
      const btn = dom.id('btn-empty-add-cust');
      if (btn) btn.onclick = () => openCustomerModal();
      return;
    }

    customers.forEach(cust => {
      const card = dom.create('div', { class: 'customer-card' });
      card.onclick = (e) => {
        // Prevent if clicked on action buttons
        if (e.target.closest('button')) return;
        navigateTo('profile', { customerId: cust.id });
      };

      const header = dom.create('div', { class: 'customer-card-header' }, [
        dom.create('div', {}, [
          dom.create('h3', { class: 'customer-card-title' }, [cust.name]),
          dom.create('div', { class: 'customer-card-phone' }, [cust.phone ? `📞 ${cust.phone}` : 'No phone'])
        ])
      ]);

      const badges = dom.create('div', { class: 'customer-card-badges' }, [
        dom.create('span', { class: 'badge projects' }, [`📁 ${cust.project_count || 0} Projects`]),
        dom.create('span', { class: 'badge quick-cuts' }, [`✂️ ${cust.quick_count || 0} Quick Cuts`])
      ]);

      const actions = dom.create('div', { class: 'customer-card-actions' });
      const editBtn = dom.create('button', { class: 'btn-secondary' }, ['Edit']);
      editBtn.onclick = (e) => {
        e.stopPropagation();
        openCustomerModal(cust);
      };

      const delBtn = dom.create('button', { class: 'btn-secondary', style: 'color:#9b5a54;border-color:#f0d1ce;' }, ['Delete']);
      delBtn.onclick = (e) => {
        e.stopPropagation();
        confirmDeleteCustomer(cust);
      };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      card.appendChild(header);
      card.appendChild(badges);
      card.appendChild(actions);

      grid.appendChild(card);
    });
  }

  // Customer Add / Edit Modal
  let editingCustomerId = null;
  function openCustomerModal(cust = null) {
    editingCustomerId = cust ? cust.id : null;
    dom.text(dom.id('customer-modal-title'), cust ? 'Edit Customer' : 'Add New Customer');
    dom.val(dom.id('cust-form-name'), cust ? cust.name : '');
    dom.val(dom.id('cust-form-phone'), cust ? (cust.phone || '') : '');
    dom.val(dom.id('cust-form-email'), cust ? (cust.email || '') : '');
    dom.val(dom.id('cust-form-address'), cust ? (cust.address || '') : '');
    dom.val(dom.id('cust-form-notes'), cust ? (cust.notes || '') : '');
    dom.show(dom.id('customer-modal'));
    document.body.style.overflow = 'hidden';
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      dom.id('cust-form-name').focus();
    }
  }

  function closeCustomerModal() {
    dom.hide(dom.id('customer-modal'));
    document.body.style.overflow = '';
    editingCustomerId = null;
  }

  async function handleSaveCustomerForm(e) {
    e.preventDefault();
    const name = dom.val(dom.id('cust-form-name')).trim();
    if (!name) {
      alert('Full name is required.');
      return;
    }
    const data = {
      name,
      phone: dom.val(dom.id('cust-form-phone')),
      email: dom.val(dom.id('cust-form-email')),
      address: dom.val(dom.id('cust-form-address')),
      notes: dom.val(dom.id('cust-form-notes')),
    };

    try {
      if (editingCustomerId) {
        await API.updateCustomer(editingCustomerId, data);
      } else {
        await API.createCustomer(data);
      }
      closeCustomerModal();
      if (AppState.currentView === 'customers') {
        loadCustomersDashboard();
      } else if (AppState.currentView === 'profile' && AppState.currentCustomer) {
        loadCustomerProfile(AppState.currentCustomer.id);
      }
    } catch (err) {
      alert(`Error saving customer: ${err.message}`);
    }
  }

  async function confirmDeleteCustomer(cust) {
    if (!window.confirm(`Are you sure you want to delete customer "${cust.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await API.deleteCustomer(cust.id);
      if (AppState.currentView === 'customers') {
        loadCustomersDashboard();
      } else {
        navigateTo('customers');
      }
    } catch (err) {
      alert(`Error deleting customer: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // PAGE TWO: CUSTOMER PROFILE & PROJECTS
  // -------------------------------------------------------------
  let currentCustomerActivity = [];

  async function loadCustomerProfile(customerId) {
    try {
      const cust = await API.getCustomer(customerId);
      AppState.currentCustomer = cust;

      // Update header
      dom.text(dom.id('profile-name'), cust.name);
      dom.text(dom.id('profile-phone'), cust.phone ? `📞 ${cust.phone}` : 'No phone');
      dom.text(dom.id('profile-email'), cust.email ? `✉️ ${cust.email}` : 'No email');
      dom.text(dom.id('profile-address'), cust.address ? `📍 ${cust.address}` : 'No address');

      // Update stats
      dom.text(dom.id('stat-projects-count'), cust.project_count || 0);
      dom.text(dom.id('stat-quick-count'), cust.quick_count || 0);

      // Load activity
      currentCustomerActivity = await API.getCustomerActivity(customerId);
      renderCustomerActivity(currentCustomerActivity);
    } catch (err) {
      alert(`Error loading profile: ${err.message}`);
      navigateTo('customers');
    }
  }

  function renderCustomerActivity(items) {
    const listEl = dom.id('customer-activity-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filterVal = (dom.val(dom.id('activity-search-input')) || '').toLowerCase();
    const sortVal = dom.val(dom.id('activity-sort-select')) || 'newest';

    let filtered = items.filter(it => it.name.toLowerCase().includes(filterVal));

    if (sortVal === 'oldest') {
      filtered.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    } else {
      filtered.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>No activity records found.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const isProject = item.type === 'project';
      const el = dom.create('div', { class: 'activity-item' });

      const main = dom.create('div', { class: 'activity-item-main' });
      const icon = dom.create('div', { class: `activity-icon ${isProject ? 'project' : 'quick'}` }, [
        isProject ? '📁' : '✂️'
      ]);

      const title = dom.create('h4', {}, [item.name]);
      title.onclick = () => {
        if (isProject) {
          openProjectInCutting(item.id);
        } else {
          openQuickCutInCutting(item.id);
        }
      };

      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';
      const meta = dom.create('div', { class: 'activity-item-meta' }, [
        dom.create('span', {}, [isProject ? 'Project' : 'Quick Cutting Record']),
        dom.create('span', {}, [`Created: ${dateStr}`])
      ]);

      const details = dom.create('div', { class: 'activity-item-details' }, [title, meta]);
      main.appendChild(icon);
      main.appendChild(details);

      const actions = dom.create('div', { class: 'activity-item-actions' });
      const openBtn = dom.create('button', { class: 'btn-secondary' }, ['Open']);
      openBtn.onclick = () => {
        if (isProject) {
          openProjectInCutting(item.id);
        } else {
          openQuickCutInCutting(item.id);
        }
      };

      const delBtn = dom.create('button', { class: 'btn-secondary', style: 'color:#9b5a54;border-color:#f0d1ce;' }, ['Delete']);
      delBtn.onclick = async () => {
        if (!window.confirm(`Delete ${isProject ? 'project' : 'quick cut'} "${item.name}"?`)) return;
        try {
          if (isProject) {
            await API.deleteProject(item.id);
          } else {
            await API.deleteRecord(item.id);
          }
          if (AppState.currentCustomer) {
            loadCustomerProfile(AppState.currentCustomer.id);
          }
        } catch (e) {
          alert(`Error deleting record: ${e.message}`);
        }
      };

      actions.appendChild(openBtn);
      actions.appendChild(delBtn);

      el.appendChild(main);
      el.appendChild(actions);
      listEl.appendChild(el);
    });
  }

  // New Project Modal
  function openNewProjectModal() {
    if (!AppState.currentCustomer) return;
    dom.val(dom.id('project-name-input'), '');
    dom.val(dom.id('project-desc-input'), '');
    dom.show(dom.id('new-project-modal'));
    document.body.style.overflow = 'hidden';
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      dom.id('project-name-input').focus();
    }
  }

  function closeNewProjectModal() {
    dom.hide(dom.id('new-project-modal'));
    document.body.style.overflow = '';
  }

  async function handleCreateProjectForm(e) {
    e.preventDefault();
    const name = dom.val(dom.id('project-name-input')).trim();
    if (!name) {
      alert('Project name is required.');
      return;
    }
    const description = dom.val(dom.id('project-desc-input'));

    try {
      const proj = await API.createProject({
        customer_id: AppState.currentCustomer.id,
        name,
        description
      });
      closeNewProjectModal();
      // Open in cutting interface directly
      openProjectInCutting(proj.id);
    } catch (err) {
      alert(`Error creating project: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // PAGE THREE: WOOD CUTTING INTERFACE INTEGRATION
  // -------------------------------------------------------------
  function setupCuttingInterface(params) {
    // Mode determination
    const tagEl = dom.id('context-badge-tag');
    const titleEl = dom.id('context-workspace-title');
    const custSelector = dom.id('quick-customer-selector-container');
    const nameSelector = dom.id('quick-name-container');
    const saveBtn = dom.id('btn-register-action');

    if (params.mode === 'project' && params.projectId) {
      AppState.isQuickCut = false;
      AppState.currentQuickRecord = null;
      dom.hide(custSelector);
      dom.hide(nameSelector);
      tagEl.className = 'context-tag project';
      dom.text(tagEl, '📁 Project');
      dom.text(saveBtn, 'Register Project');
      loadProjectIntoEngine(params.projectId);
    } else if (params.mode === 'quick') {
      AppState.isQuickCut = true;
      AppState.currentProject = null;
      dom.show(custSelector);
      dom.show(nameSelector);
      tagEl.className = 'context-tag quick';
      dom.text(tagEl, '✂️ Quick Cutting');
      dom.text(saveBtn, 'Register Cutting');
      
      if (params.recordId) {
        loadQuickRecordIntoEngine(params.recordId);
      } else {
        // Fresh quick cutting
        AppState.currentQuickRecord = null;
        AppState.quickCustomer = null;
        dom.val(dom.id('quick-customer-input'), '');
        dom.val(dom.id('quick-record-name-input'), '');
        dom.text(titleEl, 'Unassigned Quick Cut');
        updateSaveStatusIndicator('idle', 'Unsaved');
      }
    }
  }

  async function openProjectInCutting(projectId) {
    navigateTo('cutting', { mode: 'project', projectId });
  }

  async function openQuickCutInCutting(recordId) {
    navigateTo('cutting', { mode: 'quick', recordId });
  }

  async function loadProjectIntoEngine(projectId) {
    try {
      updateSaveStatusIndicator('saving', 'Loading project…');
      const proj = await API.getProject(projectId);
      AppState.currentProject = proj;
      AppState.currentCustomer = { id: proj.customer_id, name: proj.customer_name };

      dom.text(dom.id('context-workspace-title'), `${proj.name} (${proj.customer_name})`);

      if (proj.cutting_record && proj.cutting_record.cutting_data) {
        restoreEngineData(proj.cutting_record.cutting_data);
      }
      updateSaveStatusIndicator('saved', 'Saved');
    } catch (err) {
      alert(`Error loading project: ${err.message}`);
    }
  }

  async function loadQuickRecordIntoEngine(recordId) {
    try {
      updateSaveStatusIndicator('saving', 'Loading record…');
      const rec = await API.getRecord(recordId);
      AppState.currentQuickRecord = rec;
      const recDisplayName = rec.name || `Quick Cut · ${rec.id.slice(0, 8)}`;
      dom.val(dom.id('quick-record-name-input'), rec.name || '');

      if (rec.customer_id) {
        AppState.quickCustomer = { id: rec.customer_id, name: rec.customer_name };
        dom.val(dom.id('quick-customer-input'), rec.customer_name);
        dom.text(dom.id('context-workspace-title'), `${recDisplayName} (${rec.customer_name})`);
      } else {
        AppState.quickCustomer = null;
        dom.val(dom.id('quick-customer-input'), '');
        dom.text(dom.id('context-workspace-title'), recDisplayName);
      }

      if (rec.cutting_data) {
        restoreEngineData(rec.cutting_data);
      }
      updateSaveStatusIndicator('saved', 'Saved');
    } catch (err) {
      alert(`Error loading quick record: ${err.message}`);
    }
  }

  function restoreEngineData(cuttingData) {
    // Restore engine window.state and run()
    try {
      if (window.state && typeof window.renderInputs === 'function') {
        if (Array.isArray(cuttingData.stock)) window.state.stock = cuttingData.stock;
        if (Array.isArray(cuttingData.parts)) window.state.parts = cuttingData.parts;
        if (typeof cuttingData.kerf === 'number') window.state.kerf = cuttingData.kerf;
        if (typeof cuttingData.rotate === 'boolean') window.state.rotate = cuttingData.rotate;

        window.renderInputs();
        if (typeof window.run === 'function') window.run();
        // If custom layout exists
        if (cuttingData.custom_layout && typeof window.restoreLayout === 'function') {
          try {
            localStorage.setItem('sheetwise_custom_layout', JSON.stringify(cuttingData.custom_layout));
            window.restoreLayout();
            if (typeof window.draw === 'function') window.draw();
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('Error restoring engine data:', e);
    }
  }

  function extractEngineData() {
    let customLayout = null;
    try {
      const raw = localStorage.getItem('sheetwise_custom_layout');
      if (raw) customLayout = JSON.parse(raw);
    } catch (e) {}

    return {
      stock: window.state ? window.state.stock : [],
      parts: window.state ? window.state.parts : [],
      kerf: window.state ? window.state.kerf : 0.4,
      rotate: window.state ? !!window.state.rotate : false,
      result: window.result || null,
      custom_layout: customLayout,
    };
  }

  function updateSaveStatusIndicator(status, text) {
    const el = dom.id('save-status-indicator');
    if (!el) return;
    el.className = `save-status-indicator ${status}`;
    dom.text(el, `● ${text}`);
  }

  // -------------------------------------------------------------
  // REGISTRATION & CONFIRMATION FLOWS (SITUATIONS A, B, C)
  // -------------------------------------------------------------
  async function handleRegisterAction() {
    const cuttingData = extractEngineData();

    if (!AppState.isQuickCut) {
      // SITUATION A & B: Project (New or Existing)
      if (!AppState.currentProject) {
        alert('No active project found.');
        return;
      }
      try {
        updateSaveStatusIndicator('saving', 'Saving project…');
        await API.saveProjectRecord({
          project_id: AppState.currentProject.id,
          cutting_data: cuttingData
        });
        updateSaveStatusIndicator('saved', 'Project Registered');
      } catch (err) {
        updateSaveStatusIndicator('dirty', 'Save failed');
        alert(`Failed to save project: ${err.message}`);
      }
    } else {
      // SITUATION C: Quick Cutting
      handleQuickCuttingRegistration(cuttingData);
    }
  }

  async function handleQuickCuttingRegistration(cuttingData) {
    const inputVal = (dom.val(dom.id('quick-customer-input')) || '').trim();
    const recordName = (dom.val(dom.id('quick-record-name-input')) || '').trim() || null;

    // Case 1: Empty customer field
    if (!inputVal) {
      // Save as unassigned quick cutting record directly without modal
      try {
        updateSaveStatusIndicator('saving', 'Saving unassigned cut…');
        const res = await API.saveQuickRecord({
          record_id: AppState.currentQuickRecord ? AppState.currentQuickRecord.id : null,
          customer_id: null,
          name: recordName,
          cutting_data: cuttingData
        });
        AppState.currentQuickRecord = res;
        dom.text(dom.id('context-workspace-title'), res.name || 'Unassigned Quick Cut');
        updateSaveStatusIndicator('saved', 'Unassigned Cut Registered');
      } catch (err) {
        updateSaveStatusIndicator('dirty', 'Save failed');
        alert(`Failed to save quick record: ${err.message}`);
      }
      return;
    }

    // Check if customer exists
    let existingCustomer = null;
    if (AppState.quickCustomer && AppState.quickCustomer.name.toLowerCase() === inputVal.toLowerCase()) {
      existingCustomer = AppState.quickCustomer;
    } else {
      const checkRes = await API.checkCustomer(inputVal);
      if (checkRes.exists) {
        existingCustomer = checkRes.customer;
      }
    }

    if (existingCustomer) {
      // Case 2: Existing Customer Confirmation
      showExistingCustomerConfirmDialog(existingCustomer, cuttingData, recordName);
    } else {
      // Case 3: New Customer Confirmation
      showNewCustomerConfirmDialog(inputVal, cuttingData, recordName);
    }
  }

  // Dialog: Confirm Existing Customer Association
  function showExistingCustomerConfirmDialog(customer, cuttingData, recordName = null) {
    const modal = dom.id('confirm-dialog-modal');
    dom.text(dom.id('confirm-dialog-title'), 'Confirm Customer Association');
    dom.text(dom.id('confirm-dialog-message'), 'Do you want to register this cutting operation under the following customer?');
    dom.text(dom.id('confirm-dialog-target-name'), customer.name);

    const btnConfirm = dom.id('btn-confirm-action');
    const btnCancel = dom.id('btn-cancel-action');

    dom.text(btnConfirm, 'Confirm');
    dom.text(btnCancel, 'Cancel');

    btnConfirm.onclick = async () => {
      dom.hide(modal);
      try {
        updateSaveStatusIndicator('saving', 'Saving cutting record…');
        const res = await API.saveQuickRecord({
          record_id: AppState.currentQuickRecord ? AppState.currentQuickRecord.id : null,
          customer_id: customer.id,
          name: recordName,
          cutting_data: cuttingData
        });
        AppState.currentQuickRecord = res;
        AppState.quickCustomer = customer;
        const displayName = res.name || `Quick Cut · ${customer.name}`;
        dom.text(dom.id('context-workspace-title'), `${displayName} (${customer.name})`);
        updateSaveStatusIndicator('saved', 'Cutting Registered');
      } catch (err) {
        updateSaveStatusIndicator('dirty', 'Save failed');
        alert(`Failed to save record: ${err.message}`);
      }
    };

    btnCancel.onclick = () => {
      dom.hide(modal);
      updateSaveStatusIndicator('idle', 'Cancelled association');
    };

    dom.show(modal);
  }

  // Dialog: Create New Customer?
  function showNewCustomerConfirmDialog(newCustomerName, cuttingData, recordName = null) {
    const modal = dom.id('confirm-dialog-modal');
    dom.text(dom.id('confirm-dialog-title'), 'Create New Customer?');
    dom.text(dom.id('confirm-dialog-message'), 'Do you want to create this customer and register the cutting operation under their name?');
    dom.text(dom.id('confirm-dialog-target-name'), newCustomerName);

    const btnConfirm = dom.id('btn-confirm-action');
    const btnCancel = dom.id('btn-cancel-action');

    dom.text(btnConfirm, 'Create Customer & Register Cutting');
    dom.text(btnCancel, 'Cancel');

    btnConfirm.onclick = async () => {
      dom.hide(modal);
      try {
        updateSaveStatusIndicator('saving', 'Creating customer & saving…');
        // 1. Create customer
        const newCust = await API.createCustomer({ name: newCustomerName });
        // 2. Register cutting under new customer
        const res = await API.saveQuickRecord({
          record_id: AppState.currentQuickRecord ? AppState.currentQuickRecord.id : null,
          customer_id: newCust.id,
          name: recordName,
          cutting_data: cuttingData
        });
        AppState.currentQuickRecord = res;
        AppState.quickCustomer = newCust;
        const displayName = res.name || `Quick Cut · ${newCust.name}`;
        dom.text(dom.id('context-workspace-title'), `${displayName} (${newCust.name})`);
        updateSaveStatusIndicator('saved', 'Customer & Cutting Registered');
      } catch (err) {
        updateSaveStatusIndicator('dirty', 'Save failed');
        alert(`Failed: ${err.message}`);
      }
    };

    btnCancel.onclick = () => {
      dom.hide(modal);
      // Cancelled: do not create customer or associate cutting record
      updateSaveStatusIndicator('idle', 'Cancelled creation');
    };

    dom.show(modal);
  }

  // Combobox Suggestions for Customer Search in Quick Cutting
  function initCustomerAutocomplete() {
    const input = dom.id('quick-customer-input');
    const list = dom.id('quick-customer-suggestions');
    if (!input || !list) return;

    let debounceTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      AppState.quickCustomer = null; // Typing resets selection
      debounceTimer = setTimeout(async () => {
        const query = input.value.trim();
        if (!query) {
          list.innerHTML = '';
          dom.hide(list);
          return;
        }
        try {
          const results = await API.getCustomers(query);
          list.innerHTML = '';
          if (results.length > 0) {
            results.slice(0, 5).forEach(c => {
              const li = dom.create('li', {}, [`${c.name} ${c.phone ? '(' + c.phone + ')' : ''}`]);
              li.onmousedown = (e) => {
                e.preventDefault();
                input.value = c.name;
                AppState.quickCustomer = c;
                dom.hide(list);
              };
              list.appendChild(li);
            });
            dom.show(list);
          } else {
            dom.hide(list);
          }
        } catch (e) {
          dom.hide(list);
        }
      }, 200);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => dom.hide(list), 200);
    });
  }

  // Global Setup on DOM Loaded
  window.addEventListener('DOMContentLoaded', () => {
    // Nav Bar links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.target);
      });
    });

    // Brand home link
    const brandLink = dom.id('brand-home-link');
    if (brandLink) {
      brandLink.onclick = (e) => {
        e.preventDefault();
        navigateTo('customers');
      };
    }

    // Top Prominent Quick Cutting Button
    const btnTopQuick = dom.id('btn-top-quick-cut');
    if (btnTopQuick) {
      btnTopQuick.onclick = () => navigateTo('cutting', { mode: 'quick' });
    }

    // Dashboard Buttons
    const btnAddCust = dom.id('btn-add-customer');
    if (btnAddCust) btnAddCust.onclick = () => openCustomerModal();

    const btnQuickCutDash = dom.id('btn-dashboard-quick-cut');
    if (btnQuickCutDash) btnQuickCutDash.onclick = () => navigateTo('cutting', { mode: 'quick' });

    const custSearch = dom.id('customer-search-input');
    if (custSearch) {
      let t = null;
      custSearch.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => loadCustomersDashboard(), 250);
      });
    }

    // Customer Form Modal handlers
    const custForm = dom.id('customer-modal-form');
    if (custForm) custForm.onsubmit = handleSaveCustomerForm;
    const custModalClose = dom.id('cust-modal-close');
    if (custModalClose) custModalClose.onclick = closeCustomerModal;
    const custModalCancel = dom.id('cust-modal-cancel');
    if (custModalCancel) custModalCancel.onclick = closeCustomerModal;

    // Profile Page Buttons
    const btnBackCust = dom.id('btn-back-to-customers');
    if (btnBackCust) btnBackCust.onclick = () => navigateTo('customers');

    const btnEditProfile = dom.id('btn-edit-profile-customer');
    if (btnEditProfile) {
      btnEditProfile.onclick = () => {
        if (AppState.currentCustomer) openCustomerModal(AppState.currentCustomer);
      };
    }

    const btnNewProj = dom.id('btn-profile-new-project');
    if (btnNewProj) btnNewProj.onclick = openNewProjectModal;

    const projForm = dom.id('new-project-modal-form');
    if (projForm) projForm.onsubmit = handleCreateProjectForm;
    const projModalClose = dom.id('proj-modal-close');
    if (projModalClose) projModalClose.onclick = closeNewProjectModal;
    const projModalCancel = dom.id('proj-modal-cancel');
    if (projModalCancel) projModalCancel.onclick = closeNewProjectModal;

    // Profile Activity Search & Sort
    const actSearch = dom.id('activity-search-input');
    if (actSearch) actSearch.addEventListener('input', () => renderCustomerActivity(currentCustomerActivity));
    const actSort = dom.id('activity-sort-select');
    if (actSort) actSort.addEventListener('change', () => renderCustomerActivity(currentCustomerActivity));

    // Cutting Interface Header Buttons
    const btnRegister = dom.id('btn-register-action');
    if (btnRegister) btnRegister.onclick = handleRegisterAction;

    const btnExitCutting = dom.id('btn-exit-cutting');
    if (btnExitCutting) {
      btnExitCutting.onclick = () => {
        navigateTo('customers');
      };
    }

    initCustomerAutocomplete();

    // Auth form trigger
    const authForm = dom.id('auth-form');
    if (authForm) authForm.onsubmit = handleAuthSubmit;
    const btnLogout = dom.id('btn-logout');
    if (btnLogout) btnLogout.onclick = handleLogout;

    // Load persisted session if available (check localStorage, then sessionStorage)
    try {
      const savedUser = localStorage.getItem('sheetwise_user') || sessionStorage.getItem('sheetwise_user');
      if (savedUser) {
        AppState.currentUser = JSON.parse(savedUser);
      }
    } catch {}
    updateUserWidget();

    // Default view: Customers Dashboard (or Login if unauthenticated)
    if (AppState.currentUser) {
      navigateTo('customers');
    } else {
      navigateTo('login');
    }
  });

})();
